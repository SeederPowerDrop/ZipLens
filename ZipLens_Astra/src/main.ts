import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, message, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow, LogicalSize, currentMonitor } from "@tauri-apps/api/window";
import { join, dirname } from "@tauri-apps/api/path";
import { revealItemInDir, openPath, openUrl } from "@tauri-apps/plugin-opener";
import { formatBytes, formatTime, escapeHTML } from "./utils";
import { elements, updateButtonState } from "./ui";
import { archiveStem, snapshotExtraction, type ExtractionSnapshot } from "./archive-model";
import { classifyInputPaths, type InputPath } from "./input-routing";
import { ArchiveActionGate } from "./action-session";
import { buildReportRows, formatReportTxt, formatReportCsv, reportDisplayItems, type ExtractionReport } from "./report-model";
import { showPasswordDialog } from "./password-dialog";
import { LensScene, type ProcessingOperation } from "./lens-scene";
import { HomeLensExplorer } from "./lens-explorer";
import { setLanguage, getTranslation, getCurrentLang, resolveLanguage, supportedLanguages } from "./i18n";
import { copyBitcoinAddress, getAboutLicenseError } from "./about";
import { APP_DISPLAY_NAME } from "./app-info";
import { updateUserGuide } from "./user-guide";
import { createGuideOpener } from "./guide-navigation";

import { initFileAssociations, isFileAssociationsOpen, openFileAssociations } from "./file-associations";
import "./file-associations.css";

/**
 * 화면의 진입점: 파일 선택/Finder 요청 → 입력 분류 → Tauri 명령 → 결과 확인.
 * 파일 접근과 압축은 Rust가 수행하고, 이 모듈은 선택 상태와 대화상자의 순서를 관리한다.
 * 처음 읽을 때는 runArchiveAction → routeInputs → executeExtraction/executeCompression을 따라간다.
 */

// --- 선택한 압축 파일과 마지막 결과 ---
let lastResultPath: string | null = null;
let lastResultOperation: "extract" | "compress" = "extract";
let loadedArchivePath: string | null = null;
let currentArchivePassword: string | null = null;
// 진행 UI의 수명이다. 결과창이 열린 동안에도 true일 수 있으므로 엔진 실행 여부로 쓰지 않는다.
// 더 넓은 사용자 작업(파일 선택·암호·결과 확인)의 중복 실행은 archiveActions가 막는다.
let isProcessing = false;
let cancellationRequested = false;
let activeOperation: ProcessingOperation | null = null;
let homeLens: HomeLensExplorer;
let compressionLens: LensScene;
let progressLens: LensScene;
let pendingCompressionPaths: string[] = [];
let pendingPanelFocus: HTMLElement | null = null;

function updateLensLabels() {
    homeLens?.setLanguage(getCurrentLang());
    compressionLens?.setMode("compress", getTranslation("lensCompress"));
    if (activeOperation) {
        progressLens?.setMode(activeOperation, activeOperation === "compress" ? getTranslation("lensCompress") : getTranslation("lensExtract"));
        const status = getTranslation(cancellationRequested ? "cancelling" : activeOperation === "compress" ? "compressing" : activeOperation === "extract" ? "extracting" : "loadingPreview");
        if (elements.progressStatus) elements.progressStatus.textContent = status;
        document.querySelector(".progress-bar")?.setAttribute("aria-label", status);
        if (elements.progressFill?.classList.contains("indeterminate") && elements.progressText) {
            elements.progressText.textContent = getTranslation("working");
        }
    }
}
let startTime = 0;
let timerInterval: number | null = null;
let currentProgress = 0;
// 검색·정렬·페이지 이동은 이 원본 목록을 줄이지 않는다. selected는 모든 페이지에서 공유한다.
let archiveEntries: ArchiveFileInfo[] = [];
// 압축 파일 안의 상대 경로. 호스트 파일 시스템의 작업 디렉터리가 아니다.
let archiveDirectory: string = "";
let currentPage = 0;
const PAGE_SIZE = 300;
let progressUnlisten: (() => void) | null = null;
let previewBlobUrl: string | null = null;
// Finder/CLI 진입은 큐에 남긴다. 일반 버튼의 중복 클릭은 ArchiveActionGate가 무시한다.
const pendingStartupActions: StartupAction[] = [];
let isHandlingStartupAction = false;
const archiveActions = new ArchiveActionGate(busy => {
    const app = document.getElementById("app");
    if (app) app.dataset.actionBusy = String(busy);
    updateButtonState(busy || isProcessing);
    if (!busy) {
        if (pendingPanelFocus?.getClientRects().length) pendingPanelFocus.focus();
        pendingPanelFocus = null;
        queueMicrotask(() => void processNextStartupAction());
    }
});

/**
 * 사용자 작업의 공통 진입점. action이 연 대화상자까지 await해야 잠금이 너무 일찍 풀리지 않는다.
 * 이 안에서는 execute* 함수를 직접 호출한다. 중첩 runArchiveAction은 게이트가 거절한다.
 */
async function runArchiveAction(action: () => Promise<void>): Promise<void> {
    if (isFileAssociationsOpen()) return;
    await archiveActions.run(async () => {
        try { await action(); }
        catch (error) {
            if (String(error) !== "CANCELLED") {
                await message(`${getTranslation("error")}: ${error}`, { title: getTranslation("error"), kind: "error" });
            }
        }
    });
}

interface ArchiveProgress { percent: number | null; processed_bytes: number; total_bytes: number; filename: string; }

let currentSort: { col: "name" | "size" | "compressed" | "ext", asc: boolean } = { col: "name", asc: true };

interface StartupAction {
  action: "extract" | "compress" | "settings" | "";
  paths: string[];
}

/** preview_archive 응답에 프런트엔드 전용 selected를 더한 항목. 디렉터리도 포함된다. */
interface ArchiveFileInfo {
  path: string;
  size: number;
  compressed_size: number | null;
  is_encrypted: boolean;
  is_dir: boolean;
  is_link: boolean;
  selected?: boolean;
  error?: string | null;
}

/**
 * 화면의 한 행: 실제 항목이거나 하위 항목을 묶은 가상 폴더다.
 * files는 archiveEntries의 항목을 참조하므로 행의 체크 상태 변경이 원본 선택에 반영된다.
 */
interface ArchiveBrowserItem {
    name: string;
    isDir: boolean;
    fullPath: string;
    size: number;
    totalFileCount: number;
    selectedFileCount: number;
    files: ArchiveFileInfo[];
}

type PasswordValidator = (password: string) => Promise<boolean>;

// --- 화면 초기화와 사용자 입력 연결 ---

document.addEventListener("DOMContentLoaded", async () => {
    homeLens = new HomeLensExplorer(document.getElementById("home-lens-scene")!, "home-optics", getCurrentLang(),
        () => !archiveActions.busy && !isProcessing && !isFileAssociationsOpen());
    compressionLens = new LensScene(document.getElementById("compression-lens-scene")!, "compression-optics");
    progressLens = new LensScene(document.getElementById("progress-lens-scene")!, "progress-optics");
    // Setup Password Toggle Handlers
    const setupPwdToggle = (toggleBtn: HTMLButtonElement | null, input: HTMLInputElement | null) => {
        if (!toggleBtn || !input) return;
        toggleBtn.addEventListener("click", () => {
            const isPassword = input.type === "password";
            input.type = isPassword ? "text" : "password";
            toggleBtn.setAttribute("aria-label", getTranslation(isPassword ? "hidePassword" : "showPassword"));
            toggleBtn.setAttribute("aria-pressed", String(isPassword));
            const icon = toggleBtn.querySelector("span");
            if (icon) icon.innerText = isPassword ? 'visibility_off' : 'visibility';
        });
    };

    setupPwdToggle(elements.compressPwdToggle, elements.compressPasswordInput);
    setupPwdToggle(elements.unlockPwdToggle, elements.unlockPasswordInput);

    if (elements.enablePasswordCb) {
        elements.enablePasswordCb.onchange = (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        if (elements.compressPasswordGroup) {
            if (checked) {
                elements.compressPasswordGroup.classList.add("expanded");
                elements.compressPasswordInput?.focus();
            } else {
                elements.compressPasswordGroup.classList.remove("expanded");
                if (elements.compressPasswordInput) elements.compressPasswordInput.value = "";
            }
        }
        updateCompressionPasswordHint();
    };
    }
    elements.formatSelect?.addEventListener("change", updateCompressionPasswordHint);
    updateCompressionPasswordHint();

    // Language Selector
    const langSelect = document.getElementById("lang-select") as HTMLSelectElement;
    if (langSelect) {
        langSelect.replaceChildren(...supportedLanguages.map(({ code, label }) => new Option(label, code)));
        const applyLanguage = (language: string | null) => {
            setLanguage(resolveLanguage(language, navigator.languages));
            langSelect.value = getCurrentLang();
            updateLensLabels();
            renderCompressionSelection();
            if (loadedArchivePath) renderFileList(false);
            void invoke("set_menu_language", { lang: getCurrentLang() }).catch(error => {
                console.error("Could not update native menu language", error);
            });
        };
        langSelect.onchange = () => {
            applyLanguage(langSelect.value);
            localStorage.setItem("astra-language", getCurrentLang());
        };
        applyLanguage(localStorage.getItem("astra-language"));
    }

    initFileAssociations({ onClose: () => { void processNextStartupAction(); } });

    const cancelButton = document.getElementById("btn-cancel-operation") as HTMLButtonElement;
    cancelButton.onclick = async () => {
        // 취소 명령은 요청일 뿐 완료 통지가 아니다. 원래 invoke의 종료/부분 결과를 기다린다.
        cancellationRequested = true;
        cancelButton.disabled = true;
        progressLens.setRunning(false);
        if (elements.progressStatus) elements.progressStatus.textContent = getTranslation("cancelling");
        try { await invoke("cancel_operation"); }
        catch (error) {
            cancellationRequested = false;
            cancelButton.disabled = false;
            progressLens.setRunning(isProcessing);
            updateLensLabels();
            showToast(String(error), "error");
        }
    };
    // percent=null은 측정 불가다. 애니메이션의 움직임을 실제 진행률로 바꾸지 않는다.
    progressUnlisten = await listen<ArchiveProgress>("archive_progress", ({ payload }) => {
        if (!isProcessing) return;
        currentProgress = payload.percent ?? 0;
        progressLens.setProgress(payload.percent);
        const bar = document.querySelector(".progress-bar");
        if (payload.percent === null) bar?.removeAttribute("aria-valuenow");
        else bar?.setAttribute("aria-valuenow", String(payload.percent));
        elements.progressFill?.classList.toggle("indeterminate", payload.percent === null);
        if (elements.progressFill) elements.progressFill.style.width = `${payload.percent ?? 35}%`;
        if (elements.progressText) elements.progressText.textContent = payload.percent === null ? getTranslation("working") : `${payload.percent}%`;
        handleFilenameEvent(payload.filename);
    });
    const collectStartupActions = async () => {
        pendingStartupActions.push(...await invoke<StartupAction[]>("take_startup_actions"));
        await processNextStartupAction();
    };
    await listen("startup_actions_available", collectStartupActions);
    await collectStartupActions();
    window.addEventListener("beforeunload", () => { progressUnlisten?.(); if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl); });

    // Button Listeners
    if (elements.btnOpenArchive) {
        elements.btnOpenArchive.onclick = () => chooseInputs();
    }
    document.getElementById("btn-choose-files")!.onclick = event => {
        event.stopPropagation();
        void chooseInputs();
    };
    document.getElementById("btn-choose-folders")!.onclick = event => {
        event.stopPropagation();
        void chooseInputs(true);
    };
    
    if (elements.btnExtract) elements.btnExtract.onclick = () => extractArchive();
    if (elements.btnSmartExtract) elements.btnSmartExtract.onclick = () => smartExtractArchive();
    
    if (elements.btnCompress) {
        elements.btnCompress.onclick = () => {
            if (archiveActions.busy || isProcessing) return;
            if (document.getElementById("app")!.dataset.composing === "true") closeCompressionPanel();
            else showCompressionPanel([]);
        };
    }
    if (elements.btnCancelCompress) {
        elements.btnCancelCompress.onclick = () => {
            closeCompressionPanel();
        };
    }
    document.getElementById("btn-change-compression-source")!.onclick = () => {
        if (!archiveActions.busy && !isProcessing) showCompressionPanel([]);
    };
    if (elements.btnConfirmCompress) {
        elements.btnConfirmCompress.onclick = confirmCompression;
    }

    // About Modal Listeners
    const userGuide = document.getElementById("user-guide-dialog") as HTMLDialogElement | null;
    const guideLinks = ["home-user-guide", "about-user-guide"]
        .map(id => document.getElementById(id)).filter((link): link is HTMLElement => link !== null);
    const openGuide = createGuideOpener({
        getLanguage: getCurrentLang,
        openUrl,
        setBusy: busy => guideLinks.forEach(link => {
            link.setAttribute("aria-busy", String(busy));
            link.setAttribute("aria-disabled", String(busy));
        }),
        showOfflineGuide: (language, notice) => {
            if (!userGuide) throw new Error("The bundled user guide is unavailable.");
            updateUserGuide(language, notice);
            if (!userGuide.open) userGuide.showModal();
            const content = document.getElementById("user-guide-content");
            if (content) content.scrollTop = 0;
        },
    });
    for (const guideLink of guideLinks) {
        guideLink.onclick = event => {
            event.preventDefault();
            event.stopPropagation(); // The home link sits inside the file-selection drop zone.
            void openGuide().catch(error => {
                console.error("Could not show the user guide", error);
                void message(String(error), { title: getTranslation("error"), kind: "error" })
                    .catch(dialogError => console.error("Could not show guide error", dialogError));
            });
        };
    }
    document.getElementById("user-guide-close")?.addEventListener("click", () => userGuide?.close());
    const bitcoinToggle = document.getElementById("about-bitcoin-toggle");
    const bitcoinPanel = document.getElementById("about-bitcoin");
    if (bitcoinToggle && bitcoinPanel) {
        bitcoinToggle.onclick = () => {
            const expanded = bitcoinPanel.hidden;
            if (!expanded && bitcoinPanel.contains(document.activeElement)) bitcoinToggle.focus();
            bitcoinPanel.hidden = !expanded;
            bitcoinToggle.setAttribute("aria-expanded", String(expanded));
            if (expanded) bitcoinPanel.scrollIntoView({ block: "nearest" });
        };
    }
    const bitcoinCopy = document.getElementById("about-bitcoin-copy");
    if (bitcoinCopy) bitcoinCopy.onclick = () => { void copyBitcoinAddress(getCurrentLang()); };
    if (elements.btnAbout && elements.aboutModal) {
        elements.btnAbout.onclick = () => {
            elements.aboutModal!.style.display = "flex";
        };
    }
    const closeAbout = () => { if (elements.aboutModal) elements.aboutModal.style.display = "none"; };
    if (elements.aboutClose) elements.aboutClose.onclick = closeAbout;
    if (elements.aboutCloseX) elements.aboutCloseX.onclick = closeAbout;
    if (elements.aboutLicenses) {
        elements.aboutLicenses.onclick = async () => {
            const button = elements.aboutLicenses;
            button.disabled = true;
            button.setAttribute("aria-busy", "true");
            try {
                await invoke("open_license_folder");
            } catch (error) {
                console.error("Could not open bundled licenses", error);
                await message(getAboutLicenseError(getCurrentLang()), { title: getTranslation("error"), kind: "error" });
            } finally {
                button.disabled = false;
                button.removeAttribute("aria-busy");
            }
        };
    }
    
    if (elements.selectAllBtn) {
        elements.selectAllBtn.onclick = () => {
            // Select all files
            archiveEntries.forEach(f => f.selected = !f.error);
            renderFileList();
        };
    }

    if (elements.deselectAllBtn) {
        elements.deselectAllBtn.onclick = () => {
            // Deselect all files
            archiveEntries.forEach(f => f.selected = false);
            renderFileList();
        };
    }

    if (elements.toggleAllBtn) {
        elements.toggleAllBtn.onclick = () => {
            // Invert selection for all files
            archiveEntries.forEach(f => f.selected = !f.error && !f.selected);
            renderFileList();
        };
    }

    if (elements.searchInput) {
        elements.searchInput.style.display = "block";
        let searchTimer = 0;
        elements.searchInput.oninput = () => { clearTimeout(searchTimer); searchTimer = window.setTimeout(() => renderFileList(), 120); };
    }

    document.querySelectorAll(".sort-btn").forEach(btn => {
        (btn as HTMLButtonElement).onclick = (e) => {
            const target = e.currentTarget as HTMLButtonElement;
            const sortCol = target.getAttribute("data-sort") as "name" | "size" | "compressed" | "ext";
            
            if (currentSort.col === sortCol) {
                currentSort.asc = !currentSort.asc;
            } else {
                currentSort.col = sortCol;
                currentSort.asc = true;
            }

            // Update UI
            document.querySelectorAll(".sort-btn").forEach(b => {
                b.classList.remove("active");
                const arrow = b.querySelector(".sort-arrow");
                if (arrow) arrow.textContent = "";
            });
            target.classList.add("active");
            const arrow = target.querySelector(".sort-arrow");
            if (arrow) arrow.textContent = currentSort.asc ? "▲" : "▼";

            renderFileList();
        };
    });

    elements.btnReveal!.onclick = async () => {
        if (lastResultPath) {
            try {
                await revealItemInDir(lastResultPath);
            } catch (e) {
                await openPath(lastResultOperation === "compress" ? await dirname(lastResultPath) : lastResultPath).catch(() => {});
            }
        }
    };

    elements.dropZone!.onclick = () => chooseInputs();
    elements.dropZone!.onkeydown = event => {
        if (event.target === elements.dropZone && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            void chooseInputs();
        }
    };
});

// --- 네이티브 이벤트와 대기 중인 Finder/CLI 요청 ---
listen<{ paths: string[] }>("tauri://drag-enter", () => {
    if (archiveActions.busy || isProcessing || isFileAssociationsOpen()) return;
    elements.dropZone?.classList.add("active");
});

listen("tauri://drag-leave", () => {
    elements.dropZone?.classList.remove("active");
});

listen("open_about", () => {
    if (elements.aboutModal) elements.aboutModal.style.display = "flex";
});

listen<{ paths: string[] }>("tauri://drag-drop", async (event) => {
    elements.dropZone?.classList.remove("active");
    if (archiveActions.busy || isProcessing || isFileAssociationsOpen()) return;

    const droppedPaths = event.payload.paths;
    if (!droppedPaths || droppedPaths.length === 0) return;

    await runArchiveAction(() => routeInputs(droppedPaths));
});

/** 한 요청씩 소비한다. 작업/설정/압축 옵션 창이 닫힐 때 다시 호출되어 다음 요청을 처리한다. */
async function processNextStartupAction() {
    if (isHandlingStartupAction || archiveActions.busy || isProcessing || isFileAssociationsOpen() || document.getElementById("app")?.dataset.composing === "true" || !pendingStartupActions.length) return;
    isHandlingStartupAction = true;
    try {
        const next = pendingStartupActions.shift()!;
        if (next.action === "settings") { openFileAssociations(); return; }
        if (!next.paths.length) return;
        if (next.action === "compress") await startCompression(next.paths);
        else {
            await loadArchivePreview(next.paths[0]);
            if (next.paths.length > 1) showToast("여러 압축 파일 중 첫 번째 파일을 열었습니다. / Opened the first archive.");
        }
    } finally {
        isHandlingStartupAction = false;
        // 저장창 취소는 setProcessing(false)를 거치지 않으므로 여기에서도 다음 요청을 재개한다.
        if (pendingStartupActions.length && !archiveActions.busy && !isProcessing && !isFileAssociationsOpen()) {
            queueMicrotask(() => void processNextStartupAction());
        }
    }
}

// --- 입력 분류와 압축 옵션 ---

async function chooseInputs(directory = false) {
    await runArchiveAction(async () => {
        // macOS type filters can hide valid ALZ/EGG files before UTI registration.
        const selected = await open({ multiple: true, directory, title: getTranslation(directory ? "chooseFolders" : "selectInputs") });
        if (selected !== null) await routeInputs(Array.isArray(selected) ? selected : [selected]);
    });
}

/** 게이트 안에서 호출한다. 확장자만 보면 .zip이라는 폴더를 오인하므로 먼저 실제 경로 종류를 조회한다. */
async function routeInputs(paths: string[]) {
    const inputs = await invoke<InputPath[]>("inspect_input_paths", { paths });
    const route = classifyInputPaths(inputs);
    if (route.kind === "extract") {
        await executeArchivePreview(route.path);
        if (route.archiveCount > 1 && loadedArchivePath === route.path) {
            showToast(getTranslation("firstArchiveOpened")
                .replace("{count}", String(route.archiveCount))
                .replace("{name}", () => route.path.split(/[\\/]/).pop() || route.path));
        }
    } else if (route.kind === "compress") {
        showCompressionPanel(route.paths);
    }
}

function updateCompressionPasswordHint() {
    const hint = document.getElementById("zip-password-hint");
    if (hint) hint.hidden = elements.formatSelect?.value !== "zip" || !elements.enablePasswordCb?.checked;
}

function renderCompressionSelection() {
    const hasSelection = pendingCompressionPaths.length > 0;
    const selection = document.getElementById("compression-selection")!;
    selection.hidden = !hasSelection;
    document.getElementById("compression-source-field")!.hidden = hasSelection;
    document.getElementById("compression-selection-summary")!.textContent = getTranslation("inputSelectionSummary")
        .replace("{count}", String(pendingCompressionPaths.length));
    const list = document.getElementById("compression-selection-list")!;
    list.replaceChildren(...pendingCompressionPaths.map(path => {
        const item = document.createElement("li");
        item.dir = "auto";
        item.textContent = path.replace(/[/\\]+$/, "").split(/[\\/]/).pop() || path;
        item.title = path;
        return item;
    }));
    elements.btnConfirmCompress!.textContent = getTranslation(hasSelection ? "compressSelectedItems" : "confirmCompress");
}

function showCompressionPanel(paths: string[]) {
    pendingCompressionPaths = [...paths];
    renderCompressionSelection();
    elements.compressionOptions!.style.display = "block";
    document.getElementById("app")!.dataset.composing = "true";
    updateButtonState(archiveActions.busy || isProcessing);
    focusPanelControl(elements.formatSelect);
}

function closeCompressionPanel() {
    pendingCompressionPaths = [];
    elements.compressionOptions!.style.display = "none";
    document.getElementById("app")!.dataset.composing = "false";
    renderCompressionSelection();
    updateButtonState(archiveActions.busy || isProcessing);
    focusPanelControl(elements.dropZone!);
    queueMicrotask(() => void processNextStartupAction());
}

function focusPanelControl(control: HTMLElement) {
    if (archiveActions.busy || isProcessing) pendingPanelFocus = control;
    else control.focus();
}

async function confirmCompression() {
    await runArchiveAction(async () => {
        // await 전에 입력과 옵션을 복사한다. 저장창을 기다리는 동안 UI를 다시 읽지 않는다.
        const options = readCompressionOptions();
        let paths = [...pendingCompressionPaths];
        if (!paths.length) {
            const directory = (document.getElementById("compression-source") as HTMLSelectElement).value === "folder";
            const selected = await open({ directory, multiple: true, title: getTranslation(directory ? "selectFolderToCompress" : "selectItemsToCompress") });
            if (!selected || !selected.length) return;
            paths = Array.isArray(selected) ? selected : [selected];
            showCompressionPanel(paths);
        }
        await executeCompression(paths, options);
    });
}

// --- 압축 파일 목록과 항목 미리보기 ---

/** Finder 등 아직 작업 게이트를 잡지 않은 호출자를 위한 진입점. */
async function loadArchivePreview(path: string, pwAttempt: string | null = null) {
    await runArchiveAction(() => executeArchivePreview(path, pwAttempt));
}

/**
 * 호출자가 게이트를 소유해야 한다. 목록/암호 확인에 성공한 뒤에만 현재 압축 파일을 교체한다.
 * 취소하거나 읽기에 실패하면 기존 파일 선택을 유지한다.
 */
async function executeArchivePreview(path: string, pwAttempt: string | null = null) {
    if (isProcessing) return;
    setProcessing(true, "preview");
    let files: ArchiveFileInfo[] = [];
    let acceptedPassword = pwAttempt;

    const attemptLoad = async (pw: string | null) => {
        return await invoke<ArchiveFileInfo[]>("preview_archive", { archivePath: path, password: pw });
    };

    try {
        try {
            files = await attemptLoad(pwAttempt);
        } catch (err: any) {
            if (err === "PASSWORD_REQUIRED") {
                const validator = async (testPw: string) => {
                    try {
                        files = await attemptLoad(testPw);
                        acceptedPassword = testPw;
                        return true;
                    } catch (e: any) {
                        if (String(e) === "PASSWORD_REQUIRED") return false;
                        throw e;
                    }
                };
                const pw = await requestPassword(validator, pwAttempt !== null);
                if (pw === null) {
                    setProcessing(false);
                    return;
                }
            } else if (err === "CORRUPTED_ARCHIVE") {
                await message(getTranslation("corruptedArchiveMsg"), { title: getTranslation("corruptedArchiveTitle"), kind: "error" });
                setProcessing(false);
                return;
            } else {
                throw err;
            }
        }
        
        loadedArchivePath = path;
        currentArchivePassword = acceptedPassword;
        if (elements.dropZone) elements.dropZone.classList.add("loaded");
        const app = document.getElementById("app")!;
        app.dataset.archiveLoaded = "true";
        app.dataset.composing = "false";
        pendingCompressionPaths = [];
        renderCompressionSelection();
        if (elements.compressionOptions) elements.compressionOptions.style.display = "none";
        document.getElementById("archive-browser")!.hidden = false;

        // Update stats initially
        archiveEntries = files.map(f => ({ ...f, selected: !f.error }));
        archiveDirectory = "";
        if (elements.searchInput) elements.searchInput.value = "";
        
        renderFileList();
        await autoResizeWindow(files.length);

        // Show warning if some entries have errors
        const errorFiles = files.filter(f => f.error);
        if (errorFiles.length > 0) {
            const warnMsg = getTranslation("archiveWarningDesc")
                .replace("{errCount}", errorFiles.length.toString())
                .replace("{totalCount}", files.length.toString());
            await message(warnMsg, { title: getTranslation("archiveWarningTitle"), kind: "warning" });
        }

        if (elements.btnExtract) {
            const label = elements.btnExtract.querySelector(':scope > span');
            if (label) label.textContent = getTranslation("btnExtract");
            (elements.btnExtract as HTMLButtonElement).disabled = false;
        }
        const dropTextNode = document.querySelector(".drop-text");
        if (dropTextNode) {
            const filename = path.split(/[\\/]/).pop() || path;
            dropTextNode.textContent = filename;
            elements.dropZone!.title = path;
        }
        focusPanelControl(elements.btnExtract!);
    } catch (err: any) {
        if (String(err) === "CANCELLED") return;
        await message(getTranslation("previewFailed").replace("{error}", () => String(err)), { title: getTranslation("error"), kind: "error" });
    } finally {
        setProcessing(false);
    }
}

/** 전체 선택은 archiveEntries에 유지하고, 표시할 행만 검색·폴더 묶기·정렬·페이지 처리한다. */
function renderFileList(resetPage = true) {
    if (resetPage) currentPage = 0;
    const query = elements.searchInput?.value.trim().normalize("NFC").toLocaleLowerCase() || "";
    if (!elements.logContainer) return;
    elements.logContainer.innerHTML = "";
    elements.logContainer.style.display = "flex";

    // 1. Calculate global stats
    let selCount = 0, selSize = 0, totalSize = 0, totalCount = 0;
    archiveEntries.forEach(f => {
        // Skip directory entries themselves for counting files
        if (!f.path.endsWith('/') && !f.path.endsWith('\\')) {
            totalCount++;
            totalSize += (f.size || 0);
            if (f.selected) {
                selCount++;
                selSize += (f.size || 0);
            }
        }
    });

    if (elements.previewStatsMain && elements.previewStatsSub) {
        elements.previewStatsMain.innerText = `${selCount} / ${totalCount} ${getTranslation("filesSelected")}`;
        elements.previewStatsSub.innerText = `(${getTranslation("extractedSize")}: ${formatBytes(selSize)} / ${getTranslation("total")}: ${formatBytes(totalSize)})`;
    }

    // 2. Render Breadcrumbs
    if (elements.breadcrumbContainer) {
        elements.breadcrumbContainer.innerHTML = "";
        const parts = archiveDirectory.replace(/\\/g, '/').split('/').filter(p => p);
        
        const createCrumb = (text: string, path: string, isLast: boolean) => {
            const span = document.createElement("button");
            span.type = "button";
            // Each path component keeps its own writing direction inside the LTR hierarchy.
            span.dir = "auto";
            span.textContent = text;
            span.title = text;
            if (!isLast) {
                span.style.cursor = "pointer";
                span.style.color = "var(--accent-hover)";
                span.style.textDecoration = "underline";
                span.onclick = () => {
                    archiveDirectory = path;
                    renderFileList();
                };
            } else {
                span.setAttribute("aria-current", "location");
                span.style.color = "var(--text-color)";
                span.style.fontWeight = "600";
            }
            return span;
        };

        elements.breadcrumbContainer.appendChild(createCrumb(getTranslation("rootFolder"), "", parts.length === 0));
        
        let buildPath = "";
        parts.forEach((p, i) => {
            const sep = document.createElement("span");
            sep.innerText = " / ";
            sep.style.color = "var(--text-muted)";
            sep.style.margin = "0 4px";
            elements.breadcrumbContainer.appendChild(sep);
            
            buildPath += p + "/";
            elements.breadcrumbContainer.appendChild(createCrumb(p, buildPath, i === parts.length - 1));
        });
    }

    // 3. Process current directory contents
    const itemsMap = new Map<string, ArchiveBrowserItem>();
    const normCurDir = archiveDirectory ? archiveDirectory.replace(/\\/g, '/') : "";

    archiveEntries.forEach(f => {
        const normPath = f.path.replace(/\\/g, '/');
        if (query ? !f.is_dir && normPath.normalize("NFC").toLocaleLowerCase().includes(query) : normPath.startsWith(normCurDir)) {
            const relPath = query ? normPath : normPath.substring(normCurDir.length);
            if (relPath === "") return; // Skip the directory entry itself

            const parts = query ? [relPath] : relPath.split('/');
            const name = parts[0];
            const isDir = parts.length > 1 || (parts.length === 1 && f.path.endsWith('/'));

            if (!name) return;

            if (!itemsMap.has(name)) {
                itemsMap.set(name, {
                    name,
                    isDir,
                    fullPath: normCurDir + name + (isDir ? '/' : ''),
                    size: 0,
                    totalFileCount: 0,
                    selectedFileCount: 0,
                    files: [] as ArchiveFileInfo[]
                });
            }

            const item = itemsMap.get(name)!;
            // Accumulate sizes and counts for all files inside this path
            if (!f.path.endsWith('/') && !f.path.endsWith('\\')) {
                item.size += (f.size || 0);
                item.totalFileCount++;
                if (f.selected) item.selectedFileCount++;
            }
            item.files.push(f);
        }
    });

    // 4. Render Items
    // "Up a directory" button if not in root
    if (normCurDir !== "") {
        const upItem = document.createElement("div");
        upItem.className = "log-item";
        upItem.style.cursor = "pointer";
        upItem.innerHTML = `<span class="file-name" style="padding-inline-start:24px;">📁 .. (${getTranslation("upToParent")})</span>`;
        upItem.onclick = () => {
            const parts = normCurDir.split('/').filter(p => p);
            parts.pop();
            archiveDirectory = parts.length > 0 ? parts.join('/') + '/' : '';
            renderFileList();
        };
        elements.logContainer.appendChild(upItem);
    }

    const sortedItems = Array.from(itemsMap.values()).sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        
        let result = 0;
        if (currentSort.col === "name") {
            result = a.name.localeCompare(b.name);
        } else if (currentSort.col === "size") {
            result = a.size - b.size;
        } else if (currentSort.col === "compressed") {
            const compA = a.files.reduce((acc, entry) => acc + (entry.compressed_size || 0), 0);
            const compB = b.files.reduce((acc, entry) => acc + (entry.compressed_size || 0), 0);
            result = compA - compB;
        } else if (currentSort.col === "ext") {
            const extA = a.isDir ? "" : (a.name.split('.').pop() || "");
            const extB = b.isDir ? "" : (b.name.split('.').pop() || "");
            result = extA.localeCompare(extB);
        }
        return currentSort.asc ? result : -result;
    });

    const pageCount = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, pageCount - 1);
    if (elements.searchMatchesText) elements.searchMatchesText.textContent = query ? String(sortedItems.length) : "";
    sortedItems.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).forEach(item => {
        const domItem = document.createElement("div");
        domItem.className = "log-item";
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "file-checkbox";
        checkbox.disabled = archiveActions.busy;
        
        if (item.totalFileCount > 0) {
            checkbox.checked = item.selectedFileCount === item.totalFileCount;
            checkbox.indeterminate = item.selectedFileCount > 0 && item.selectedFileCount < item.totalFileCount;
        } else {
            checkbox.checked = item.files.length > 0 ? item.files.every((entry) => entry.selected) : false;
        }

        checkbox.onclick = (e) => {
            e.stopPropagation();
            const newState = checkbox.checked;
            item.files.forEach((f: ArchiveFileInfo) => f.selected = !f.error && newState);
            renderFileList(false);
        };

        const info = document.createElement("div");
        info.className = "file-info-row";
        
        if (item.isDir) {
            const errorCount = item.files.filter((f: ArchiveFileInfo) => f.error).length;
            const errBadge = errorCount > 0 ? `<span style="color:#ef4444;margin-inline-start:6px;font-size:11px;" title="${escapeHTML(getTranslation("failedFiles"))}: ${errorCount}">⚠️ ${errorCount}</span>` : '';
            info.innerHTML = `<span class="file-name" style="cursor:pointer; color:var(--accent-color);"><span style="margin-inline-end:6px;">📁</span><bdi dir="auto">${escapeHTML(item.name)}</bdi>${errBadge}</span>
                             <div class="file-size-column">
                                 <div style="font-size:11px;font-family:monospace;"><span style="color:var(--text-muted);font-size:10px;">${getTranslation("size")}</span> ${formatBytes(item.size)}</div>
                             </div>`;
            info.querySelector('.file-name')?.addEventListener('click', (e) => {
                e.stopPropagation();
                archiveDirectory = item.fullPath;
                renderFileList();
            });
        } else {
            const fileObj = item.files[0];
            const badge = fileObj.path.match(/\.([^.\\/]+)$/)?.[1]?.toUpperCase().substring(0, 5) || "FILE";
            const lock = fileObj.is_encrypted ? '🔒 ' : '';
            const hasError = fileObj.error;
            const errIcon = hasError ? `<span style="color:#ef4444;margin-inline-end:4px;" title="${escapeHTML(String(hasError))}">⚠️</span>` : '';
            const errStyle = hasError ? 'opacity:0.6;' : '';
            info.innerHTML = `<span class="file-name" style="${errStyle}">${errIcon}${lock}<span class="ext-badge" dir="ltr" style="${hasError ? 'background:rgba(239,68,68,0.15);color:#ef4444;border-color:rgba(239,68,68,0.3);' : ''}">${escapeHTML(badge)}</span><bdi dir="auto">${escapeHTML(item.name)}</bdi></span>
                             <div class="file-size-column">
                                 <div style="font-size:11px;font-family:monospace;"><span style="color:var(--text-muted);font-size:10px;">${getTranslation("size")}</span> ${formatBytes(fileObj.size)}</div>
                                 ${hasError ? `<div style="font-size:10px;color:#ef4444;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(String(hasError))}">${escapeHTML(getTranslation("error"))}: ${escapeHTML(String(hasError))}</div>` : ''}
                             </div>`;
        }

        const fileName = info.querySelector<HTMLElement>('.file-name');
        if (fileName) fileName.title = item.name;
        domItem.appendChild(checkbox);
        domItem.appendChild(info);
        let singleClickTimer = 0;
        domItem.tabIndex = 0;
        domItem.addEventListener("click", (e) => {
            if (archiveActions.busy) return;
            if (e.target !== checkbox && !item.isDir) {
                clearTimeout(singleClickTimer);
                singleClickTimer = window.setTimeout(() => {
                    if (archiveActions.busy) return;
                    checkbox.checked = !checkbox.checked;
                    item.files.forEach((f: ArchiveFileInfo) => f.selected = !f.error && checkbox.checked);
                    renderFileList(false);
                }, 250);
            } else if (e.target !== checkbox && item.isDir) {
                archiveDirectory = item.fullPath;
                renderFileList();
            }
        });
        
        domItem.addEventListener("dblclick", async (e) => {
            clearTimeout(singleClickTimer);
            if (item.isDir) return;
            e.stopPropagation();
            if (archiveActions.busy || isProcessing || !loadedArchivePath) return;
            const archivePath = loadedArchivePath;
            const fileObj = item.files[0];
            if (fileObj.error || fileObj.is_link) return;
            const ext = item.name.split('.').pop()?.toLowerCase() || '';
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
            const isText = ['txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'rs', 'log', 'csv', 'xml', 'yaml', 'yml', 'ini', 'toml'].includes(ext);

            await runArchiveAction(async () => {
                try {
                    setProcessing(true, "preview", `${getTranslation("loadingPreview")} ${item.name}`);
                    if ((isImage || isText) && fileObj.size < 20 * 1024 * 1024) {
                        try {
                            const bytes = await withArchivePassword<number[]>(password => invoke("extract_file_memory", {
                                archivePath, targetFile: fileObj.path, password
                            }));
                            if (!bytes) return;
                        
                            const uint8Arr = new Uint8Array(bytes);
                        
                            if (elements.viewerModal && elements.viewerTitle && elements.viewerImg && elements.viewerText) {
                                elements.viewerTitle.innerText = item.name;
                                elements.viewerImg.style.display = 'none';
                                elements.viewerText.style.display = 'none';
                            
                                if (isImage) {
                                    const blob = new Blob([uint8Arr]);
                                    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
                                    const url = URL.createObjectURL(blob);
                                    previewBlobUrl = url;
                                    elements.viewerImg.src = url;
                                    elements.viewerImg.style.display = 'block';

                                } else {
                                    const text = new TextDecoder('utf-8').decode(uint8Arr);
                                    elements.viewerText.textContent = text;
                                    elements.viewerText.style.display = 'block';
                                }
                            
                                elements.viewerModal.style.display = 'flex';
                            
                                // 엔진 작업은 끝나도 뷰어를 닫을 때까지 사용자 작업의 게이트는 유지한다.
                                const closed = new Promise<void>(resolve => {
                                    const app = document.getElementById("app")!;
                                    app.inert = true;
                                    const close = () => {
                                        if (elements.viewerModal) elements.viewerModal.style.display = 'none';
                                        if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
                                        previewBlobUrl = null;
                                        elements.viewerImg.removeAttribute("src");
                                        elements.viewerClose.onclick = null;
                                        document.removeEventListener("keydown", onKeyDown);
                                        app.inert = false;
                                        resolve();
                                    };
                                    const onKeyDown = (event: KeyboardEvent) => {
                                        if (event.key === "Escape") { event.preventDefault(); close(); }
                                        if (event.key === "Tab") { event.preventDefault(); elements.viewerClose.focus(); }
                                    };
                                    elements.viewerClose.onclick = close;
                                    document.addEventListener("keydown", onKeyDown);
                                    elements.viewerClose.focus();
                                });
                                setProcessing(false);
                                await closed;
                                return;
                            }
                        } catch (memErr) {
                            // A decoding error is not permission to auto-open an extracted file.
                            throw memErr;
                        }
                    }

                    // Fallback to disk extraction
                    setProcessing(true, "extract", `${getTranslation("extracting")} ${item.name}`);
                    const extractedPath = await withArchivePassword<string>(password => invoke("prepare_external_preview", {
                        archivePath, targetFile: fileObj.path, password
                    }));
                    if (extractedPath) {
                        await openPath(extractedPath);
                        showToast(getTranslation("fileOpened").replace("{name}", () => item.name), "success");
                    }
                } catch (err: any) {
                    console.error("Double click extract error", err);
                    if (String(err) !== "CANCELLED") showToast(getTranslation("openFailed").replace("{error}", () => String(err)), "error");
                } finally {
                    setProcessing(false);
                }
            });
        });

        domItem.addEventListener("keydown", e => {
            if (e.key !== "Enter") return;
            if (item.isDir) { archiveDirectory = item.fullPath; renderFileList(); }
            else domItem.dispatchEvent(new MouseEvent("dblclick"));
        });
        elements.logContainer?.appendChild(domItem);
    });
    if (pageCount > 1) {
        const navigation = document.createElement("div");
        navigation.className = "astra-pagination";
        for (const [label, delta] of [["←", -1], ["→", 1]] as const) {
            const button = document.createElement("button");
            button.textContent = label;
            button.setAttribute("aria-label", getTranslation(delta === -1 ? "previousPage" : "nextPage"));
            button.className = "modern-btn secondary";
            button.disabled = currentPage + delta < 0 || currentPage + delta >= pageCount;
            button.onclick = () => { currentPage += delta; renderFileList(false); };
            navigation.appendChild(button);
            if (delta === -1) navigation.appendChild(document.createTextNode(`${currentPage + 1} / ${pageCount} · ${sortedItems.length}`));
        }
        elements.logContainer.appendChild(navigation);
    }
}

// --- 선택 스냅샷을 사용하는 압축 해제와 압축 실행 ---

/** 선택된 최상위 항목이 여럿이면 압축 파일 이름의 폴더를 만들어 풀 위치를 정한다. */
async function smartExtractArchive() {
    await runArchiveAction(async () => {
        if (!loadedArchivePath) return;
        const snapshot = snapshotExtraction(loadedArchivePath, currentArchivePassword, archiveEntries);
        if (snapshot.emptySelection) {
            await message(getTranslation("noFilesSelected"), { title: getTranslation("error"), kind: "error" });
            return;
        }
        let destDir = await dirname(snapshot.archivePath);
        if (snapshot.rootItems.length > 1) {
            const archiveName = snapshot.archivePath.replace(/\\/g, '/').split('/').pop() || "Archive";
            const archiveBase = archiveStem(archiveName);
            destDir = await join(destDir, archiveBase);
        }
        await executeExtraction(snapshot, destDir);
    });
}

async function extractArchive() {
    await runArchiveAction(async () => {
        if (!loadedArchivePath) {
            const selected = await open({ multiple: false, title: getTranslation("selectArchive") });
            if (selected) await executeArchivePreview(selected);
            return;
        }
        const snapshot = snapshotExtraction(loadedArchivePath, currentArchivePassword, archiveEntries);
        if (snapshot.emptySelection) {
            await message(getTranslation("noFilesSelected"), { title: getTranslation("error"), kind: "error" });
            return;
        }
        const destDir = await open({ directory: true, title: getTranslation("extractTo") });
        if (!destDir) return;
        await executeExtraction(snapshot, destDir);
    });
}

/**
 * 호출자가 확보한 선택 스냅샷으로 충돌 확인 → 암호 재시도 → 결과 확인을 이어 간다.
 * dialog await 뒤에 archiveEntries를 다시 읽으면 사용자가 요청한 대상과 달라질 수 있다.
 */
async function executeExtraction(snapshot: ExtractionSnapshot, destDir: string) {
    try {
        lastResultPath = destDir;
        lastResultOperation = "extract";
        const conflicts = await invoke<string[]>("check_conflicts", { destPath: destDir, rootItems: snapshot.rootItems });
        let conflictResolution = "overwrite";

        if (conflicts.length > 0) {
            const result = await requestConflictResolution(conflicts);
            if (!result || result === "cancel") return;
            conflictResolution = result;
        }

        setProcessing(true, "extract");
        const attemptExtract = async (pw: string | null) => {
            return await invoke<ExtractionReport>("extract_archive", { 
                archivePath: snapshot.archivePath,
                destPath: destDir, 
                password: pw, 
                targetFiles: snapshot.targetFiles,
                conflictResolution
            });
        };

        try {
            let report: ExtractionReport | null = null;
            try {
                report = await attemptExtract(snapshot.password);
            } catch (err: any) {
                if (err === "PASSWORD_REQUIRED") {
                    const validator = async (testPw: string) => {
                        try {
                            report = await attemptExtract(testPw);
                            if (loadedArchivePath === snapshot.archivePath) currentArchivePassword = testPw;
                            return true;
                        } catch (e: any) {
                            if (String(e) === "PASSWORD_REQUIRED") return false;
                            throw e;
                        }
                    };
                    if (await requestPassword(validator, snapshot.password !== null) === null) {
                        // 암호 확인 중 실제 해제를 수행하므로, 취소해도 이미 저장된 파일의 결과는 보여 준다.
                        if (report) await showArchiveReport(report, "extract", conflictResolution === "overwrite");
                        return;
                    }
                } else {
                    throw err;
                }
            }
            // 암호창 이벤트/포커스 정리가 끝난 뒤 결과창을 열고, 닫힐 때까지 기다린다.
            if (report) await showArchiveReport(report, "extract", conflictResolution === "overwrite");
        } finally {
            setProcessing(false);
        }
    } catch (err: any) {
        await message(`${getTranslation("error")}: ${err}`, getTranslation("error"));
        setProcessing(false);
    }
}

async function startCompression(paths: string[]) {
    await runArchiveAction(() => executeCompression([...paths], readCompressionOptions()));
}

/** 현재 컨트롤 값을 검증하고 복사한다. 이후 파일/저장 대화상자에서는 이 값을 사용한다. */
function readCompressionOptions() {
    const format = elements.formatSelect?.value || "zip";
    const password = elements.enablePasswordCb?.checked ? elements.compressPasswordInput?.value || null : null;
    if (elements.enablePasswordCb?.checked && !password) throw new Error(getTranslation("passwordRequired"));
    // Match the bundled 7-Zip ZIP writer before opening any native file/save dialog.
    // This restriction concerns ZIP creation passwords, never archive filenames or extraction.
    if (format === "zip" && password && /[^\x20-\x7f]/.test(password)) {
        throw new Error(getTranslation("zipPasswordHint"));
    }
    return {
        format,
        password,
        encryptLevel: (document.getElementById("encrypt-level") as HTMLSelectElement)?.value || null,
        splitSize: elements.splitSelect?.value || "0",
        compressionLevel: Number((document.getElementById("compression-level") as HTMLSelectElement).value)
    };
}

/** 게이트를 가진 호출자 전용. 입력/옵션을 받아 저장 위치 선택부터 결과창 닫기까지 완료한다. */
async function executeCompression(paths: string[], options: ReturnType<typeof readCompressionOptions>) {
    const { format, password, encryptLevel, splitSize, compressionLevel } = options;
    const ext = format;
    
    let defaultPath = "";
    if (paths.length > 0) {
        const baseName = paths.length === 1 
            ? paths[0].replace(/[/\\]+$/, '').split(/[/\\]/).pop() || "Archive"
            : "Archive";
        defaultPath = await join(await dirname(paths[0]), baseName + "." + ext);
    }

    const destPath = await save({ filters: [{ name: getTranslation("archiveFormat"), extensions: [ext] }], title: getTranslation("saveArchive"), defaultPath });
    if (!destPath) return;

    closeCompressionPanel();
    lastResultPath = null;
    setProcessing(true, "compress");

    try {
      const outputs = await invoke<string[]>("compress_archive", { 
        sourcePaths: paths, destPath, format, 
        splitSize,
        password,
        encryptLevel,
        compressionLevel
      });
      lastResultPath = outputs[0] ?? null;
      lastResultOperation = "compress";
      await showArchiveReport({
          success_files: outputs, failed_files: [], output_paths: outputs, cancelled: false
      }, "compress");
    } catch (err: any) {
      progressLens.setRunning(false);
      if (String(err) !== "CANCELLED") await message(`${getTranslation("error")}: ${err}`, getTranslation("error"));
    } finally {
        setProcessing(false);
    }
}

// --- 암호·충돌 대화상자의 비동기 계약 ---

/** 메모리/외부 미리보기의 읽기를 재시도한다. 사용자 취소는 null, 다른 실패는 호출자에게 전달한다. */
async function withArchivePassword<T>(read: (password: string | null) => Promise<T>): Promise<T | null> {
    try { return await read(currentArchivePassword); }
    catch (error) { if (String(error) !== "PASSWORD_REQUIRED") throw error; }
    let result: T | null = null;
    const password = await requestPassword(async password => {
        try { result = await read(password); currentArchivePassword = password; return true; }
        catch (error) { if (String(error) === "PASSWORD_REQUIRED") return false; throw error; }
    }, currentArchivePassword !== null);
    return password === null ? null : result;
}

/** validator는 단순 문자열 비교가 아니라 실제 아카이브 읽기/해제를 실행할 수 있다. */
function requestPassword(validator: PasswordValidator, isRetry = false): Promise<string | null> {
    const { passwordModal, unlockPasswordInput, passwordSubmit, passwordCancel, modalErrorMsg } = elements;
    if (!passwordModal || !unlockPasswordInput || !passwordSubmit || !passwordCancel) return Promise.resolve(null);
    if (modalErrorMsg) modalErrorMsg.textContent = getTranslation("passwordIncorrect");
    return showPasswordDialog({ modal: passwordModal, input: unlockPasswordInput, submit: passwordSubmit, cancel: passwordCancel, error: modalErrorMsg }, validator, {
        cancelWork: () => invoke("cancel_operation"),
        running: running => progressLens?.setRunning(running && isProcessing),
        cancelFailed: error => showToast(String(error), "error")
    }, isRetry);
}

/** 이벤트 핸들러를 정리한 뒤 선택을 반환한다. 반환 문자열은 Rust 충돌 정책과 맞춰야 한다. */
function requestConflictResolution(conflicts: string[]): Promise<string | null> {
    return new Promise((resolve) => {
        const { conflictModal, conflictMsg, conflictOverwrite, conflictKeep, conflictCancel } = elements;
        if (!conflictModal || !conflictMsg || !conflictOverwrite || !conflictKeep || !conflictCancel) return resolve(null);

        if (conflicts.length === 1) {
            conflictMsg.innerHTML = escapeHTML(getTranslation("existingFile"))
                .replace("{path}", () => `<bdi dir="ltr">${escapeHTML(conflicts[0])}</bdi>`);
        } else {
            conflictMsg.innerText = getTranslation("existingFiles").replace("{count}", String(conflicts.length));
        }

        conflictModal.style.display = "flex";

        const cleanup = () => {
            conflictModal.style.display = "none";
            conflictOverwrite.onclick = null;
            conflictKeep.onclick = null;
            conflictCancel.onclick = null;
        };

        const onOverwrite = () => { cleanup(); resolve("overwrite"); };
        const onKeep = () => { cleanup(); resolve("keep_both"); };
        const onCancel = () => { cleanup(); resolve("cancel"); };

        conflictOverwrite.onclick = onOverwrite;
        conflictKeep.onclick = onKeep;
        conflictCancel.onclick = onCancel;
    });
}

// --- 진행 상태와 완료 보고서 ---

/**
 * 진행 UI, 타이머, 취소 버튼을 함께 갱신한다. 사용자 작업 게이트의 해제는 담당하지 않는다.
 * false 뒤에도 결과/미리보기 대화상자가 남아 있으면 archiveActions.busy가 입력을 계속 막는다.
 */
function setProcessing(processing: false): void;
function setProcessing(processing: true, operation: ProcessingOperation, statusLine?: string): void;
function setProcessing(processing: boolean, operation: ProcessingOperation = "preview", statusLine?: string) {
    cancellationRequested = false;
    activeOperation = processing ? operation : null;
    document.getElementById("app")!.dataset.processing = String(processing);
    const status = statusLine ?? getTranslation(operation === "compress" ? "compressing" : operation === "extract" ? "extracting" : "loadingPreview");
    progressLens?.setMode(operation, operation === "compress" ? getTranslation("lensCompress") : getTranslation("lensExtract"));
    progressLens?.setRunning(processing);
    progressLens?.setProgress(null);
    isProcessing = processing;
    updateButtonState(processing || archiveActions.busy);
    const cancelButton = document.getElementById("btn-cancel-operation") as HTMLButtonElement | null;
    if (cancelButton) cancelButton.disabled = !processing;
    if (!processing) queueMicrotask(() => void processNextStartupAction());
    const { progressContainer, progressFill, progressText, progressStatus, btnReveal } = elements;

    if (progressContainer && progressFill && progressText && progressStatus) {
        if (processing) {
            if (btnReveal) btnReveal.style.display = "none";
            progressContainer.style.display = "flex";
            // Start indeterminate until the engine sends measured progress.
            progressFill.classList.add("indeterminate");
            progressFill.style.width = "35%";
            progressText.innerText = "—";
            progressStatus.innerText = status;
            const bar = document.querySelector(".progress-bar");
            bar?.removeAttribute("aria-valuenow");
            bar?.setAttribute("aria-label", status);
            if (elements.progressFilename) elements.progressFilename.innerText = "";
            const main = document.querySelector(".main-content");
            if (main) main.scrollTop = 0;
            currentProgress = 0;
            startTime = Date.now();
            if (elements.progressEta) elements.progressEta.innerText = `${getTranslation("remainingTime")}: --:--`;
            if (elements.progressElapsed) elements.progressElapsed.innerText = "00:00";
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = window.setInterval(() => {
                const elapsedSec = (Date.now() - startTime) / 1000;
                if (elements.progressElapsed) elements.progressElapsed.innerText = formatTime(elapsedSec);

                if (currentProgress > 0 && currentProgress < 100) {
                    const totalEstSec = (elapsedSec / currentProgress) * 100;
                    const remainingSec = totalEstSec - elapsedSec;
                    if (elements.progressEta) elements.progressEta.innerText = `${getTranslation("remainingTime")}: ${formatTime(remainingSec)}`;
                } else if (currentProgress >= 100) {
                    if (elements.progressEta) elements.progressEta.innerText = `${getTranslation("remainingTime")}: 00:00`;
                }
            }, 500);
        } else {
            if (timerInterval) clearInterval(timerInterval);
            if (btnReveal && lastResultPath) btnReveal.style.display = "block";
            progressContainer.style.display = "none";
        }
    }
}

async function autoResizeWindow(fileCount: number) {
    try {
        const win = getCurrentWindow();
        const currentSize = await win.innerSize();
        const mon = await currentMonitor();
        if (mon) {
            const scale = mon.scaleFactor;
            const currentWidth = currentSize.width / scale;
            const currentHeight = currentSize.height / scale;
            
            const screenHeight = mon.size.height / scale;
            const targetHeight = Math.max(600, Math.min(460 + (fileCount * 48), screenHeight * 0.5));
            
            // Only resize if the window is currently smaller than the target height or default width
            if (currentHeight < targetHeight || currentWidth < 800) {
                await win.setSize(new LogicalSize(Math.max(800, currentWidth), Math.max(currentHeight, targetHeight)));
            }
        }
    } catch (e) {}
}

function handleFilenameEvent(filename: string) {
    if (elements.progressFilename) elements.progressFilename.innerText = filename;
}

/**
 * 결과 표시뿐 아니라 닫기까지 기다리는 Promise를 반환한다. 반드시 await하여 다음 요청이
 * 현재 결과를 덮어쓰지 않게 한다. 압축 결과에는 이전 아카이브 목록의 크기를 붙이지 않는다.
 */
function showArchiveReport(report: ExtractionReport, operation: "extract" | "compress", sourceNamesPreserved = true): Promise<void> {
    const el = elements;
    // 엔진 작업이 끝났으므로 진행 표시만 멈춘다. 게이트는 결과창을 닫은 후 해제된다.
    progressLens.setRunning(false);
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    if (el.progressContainer) el.progressContainer.style.display = "none";
    const app = document.getElementById("app")!;
    app.dataset.processing = "false";
    app.inert = true;
    const cancelButton = document.getElementById("btn-cancel-operation") as HTMLButtonElement;
    cancelButton.disabled = true;
    const resultTarget = operation === "compress" ? report.output_paths[0] : lastResultPath;
    el.reportModal.dataset.operation = operation;
    el.reportIcon.classList.remove("completion-lens-icon", "optics-scene");
    el.reportModal.style.display = "flex";
    el.reportModal.setAttribute("aria-hidden", "false");
    
    el.reportFailedList.innerHTML = "";
    el.reportSuccessList.innerHTML = "";
    
    if (report.failed_files.length > 0 || report.cancelled) {
        el.reportFailedSection.style.display = "block";
        el.reportIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        el.reportIcon.style.color = "#f59e0b";
        el.reportIcon.style.background = "rgba(245, 158, 11, 0.1)";
        el.reportTitle.innerText = getTranslation("extractionReport");
        el.reportDesc.innerText = getTranslation(report.cancelled ? "cancelledSummary" : "partialSummary")
            .replace("{count}", String(report.success_files.length))
            .replace("{errors}", String(report.failed_files.length));
        
        const failedDisplay = reportDisplayItems(report.failed_files);
        failedDisplay.items.forEach(([path, err]: [string, string]) => {
            const li = document.createElement("li");
            const fname = path.split(/[\/\\]/).pop() || path;
            const ext = fname.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '-';
            // Isolate display direction without adding invisible characters to stored/exported names.
            li.innerHTML = `<div style="margin-bottom:6px;"><strong><bdi dir="auto">${escapeHTML(fname)}</bdi></strong> <bdi dir="ltr" style="opacity:0.5;font-size:10px;">[${escapeHTML(ext)}]</bdi></div><div dir="ltr" style="unicode-bidi:isolate;font-size:11px;opacity:0.6;margin-inline-start:8px;">${escapeHTML(path)}</div><div dir="auto" style="font-size:11px;color:#ef4444;margin-inline-start:8px;">${escapeHTML(err)}</div>`;
            li.style.marginBottom = "8px";
            li.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
            li.style.paddingBottom = "8px";
            el.reportFailedList.appendChild(li);
        });
        if (failedDisplay.hiddenCount) {
            const li = document.createElement("li");
            li.innerText = getTranslation("moreFiles").replace("{count}", String(failedDisplay.hiddenCount));
            li.style.opacity = "0.6";
            el.reportFailedList.appendChild(li);
        }
    } else {
        el.reportFailedSection.style.display = "none";
        el.reportIcon.style.removeProperty("color");
        el.reportIcon.style.removeProperty("background");
        el.reportIcon.classList.add("completion-lens-icon");
        const scene = new LensScene(el.reportIcon, "completion-optics");
        scene.setMode(operation, getTranslation(operation === "compress" ? "lensCompress" : "lensExtract"));
        scene.setRunning(false);
        scene.setProgress(100);
        el.reportTitle.innerText = getTranslation(operation === "compress" ? "compressionReport" : "extractionComplete");
        el.reportDesc.innerText = getTranslation(operation === "compress" ? "compressedFilesSummary" : "extractedFilesSummary")
            .replace("{count}", String(report.success_files.length));
    }
    
    if (report.success_files.length > 0) {
        el.reportSuccessSection.style.display = "block";
        const successDisplay = reportDisplayItems(report.success_files);
        successDisplay.items.forEach((path: string) => {
            const li = document.createElement("li");
            const fname = path.split(/[\/\\]/).pop() || path;
            const ext = fname.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '-';
            li.innerHTML = `<bdi dir="auto" style="font-weight:500;">${escapeHTML(fname)}</bdi> <bdi dir="ltr" style="opacity:0.5;font-size:10px;">[${escapeHTML(ext)}]</bdi>`;
            li.style.marginBottom = "4px";
            el.reportSuccessList.appendChild(li);
        });
        if (successDisplay.hiddenCount) {
            const li = document.createElement("li");
            li.innerText = getTranslation("moreFiles").replace("{count}", String(successDisplay.hiddenCount));
            li.style.opacity = "0.6";
            el.reportSuccessList.appendChild(li);
        }
    } else {
        el.reportSuccessSection.style.display = "none";
    }
    
    const btnOpenFile = document.getElementById("report-open-file") as HTMLButtonElement;
    const btnOpenFolder = document.getElementById("report-open-folder") as HTMLButtonElement;
    const btnViewDetails = document.getElementById("report-view-details") as HTMLButtonElement;
    const boxDetails = document.getElementById("report-details-box") as HTMLDivElement;

    if (boxDetails) boxDetails.style.display = "none";
    
    if (btnViewDetails && boxDetails) {
        btnViewDetails.style.display = operation === "extract" ? "block" : "none";
        btnViewDetails.innerText = getTranslation("viewResultDetails");
        btnViewDetails.onclick = () => {
            boxDetails.style.display = boxDetails.style.display === "none" ? "block" : "none";
        };
    }

    if (btnOpenFile) {
        if (operation === "extract" && report.success_files.length === 1 && report.failed_files.length === 0 && !report.cancelled && report.output_paths[0]) {
            btnOpenFile.style.display = "block";
            btnOpenFile.innerText = getTranslation("openResultFile");
            btnOpenFile.onclick = async () => {
                if (lastResultPath) {
                    const target = report.output_paths[0];
                    await openPath(target).catch(() => {});
                }
            };
        } else {
            btnOpenFile.style.display = "none";
            btnOpenFile.onclick = null;
        }
    }

    if (btnOpenFolder) {
        btnOpenFolder.innerText = getTranslation("revealInFinder");
        btnOpenFolder.style.display = resultTarget ? "block" : "none";
        btnOpenFolder.onclick = async () => {
            if (!resultTarget) return;
            try {
                await revealItemInDir(resultTarget);
            } catch {
                // Never open a newly created archive just to reveal its location.
                const folder = operation === "compress" ? await dirname(resultTarget) : resultTarget;
                await openPath(folder).catch(() => {});
            }
        };
    }

    const generateTxt = async () => {
        const rows = buildReportRows(report, archiveEntries, sourceNamesPreserved);
        const content = formatReportTxt(report, rows, APP_DISPLAY_NAME, new Date().toLocaleString(getCurrentLang()), getTranslation);

        const filePath = await save({ filters: [{ name: "TXT", extensions: ["txt"] }], title: getTranslation("saveReportTxt") });
        if (filePath) {
            try {
                await invoke("save_report_file", { filePath, content });
                await message(getTranslation("success") + "!", getTranslation("success"));
            } catch (err: any) {
                await message(`${getTranslation("error")}: ${err}`, { title: getTranslation("error"), kind: "error" });
            }
        }
    };

    const generateCsv = async () => {
        const rows = buildReportRows(report, archiveEntries, sourceNamesPreserved);
        const content = formatReportCsv(rows, getTranslation);

        const filePath = await save({ filters: [{ name: "CSV", extensions: ["csv"] }], title: getTranslation("saveReportCsv") });
        if (filePath) {
            try {
                await invoke("save_report_file", { filePath, content });
                await message(getTranslation("success") + "!", getTranslation("success"));
            } catch (err: any) {
                await message(`${getTranslation("error")}: ${err}`, { title: getTranslation("error"), kind: "error" });
            }
        }
    };

    // Compression results are archive outputs, not the previously previewed file list.
    el.reportExportTxt.onclick = operation === "extract" ? generateTxt : null;
    el.reportExportCsv.onclick = operation === "extract" ? generateCsv : null;

    // 확인/ESC 시 이벤트와 inert를 복구한 뒤 호출자를 재개한다.
    return new Promise<void>(resolve => {
        const close = () => {
            el.reportModal.style.display = "none";
            el.reportModal.setAttribute("aria-hidden", "true");
            app.inert = false;
            document.removeEventListener("keydown", onKeyDown);
            el.reportClose.onclick = null;
            resolve();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") { event.preventDefault(); close(); }
            if (event.key === "Tab") {
                const buttons = Array.from(el.reportModal.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
                    .filter(button => button.getClientRects().length > 0);
                const first = buttons[0], last = buttons[buttons.length - 1];
                if (!el.reportModal.contains(document.activeElement)) {
                    event.preventDefault();
                    (event.shiftKey ? last : first)?.focus();
                }
                else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        el.reportClose.onclick = close;
        // WebKit can leave focus on the body after a mouse click on a button.
        document.addEventListener("keydown", onKeyDown);
        el.reportClose.focus();
    });
}

// --- Toast Notification Utility ---
function showToast(message: string, type: "success" | "error" = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.style.background = type === "success" ? "rgba(16, 185, 129, 0.9)" : "rgba(239, 68, 68, 0.9)";
    toast.style.color = "white";
    toast.style.padding = "10px 18px";
    toast.style.borderRadius = "8px";
    toast.style.fontSize = "13px";
    toast.style.fontWeight = "500";
    toast.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    toast.style.backdropFilter = "blur(8px)";
    toast.style.display = "flex";
    toast.style.alignItems = "center";
    toast.style.gap = "8px";
    
    const icon = type === "success" ? "✅" : "❌";
    const iconSpan = document.createElement("span");
    iconSpan.textContent = icon;
    const msgSpan = document.createElement("span");
    msgSpan.textContent = message;
    toast.appendChild(iconSpan);
    toast.appendChild(msgSpan);

    container.appendChild(toast);

    // Fade in
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
    });

    // Fade out and remove after 4.6s
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(10px)";
        setTimeout(() => toast.remove(), 300);
    }, 4600);
}
