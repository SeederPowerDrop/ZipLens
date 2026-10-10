import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, message, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow, LogicalSize, currentMonitor } from "@tauri-apps/api/window";
import { join, dirname } from "@tauri-apps/api/path";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { formatBytes, formatTime, escapeHTML } from "./utils";
import { elements, updateButtonState } from "./ui";
import { archiveStem, csvCell, snapshotExtraction, type ExtractionSnapshot } from "./archive-model";
import { classifyInputPaths, type InputPath } from "./input-routing";
import { ArchiveActionGate } from "./action-session";
import { showPasswordDialog } from "./password-dialog";
import { LensScene, type ProcessingOperation } from "./lens-scene";
import { HomeLensExplorer } from "./lens-explorer";
import { setLanguage, getTranslation, getCurrentLang, resolveLanguage, supportedLanguages } from "./i18n";
import { copyBitcoinAddress, getAboutLicenseError } from "./about";
import { APP_DISPLAY_NAME } from "./app-info";
import { updateUserGuide } from "./user-guide";

import { initFileAssociations, isFileAssociationsOpen, openFileAssociations } from "./file-associations";
import "./file-associations.css";

// --- State Variables ---
let lastResultPath: string | null = null;
let lastResultOperation: "extract" | "compress" = "extract";
let loadedArchive: string | null = null;
let currentArchivePassword: string | null = null;
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
let globalArchiveFiles: ArchiveFileInfo[] = [];
let currentDirectory: string = "";
let currentPage = 0;
const PAGE_SIZE = 300;
let progressUnlisten: (() => void) | null = null;
let previewBlobUrl: string | null = null;
const pendingStartupActions: StartupAction[] = [];
let drainingStartupAction = false;
const archiveActions = new ArchiveActionGate(busy => {
    const app = document.getElementById("app");
    if (app) app.dataset.actionBusy = String(busy);
    updateButtonState(busy || isProcessing);
    if (!busy) {
        if (pendingPanelFocus?.getClientRects().length) pendingPanelFocus.focus();
        pendingPanelFocus = null;
        queueMicrotask(() => void handleNextStartupAction());
    }
});

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

interface ExtractionReport {
    success_files: string[];
    failed_files: [string, string][];
    output_paths: string[];
    cancelled: boolean;
}
interface ArchiveProgress { percent: number | null; processed_bytes: number; total_bytes: number; filename: string; }

let currentSort: { col: "name" | "size" | "compressed" | "ext", asc: boolean } = { col: "name", asc: true };

interface StartupAction {
  action: "extract" | "compress" | "settings" | "";
  paths: string[];
}

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

type PasswordValidator = (pw: string) => Promise<boolean>;

// --- Event Listeners & Initialization ---

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
    };
    }

    // Language Selector
    const langSelect = document.getElementById("lang-select") as HTMLSelectElement;
    if (langSelect) {
        langSelect.replaceChildren(...supportedLanguages.map(({ code, label }) => new Option(label, code)));
        const applyLanguage = (language: string | null) => {
            setLanguage(resolveLanguage(language, navigator.languages));
            langSelect.value = getCurrentLang();
            updateLensLabels();
            renderCompressionSelection();
            if (loadedArchive) renderFileList(false);
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

    initFileAssociations({ onClose: () => { void handleNextStartupAction(); } });

    const cancelButton = document.getElementById("btn-cancel-operation") as HTMLButtonElement;
    cancelButton.onclick = async () => {
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
        await handleNextStartupAction();
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
    const guideLink = document.getElementById("about-user-guide");
    if (guideLink && userGuide) {
        guideLink.onclick = event => {
            event.preventDefault();
            updateUserGuide(getCurrentLang());
            if (!userGuide.open) userGuide.showModal();
            const content = document.getElementById("user-guide-content");
            if (content) content.scrollTop = 0;
        };
        document.getElementById("user-guide-close")?.addEventListener("click", () => userGuide.close());
    }
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
            globalArchiveFiles.forEach(f => f.selected = !f.error);
            renderFileList();
        };
    }

    if (elements.deselectAllBtn) {
        elements.deselectAllBtn.onclick = () => {
            // Deselect all files
            globalArchiveFiles.forEach(f => f.selected = false);
            renderFileList();
        };
    }

    if (elements.toggleAllBtn) {
        elements.toggleAllBtn.onclick = () => {
            // Invert selection for all files
            globalArchiveFiles.forEach(f => f.selected = !f.error && !f.selected);
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

// Setup Native Drag & Drop
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

async function handleNextStartupAction() {
    if (drainingStartupAction || archiveActions.busy || isProcessing || isFileAssociationsOpen() || document.getElementById("app")?.dataset.composing === "true" || !pendingStartupActions.length) return;
    drainingStartupAction = true;
    try {
        const next = pendingStartupActions.shift()!;
        if (next.action === "settings") { openFileAssociations(); return; }
        if (!next.paths.length) return;
        if (next.action === "compress") await handleDirectCompression(next.paths);
        else {
            await loadArchivePreview(next.paths[0]);
            if (next.paths.length > 1) showToast("여러 압축 파일 중 첫 번째 파일을 열었습니다. / Opened the first archive.");
        }
    } finally {
        drainingStartupAction = false;
        // Save-dialog cancellation does not call setProcessing(false). Always resume here too.
        if (pendingStartupActions.length && !archiveActions.busy && !isProcessing && !isFileAssociationsOpen()) {
            queueMicrotask(() => void handleNextStartupAction());
        }
    }
}

// --- Core Functions ---

async function chooseInputs(directory = false) {
    await runArchiveAction(async () => {
        // macOS type filters can hide valid ALZ/EGG files before UTI registration.
        const selected = await open({ multiple: true, directory, title: getTranslation(directory ? "chooseFolders" : "selectInputs") });
        if (selected !== null) await routeInputs(Array.isArray(selected) ? selected : [selected]);
    });
}

async function routeInputs(paths: string[]) {
    const inputs = await invoke<InputPath[]>("inspect_input_paths", { paths });
    const route = classifyInputPaths(inputs);
    if (route.kind === "extract") {
        await loadArchivePreviewInner(route.path);
        if (route.archiveCount > 1 && loadedArchive === route.path) {
            showToast(getTranslation("firstArchiveOpened")
                .replace("{count}", String(route.archiveCount))
                .replace("{name}", () => route.path.split(/[\\/]/).pop() || route.path));
        }
    } else if (route.kind === "compress") {
        showCompressionPanel(route.paths);
    }
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
    queueMicrotask(() => void handleNextStartupAction());
}

function focusPanelControl(control: HTMLElement) {
    if (archiveActions.busy || isProcessing) pendingPanelFocus = control;
    else control.focus();
}

async function confirmCompression() {
    await runArchiveAction(async () => {
        // Keep both the chosen inputs and settings stable through the save dialog.
        const options = compressionOptions();
        let paths = [...pendingCompressionPaths];
        if (!paths.length) {
            const directory = (document.getElementById("compression-source") as HTMLSelectElement).value === "folder";
            const selected = await open({ directory, multiple: true, title: getTranslation(directory ? "selectFolderToCompress" : "selectItemsToCompress") });
            if (!selected || !selected.length) return;
            paths = Array.isArray(selected) ? selected : [selected];
            showCompressionPanel(paths);
        }
        await handleDirectCompressionInner(paths, options);
    });
}

async function loadArchivePreview(path: string, pwAttempt: string | null = null) {
    await runArchiveAction(() => loadArchivePreviewInner(path, pwAttempt));
}

async function loadArchivePreviewInner(path: string, pwAttempt: string | null = null) {
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
        
        loadedArchive = path;
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
        globalArchiveFiles = files.map(f => ({ ...f, selected: !f.error }));
        currentDirectory = "";
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

function renderFileList(resetPage = true) {
    if (resetPage) currentPage = 0;
    const query = elements.searchInput?.value.trim().normalize("NFC").toLocaleLowerCase() || "";
    if (!elements.logContainer) return;
    elements.logContainer.innerHTML = "";
    elements.logContainer.style.display = "flex";

    // 1. Calculate global stats
    let selCount = 0, selSize = 0, totalSize = 0, totalCount = 0;
    globalArchiveFiles.forEach(f => {
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
        const parts = currentDirectory.replace(/\\/g, '/').split('/').filter(p => p);
        
        const createCrumb = (text: string, path: string, isLast: boolean) => {
            const span = document.createElement("button");
            span.type = "button";
            span.textContent = text;
            span.title = text;
            if (!isLast) {
                span.style.cursor = "pointer";
                span.style.color = "var(--accent-hover)";
                span.style.textDecoration = "underline";
                span.onclick = () => {
                    currentDirectory = path;
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
    const itemsMap = new Map<string, any>();
    const normCurDir = currentDirectory ? currentDirectory.replace(/\\/g, '/') : "";

    globalArchiveFiles.forEach(f => {
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

            const item = itemsMap.get(name);
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
        upItem.innerHTML = `<span class="file-name" style="padding-left:24px;">📁 .. (${getTranslation("upToParent")})</span>`;
        upItem.onclick = () => {
            const parts = normCurDir.split('/').filter(p => p);
            parts.pop();
            currentDirectory = parts.length > 0 ? parts.join('/') + '/' : '';
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
            const compA = a.files.reduce((acc: number, f: any) => acc + (f.compressed_size || 0), 0);
            const compB = b.files.reduce((acc: number, f: any) => acc + (f.compressed_size || 0), 0);
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
            checkbox.checked = item.files.length > 0 ? item.files.every((f: any) => f.selected) : false;
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
            const errBadge = errorCount > 0 ? `<span style="color:#ef4444;margin-left:6px;font-size:11px;" title="${escapeHTML(getTranslation("failedFiles"))}: ${errorCount}">⚠️ ${errorCount}</span>` : '';
            info.innerHTML = `<span class="file-name" style="cursor:pointer; color:var(--accent-color);"><span style="margin-right:6px;">📁</span>${escapeHTML(item.name)}${errBadge}</span>
                             <div class="file-size-column">
                                 <div style="font-size:11px;font-family:monospace;"><span style="color:var(--text-muted);font-size:10px;">${getTranslation("size")}</span> ${formatBytes(item.size)}</div>
                             </div>`;
            info.querySelector('.file-name')?.addEventListener('click', (e) => {
                e.stopPropagation();
                currentDirectory = item.fullPath;
                renderFileList();
            });
        } else {
            const fileObj = item.files[0];
            const badge = fileObj.path.match(/\.([^.\\/]+)$/)?.[1]?.toUpperCase().substring(0, 5) || "FILE";
            const lock = fileObj.is_encrypted ? '🔒 ' : '';
            const hasError = fileObj.error;
            const errIcon = hasError ? `<span style="color:#ef4444;margin-right:4px;" title="${escapeHTML(String(hasError))}">⚠️</span>` : '';
            const errStyle = hasError ? 'opacity:0.6;' : '';
            info.innerHTML = `<span class="file-name" style="${errStyle}">${errIcon}${lock}<span class="ext-badge" style="${hasError ? 'background:rgba(239,68,68,0.15);color:#ef4444;border-color:rgba(239,68,68,0.3);' : ''}">${escapeHTML(badge)}</span>${escapeHTML(item.name)}</span>
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
                currentDirectory = item.fullPath;
                renderFileList();
            }
        });
        
        domItem.addEventListener("dblclick", async (e) => {
            clearTimeout(singleClickTimer);
            if (item.isDir) return;
            e.stopPropagation();
            if (archiveActions.busy || isProcessing || !loadedArchive) return;
            const archivePath = loadedArchive;
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
            if (item.isDir) { currentDirectory = item.fullPath; renderFileList(); }
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

async function smartExtractArchive() {
    await runArchiveAction(async () => {
        if (!loadedArchive) return;
        const snapshot = snapshotExtraction(loadedArchive, currentArchivePassword, globalArchiveFiles);
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
        if (!loadedArchive) {
            const selected = await open({ multiple: false, title: getTranslation("selectArchive") });
            if (selected) await loadArchivePreviewInner(selected);
            return;
        }
        const snapshot = snapshotExtraction(loadedArchive, currentArchivePassword, globalArchiveFiles);
        if (snapshot.emptySelection) {
            await message(getTranslation("noFilesSelected"), { title: getTranslation("error"), kind: "error" });
            return;
        }
        const destDir = await open({ directory: true, title: getTranslation("extractTo") });
        if (!destDir) return;
        await executeExtraction(snapshot, destDir);
    });
}

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
                            if (loadedArchive === snapshot.archivePath) currentArchivePassword = testPw;
                            return true;
                        } catch (e: any) {
                            if (String(e) === "PASSWORD_REQUIRED") return false;
                            throw e;
                        }
                    };
                    if (await requestPassword(validator, snapshot.password !== null) === null) {
                        // Cancellation during password submission may have saved some files.
                        if (report) await showArchiveReport(report, "extract");
                        return;
                    }
                } else {
                    throw err;
                }
            }
            // Let password cleanup finish before presenting an awaited result dialog.
            if (report) await showArchiveReport(report, "extract");
        } finally {
            setProcessing(false);
        }
    } catch (err: any) {
        await message(`${getTranslation("error")}: ${err}`, getTranslation("error"));
        setProcessing(false);
    }
}

async function handleDirectCompression(paths: string[]) {
    await runArchiveAction(() => handleDirectCompressionInner([...paths], compressionOptions()));
}

function compressionOptions() {
    const password = elements.enablePasswordCb?.checked ? elements.compressPasswordInput?.value || null : null;
    if (elements.enablePasswordCb?.checked && !password) throw new Error(getTranslation("passwordRequired"));
    return {
        format: elements.formatSelect?.value || "zip",
        password,
        encryptLevel: (document.getElementById("encrypt-level") as HTMLSelectElement)?.value || null,
        splitSize: elements.splitSelect?.value || "0",
        compressionLevel: Number((document.getElementById("compression-level") as HTMLSelectElement).value)
    };
}

async function handleDirectCompressionInner(paths: string[], options: ReturnType<typeof compressionOptions>) {
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

function requestConflictResolution(conflicts: string[]): Promise<string | null> {
    return new Promise((resolve) => {
        const { conflictModal, conflictMsg, conflictOverwrite, conflictKeep, conflictCancel } = elements;
        if (!conflictModal || !conflictMsg || !conflictOverwrite || !conflictKeep || !conflictCancel) return resolve(null);

        if (conflicts.length === 1) {
            conflictMsg.innerText = getTranslation("existingFile").replace("{path}", () => conflicts[0]);
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
    if (!processing) queueMicrotask(() => void handleNextStartupAction());
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

function showArchiveReport(report: ExtractionReport, operation: "extract" | "compress"): Promise<void> {
    const el = elements;
    // Stop finished-job visuals without releasing the queue until dismissal.
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
        
        report.failed_files.forEach(([path, err]: [string, string]) => {
            const li = document.createElement("li");
            const fname = path.split(/[\/\\]/).pop() || path;
            const ext = fname.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '-';
            li.innerHTML = `<div style="margin-bottom:6px;"><strong>${escapeHTML(fname)}</strong> <span style="opacity:0.5;font-size:10px;">[${escapeHTML(ext)}]</span></div><div style="font-size:11px;opacity:0.6;margin-left:8px;">${escapeHTML(path)}</div><div style="font-size:11px;color:#ef4444;margin-left:8px;">${escapeHTML(err)}</div>`;
            li.style.marginBottom = "8px";
            li.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
            li.style.paddingBottom = "8px";
            el.reportFailedList.appendChild(li);
        });
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
        const maxDisplay = 50;
        const toShow = report.success_files.slice(0, maxDisplay);
        toShow.forEach((path: string) => {
            const li = document.createElement("li");
            const fname = path.split(/[\/\\]/).pop() || path;
            const ext = fname.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '-';
            li.innerHTML = `<span style="font-weight:500;">${escapeHTML(fname)}</span> <span style="opacity:0.5;font-size:10px;">[${escapeHTML(ext)}]</span>`;
            li.style.marginBottom = "4px";
            el.reportSuccessList.appendChild(li);
        });
        if (report.success_files.length > maxDisplay) {
            const li = document.createElement("li");
            li.innerText = getTranslation("moreFiles").replace("{count}", String(report.success_files.length - maxDisplay));
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
        const findSize = (p: string): string => {
            const f = globalArchiveFiles.find(f => p.endsWith(f.path));
            return f ? formatBytes(f.size) : '-';
        };

        let content = `=== ${APP_DISPLAY_NAME} · ${getTranslation("extractionReport")} ===\n`;
        content += `${getTranslation("date")}: ${new Date().toLocaleString(getCurrentLang())}\n`;
        content += `${getTranslation("status")}: ${getTranslation(report.cancelled ? "cancelled" : report.failed_files.length > 0 ? "error" : "success")}\n`;
        content += `${getTranslation("successFiles")}: ${report.success_files.length}\n`;
        content += `${getTranslation("failedFiles")}: ${report.failed_files.length}\n`;
        content += "=".repeat(40) + "\n\n";
        
        if (report.failed_files.length > 0) {
            content += `--- ${getTranslation("failedFiles")} ---\n\n`;
            report.failed_files.forEach(([path, err]: [string, string], idx: number) => {
                const fname = path.split(/[\/\\]/).pop() || path;
                const ext = fname.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '-';
                const size = findSize(path);
                content += `${idx + 1}. ${fname}\n`;
                content += `   ${getTranslation("extension")}: ${ext}\n`;
                content += `   ${getTranslation("size")}: ${size}\n`;
                content += `   ${getTranslation("fullPath")}: ${path}\n`;
                content += `   ${getTranslation("error")}: ${err}\n\n`;
            });
        }
        
        if (report.success_files.length > 0) {
            content += `--- ${getTranslation("successFiles")} ---\n\n`;
            report.success_files.forEach((path: string, idx: number) => {
                const fname = path.split(/[\/\\]/).pop() || path;
                const ext = fname.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '-';
                const size = findSize(path);
                content += `${idx + 1}. [${ext}] ${fname} (${size}) — ${path}\n`;
            });
        }
        
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
        const findSize = (p: string): number => {
            const f = globalArchiveFiles.find(f => p.endsWith(f.path));
            return f ? f.size : 0;
        };

        let content = "\uFEFF" + (["status", "sortName", "extension", "size", "fullPath", "error"] as const)
            .map(key => csvCell(getTranslation(key))).join(",") + "\n";
        const csvRow = (status: string, path: string, error = "") => {
            const name = path.split(/[/\\]/).pop() || path;
            content += [status, name, name.split('.').pop() || '', formatBytes(findSize(path)), path, error].map(csvCell).join(',') + "\n";
        };
        report.failed_files.forEach(([path, error]) => csvRow(getTranslation("failed"), path, error));
        report.success_files.forEach(path => csvRow(getTranslation("success"), path));

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

    // Await dismissal so a queued Finder/CLI operation cannot replace this result.
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
