import appConfig from "../src-tauri/tauri.conf.json" with { type: "json" };

// 경로/선택 계산은 DOM·Tauri 호출 없이 유지한다. tests/ui-model.test.ts에서 직접 검증한다.

/** Finder 등록에 쓰는 확장자 목록을 재사용한다. 실제 폴더 여부는 input-routing에서 별도로 확인한다. */
export const archiveExtensions = appConfig.bundle.fileAssociations.flatMap(type => type.ext);
export function isArchivePath(path: string): boolean {
  const name = path.replace(/\\/g, "/").split("/").pop() || "";
  return archiveExtensions.includes(name.split(".").pop()!.toLowerCase()) && name.includes(".");
}
/** 자동 해제 폴더 이름을 만든다. .tar.gz와 .7z.001 같은 복합 접미사는 한 번에 제거한다. */
export function archiveStem(filename: string): string {
  const compound = /\.(?:tar\.(?:gz|gzip|zst|zstd|bz2|bzip2|xz|lzma|z)|(?:zip|7z)\.\d{3})$/i;
  if (compound.test(filename)) return filename.replace(compound, "") || "Archive";
  return (isArchivePath(filename) ? filename.replace(/\.[^.]+$/, "") : filename) || "Archive";
}
/** 충돌 확인과 스마트 해제에 쓸 최상위 이름만 반환한다. 호스트의 절대 경로를 계산하지 않는다. */
export function archiveRoots(paths: string[]): string[] {
  return [...new Set(paths.map(p => p.replace(/\\/g, "/").split("/").filter(x => x && x !== ".")[0]).filter(Boolean))];
}

export interface ExtractionSnapshot {
  archivePath: string;
  password: string | null;
  /** null은 모든 항목, 배열은 명시적 선택이다. 빈 배열과 null을 혼동하지 않는다. */
  targetFiles: string[] | null;
  rootItems: string[];
  emptySelection: boolean;
}

/**
 * 대화상자를 await하기 전에 경로·암호·선택 이름을 복사한다. UI 객체의 selected 참조를 남기지 않는다.
 * emptySelection은 "목록이 있지만 모두 해제됨"이다. 빈 아카이브는 그 자체로 유효한 전체 선택이다.
 */
export function snapshotExtraction(archivePath: string, password: string | null, files: readonly { path: string; selected?: boolean }[]): ExtractionSnapshot {
  const selected = files.filter(file => file.selected).map(file => file.path);
  return {
    archivePath,
    password,
    targetFiles: selected.length < files.length ? selected : null,
    rootItems: archiveRoots(selected),
    emptySelection: files.length > 0 && selected.length === 0
  };
}
/** 파일명은 외부 입력이므로 CSV 인용과 수식 시작 문자 처리를 함께 적용한다. */
export function csvCell(value: string | number): string {
  let text = String(value);
  // Quoting alone doesn't prevent spreadsheet formula execution from an archive filename.
  if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
