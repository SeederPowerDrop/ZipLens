import { csvCell } from "./archive-model.ts";
import { formatBytes } from "./utils.ts";

/** Rust 응답 형식. success_files와 output_paths는 같은 인덱스의 결과를 가리킨다. */
export interface ExtractionReport {
    success_files: string[];
    failed_files: [string, string][];
    output_paths: string[];
    cancelled: boolean;
}

interface SourceEntry { path: string; size: number; is_dir?: boolean; }
export interface ReportRow { path: string; size: number | null; error: string; }
export interface ReportRows { successes: ReportRow[]; failures: ReportRow[]; }
type ReportTranslationKey = "extractionReport" | "date" | "status" | "cancelled" | "error" | "success" |
    "successFiles" | "failedFiles" | "extension" | "size" | "fullPath" | "sortName" | "failed";
type TranslateReport = (key: ReportTranslationKey) => string;

// 원본 이름은 그대로 두고 비교 키만 정리한다. Core가 게시할 때 제거하는 ./와 구분자를 맞춘다.
function pathKey(path: string): string {
    const normalized = path.replace(/\\/g, "/");
    return (normalized.startsWith("/") ? "/" : "") + normalized.split("/").filter(part => part && part !== ".").join("/");
}

/**
 * 원본 크기는 한 번 인덱싱한다. 각 결과마다 전체 목록을 찾으면 10만 항목에서 O(n²)이 된다.
 * keep-both는 최상위 이름을 바꾸므로 응답만으로 원본 항목을 추측하지 않는다. 이때 크기는 null이다.
 * 성공 경로는 Core가 함께 반환한 output_paths를 사용하고, 실패에는 원래 오류 경로를 남긴다.
 */
export function buildReportRows(report: ExtractionReport, entries: readonly SourceEntry[], sourceNamesPreserved = true): ReportRows {
    const sizes = new Map<string, number>();
    if (sourceNamesPreserved) {
        for (const entry of entries) {
            if (!entry.is_dir) sizes.set(pathKey(entry.path), entry.size);
        }
    }
    const findSize = (path: string) => sizes.get(pathKey(path)) ?? null;
    // 길이가 다른 비정상 응답에서는 어느 출력이 어느 항목인지 추측하지 않는다.
    const alignedOutputs = report.success_files.length === report.output_paths.length;
    return {
        failures: report.failed_files.map(([path, error]) => ({ path, error, size: findSize(path) })),
        successes: report.success_files.map((path, index) => ({
            path: alignedOutputs ? report.output_paths[index] || path : path,
            size: alignedOutputs ? findSize(path) : null,
            error: ""
        }))
    };
}

/** 화면은 성공/실패 모두 같은 개수만 표시한다. 내보내기는 이 요약 대신 원본 전체를 사용한다. */
export function reportDisplayItems<T>(items: readonly T[]) {
    const limit = 50;
    return { items: items.slice(0, limit), hiddenCount: Math.max(0, items.length - limit) };
}

function basename(path: string): string { return path.split(/[/\\]/).pop() || path; }
function sizeText(size: number | null): string { return size === null ? "-" : formatBytes(size); }

export function formatReportTxt(report: ExtractionReport, rows: ReportRows, appName: string, date: string, translate: TranslateReport): string {
    const content = [
        `=== ${appName} · ${translate("extractionReport")} ===\n`,
        `${translate("date")}: ${date}\n`,
        `${translate("status")}: ${translate(report.cancelled ? "cancelled" : report.failed_files.length > 0 ? "error" : "success")}\n`,
        `${translate("successFiles")}: ${report.success_files.length}\n`,
        `${translate("failedFiles")}: ${report.failed_files.length}\n`,
        "=".repeat(40) + "\n\n"
    ];
    if (rows.failures.length) {
        content.push(`--- ${translate("failedFiles")} ---\n\n`);
        rows.failures.forEach((row, index) => {
            const name = basename(row.path);
            const extension = name.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || "-";
            content.push(`${index + 1}. ${name}\n`,
                `   ${translate("extension")}: ${extension}\n`,
                `   ${translate("size")}: ${sizeText(row.size)}\n`,
                `   ${translate("fullPath")}: ${row.path}\n`,
                `   ${translate("error")}: ${row.error}\n\n`);
        });
    }
    if (rows.successes.length) {
        content.push(`--- ${translate("successFiles")} ---\n\n`);
        rows.successes.forEach((row, index) => {
            const name = basename(row.path);
            const extension = name.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || "-";
            content.push(`${index + 1}. [${extension}] ${name} (${sizeText(row.size)}) — ${row.path}\n`);
        });
    }
    return content.join("");
}

export function formatReportCsv(rows: ReportRows, translate: TranslateReport): string {
    const content = ["\uFEFF" + (["status", "sortName", "extension", "size", "fullPath", "error"] as const)
        .map(key => csvCell(translate(key))).join(",") + "\n"];
    const append = (row: ReportRow, status: "failed" | "success") => {
        const name = basename(row.path);
        content.push([translate(status), name, name.split(".").pop() || "", sizeText(row.size), row.path, row.error]
            .map(csvCell).join(",") + "\n");
    };
    rows.failures.forEach(row => append(row, "failed"));
    rows.successes.forEach(row => append(row, "success"));
    return content.join("");
}
