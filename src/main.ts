import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, message, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow, LogicalSize, currentMonitor } from "@tauri-apps/api/window";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { formatBytes, formatTime, escapeHTML } from "./utils";
import { elements, updateButtonState } from "./ui";

// --- State Variables ---
let lastResultPath: string | null = null;
let loadedArchive: string | null = null;
let currentArchivePassword: string | null = null;
let isProcessing = false;
let startTime = 0;
let timerInterval: number | null = null;
let currentProgress = 0;
let globalArchiveFiles: ArchiveFileInfo[] = [];
let currentDirectory: string = "";
interface StartupAction {
  action: "extract" | "compress" | "";
  paths: string[];
}

interface ArchiveFileInfo {
  path: string;
  size: number;
  compressed_size: number | null;
  is_encrypted: boolean;
  selected?: boolean;
  error?: string | null;
}

type PasswordValidator = (pw: string) => Promise<boolean>;

// --- Event Listeners & Initialization ---

document.addEventListener("DOMContentLoaded", () => {
    // Setup Password Toggle Handlers
    const setupPwdToggle = (toggleBtn: HTMLButtonElement | null, input: HTMLInputElement | null) => {
        if (!toggleBtn || !input) return;
        toggleBtn.addEventListener("click", () => {
            const isPassword = input.type === "password";
            input.type = isPassword ? "text" : "password";
            const icon = toggleBtn.querySelector("span");
            if (icon) icon.innerText = isPassword ? 'visibility_off' : 'visibility';
        });
    };

    setupPwdToggle(elements.compressPwdToggle, elements.compressPasswordInput);
    setupPwdToggle(elements.unlockPwdToggle, elements.unlockPasswordInput);

    if (elements.enablePasswordCb) {
        elements.enablePasswordCb.addEventListener("change", () => {
            if (elements.compressPasswordGroup) {
                elements.compressPasswordGroup.style.display = elements.enablePasswordCb.checked ? "block" : "none";
            }
        });
    }

    // Button Listeners
    elements.btnExtract?.addEventListener("click", () => extractArchive());
    elements.btnCompressFile?.addEventListener("click", () => compressSelected());
    elements.btnCompress?.addEventListener("click", () => compressFolder()); // Added folder compression handler
    
    if (elements.selectAllBtn) {
        elements.selectAllBtn.addEventListener("click", () => {
            // Select all files
            globalArchiveFiles.forEach(f => f.selected = true);
            renderFileList();
        });
    }

    if (elements.deselectAllBtn) {
        elements.deselectAllBtn.addEventListener("click", () => {
            // Deselect all files
            globalArchiveFiles.forEach(f => f.selected = false);
            renderFileList();
        });
    }

    if (elements.toggleAllBtn) {
        elements.toggleAllBtn.addEventListener("click", () => {
            // Invert selection for all files
            globalArchiveFiles.forEach(f => f.selected = !f.selected);
            renderFileList();
        });
    }

    if (elements.searchInput) {
        elements.searchInput.addEventListener("input", () => {
            // If we have search logic, we would filter globalArchiveFiles here
            // But since Tree View makes it tricky, we can just expand all paths that match, 
            // or we could show a flat list when searching.
            // For now, let's keep it simple: if searching, we render flat list.
        });
    }

    elements.btnReveal?.addEventListener("click", async () => {
        if (lastResultPath) {
            try {
                await revealItemInDir(lastResultPath);
            } catch (e) {
                await openPath(lastResultPath).catch(() => {});
            }
        }
    });

    elements.dropZone?.addEventListener("click", async () => {
        if (isProcessing) return;
        const selected = await open({
            multiple: false,
            directory: false,
            title: "Select Archive to Preview"
        });
        if (selected !== null) await loadArchivePreview(selected);
    });
});

// Setup Native Drag & Drop
listen<{ paths: string[] }>("tauri://drag-enter", () => {
    if (isProcessing) return;
    elements.dropZone?.classList.add("active");
});

listen("tauri://drag-leave", () => {
    elements.dropZone?.classList.remove("active");
});

listen<{ paths: string[] }>("tauri://drag-drop", async (event) => {
    elements.dropZone?.classList.remove("active");
    if (isProcessing) return;

    const droppedPaths = event.payload.paths;
    if (!droppedPaths || droppedPaths.length === 0) return;

    const extMatch = droppedPaths[0].match(/\.(zip|tar|gz|tgz|zst|tzst|7z|rar|alz|egg|lzh|cab|iso)$/i);
    if (droppedPaths.length === 1 && extMatch) {
        await loadArchivePreview(droppedPaths[0]);
    } else {
        await handleDirectCompression(droppedPaths);
    }
});

// Listen for startup actions (from CLI or open-with)
listen<StartupAction>("startup_action", async (event) => {
    const { action, paths } = event.payload;
    if (!action || paths.length === 0) return;

    if (action === "extract") {
        await loadArchivePreview(paths[0]);
    } else if (action === "compress") {
        await handleDirectCompression(paths);
    }
});

// --- Core Functions ---

async function loadArchivePreview(path: string, pwAttempt: string | null = null) {
    setProcessing(true, "Loading preview...");
    let files: ArchiveFileInfo[] = [];

    const attemptLoad = async (pw: string | null) => {
        return await invoke<ArchiveFileInfo[]>("preview_archive", { archivePath: path, password: pw });
    };

    try {
        try {
            files = await attemptLoad(pwAttempt);
            currentArchivePassword = pwAttempt; 
        } catch (err: any) {
            if (err === "PASSWORD_REQUIRED") {
                const validator = async (testPw: string) => {
                    try {
                        files = await attemptLoad(testPw);
                        currentArchivePassword = testPw;
                        return true;
                    } catch (e: any) {
                        return false;
                    }
                };
                const pw = await requestPassword(validator, pwAttempt !== null);
                if (!pw) {
                    setProcessing(false);
                    return;
                }
            } else if (err === "CORRUPTED_ARCHIVE") {
                await message("이 파일은 손상된 압축 파일이거나 지원하지 않는 형식입니다.", { title: "손상된 파일", kind: "error" });
                setProcessing(false);
                return;
            } else {
                throw err;
            }
        }
        
        loadedArchive = path;
        if (elements.dropZone) elements.dropZone.classList.add("loaded");
        if (elements.previewHeader) elements.previewHeader.style.display = "flex";
        if (elements.previewColsHeader) elements.previewColsHeader.style.display = "flex";

        // Update stats initially
        globalArchiveFiles = files.map(f => ({ ...f, selected: !f.error }));
        currentDirectory = "";
        
        renderFileList();
        await autoResizeWindow(files.length);

        // Show warning if some entries have errors
        const errorFiles = files.filter(f => f.error);
        if (errorFiles.length > 0) {
            await message(
                `${errorFiles.length} / ${files.length} file(s) in this archive have errors and may not extract correctly.\n\nCorrupted entries are marked with ⚠️ in the file list.`,
                { title: "Archive Warning", kind: "warning" }
            );
        }

        if (elements.btnExtract) {
            elements.btnExtract.innerText = "Extract Loaded Archive";
            (elements.btnExtract as HTMLButtonElement).disabled = false;
        }
        const dropTextNode = document.querySelector(".drop-text");
        if (dropTextNode) {
            const filename = path.split(/[\\/]/).pop();
            dropTextNode.textContent = `Loaded: ${filename}`;
        }
    } catch (err: any) {
        await message(`Preview failed: ${err}`, { title: "Error", kind: "error" });
    } finally {
        setProcessing(false);
    }
}

function renderFileList() {
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
        elements.previewStatsMain.innerText = `${selCount} / ${totalCount} files selected`;
        elements.previewStatsSub.innerText = `(Extracted Size: ${formatBytes(selSize)} / Total: ${formatBytes(totalSize)})`;
    }

    // 2. Render Breadcrumbs
    if (elements.breadcrumbContainer) {
        elements.breadcrumbContainer.innerHTML = "";
        const parts = currentDirectory.replace(/\\/g, '/').split('/').filter(p => p);
        
        const createCrumb = (text: string, path: string, isLast: boolean) => {
            const span = document.createElement("span");
            span.innerText = text;
            if (!isLast) {
                span.style.cursor = "pointer";
                span.style.color = "var(--accent-hover)";
                span.style.textDecoration = "underline";
                span.onclick = () => {
                    currentDirectory = path;
                    renderFileList();
                };
            } else {
                span.style.color = "var(--text-color)";
                span.style.fontWeight = "600";
            }
            return span;
        };

        elements.breadcrumbContainer.appendChild(createCrumb("Root", "", parts.length === 0));
        
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
        if (normPath.startsWith(normCurDir)) {
            const relPath = normPath.substring(normCurDir.length);
            if (relPath === "") return; // Skip the directory entry itself

            const parts = relPath.split('/');
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
        upItem.innerHTML = `<span class="file-name" style="padding-left:24px;">📁 .. (Up to Parent)</span>`;
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
        return a.name.localeCompare(b.name);
    });

    sortedItems.forEach(item => {
        const domItem = document.createElement("div");
        domItem.className = "log-item";
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "file-checkbox";
        
        if (item.totalFileCount > 0) {
            checkbox.checked = item.selectedFileCount === item.totalFileCount;
            checkbox.indeterminate = item.selectedFileCount > 0 && item.selectedFileCount < item.totalFileCount;
        } else {
            checkbox.checked = item.files.length > 0 ? item.files.every((f: any) => f.selected) : false;
        }

        checkbox.onclick = (e) => {
            e.stopPropagation();
            const newState = checkbox.checked;
            item.files.forEach((f: ArchiveFileInfo) => f.selected = newState);
            renderFileList();
        };

        const info = document.createElement("div");
        info.className = "file-info-row";
        
        if (item.isDir) {
            const errorCount = item.files.filter((f: ArchiveFileInfo) => f.error).length;
            const errBadge = errorCount > 0 ? `<span style="color:#ef4444;margin-left:6px;font-size:11px;" title="${errorCount} file(s) with errors">⚠️ ${errorCount}</span>` : '';
            info.innerHTML = `<span class="file-name" style="cursor:pointer; color:var(--accent-color);"><span style="margin-right:6px;">📁</span>${item.name}${errBadge}</span>
                             <div class="flex-col" style="align-items:flex-end;width:180px;flex-shrink:0;">
                                 <div style="font-size:11px;font-family:monospace;"><span style="color:var(--text-muted);font-size:10px;">SIZE</span> ${formatBytes(item.size)}</div>
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
            const errIcon = hasError ? `<span style="color:#ef4444;margin-right:4px;" title="${hasError}">⚠️</span>` : '';
            const errStyle = hasError ? 'opacity:0.6;' : '';
            info.innerHTML = `<span class="file-name" style="${errStyle}">${errIcon}${lock}<span class="ext-badge" style="${hasError ? 'background:rgba(239,68,68,0.15);color:#ef4444;border-color:rgba(239,68,68,0.3);' : ''}">${badge}</span>${item.name}</span>
                             <div class="flex-col" style="align-items:flex-end;width:180px;flex-shrink:0;">
                                 <div style="font-size:11px;font-family:monospace;"><span style="color:var(--text-muted);font-size:10px;">SIZE</span> ${formatBytes(fileObj.size)}</div>
                                 ${hasError ? `<div style="font-size:10px;color:#ef4444;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${hasError}">Error: ${hasError}</div>` : ''}
                             </div>`;
        }

        domItem.appendChild(checkbox);
        domItem.appendChild(info);
        domItem.addEventListener("click", (e) => {
            if (e.target !== checkbox && !item.isDir) {
                checkbox.checked = !checkbox.checked;
                item.files.forEach((f: ArchiveFileInfo) => f.selected = checkbox.checked);
                renderFileList();
            } else if (e.target !== checkbox && item.isDir) {
                // If they click the row of a dir (not the name/link), we optionally navigate or toggle.
                // Let's navigate to be consistent with Finder.
                currentDirectory = item.fullPath;
                renderFileList();
            }
        });

        elements.logContainer?.appendChild(domItem);
    });
}

async function extractArchive() {
    if (isProcessing) return;
    try {
        if (!loadedArchive) {
            const selected = await open({ multiple: false, title: "Select Archive" });
            if (selected) await loadArchivePreview(selected);
            return;
        }

        const destDir = await open({ directory: true, title: "Extract To..." });
        if (!destDir) return;

        const selectedFiles = globalArchiveFiles.filter(f => f.selected).map(f => f.path);
        if (globalArchiveFiles.length && !selectedFiles.length) {
            await message("No files selected.", { title: "Error", kind: "error" });
            return;
        }

        lastResultPath = destDir;
        const targetFiles = selectedFiles.length < globalArchiveFiles.length ? selectedFiles : null;

        const topLevel = new Set<string>();
        selectedFiles.forEach(f => topLevel.add(f.split(/[/\\]/)[0]));
        const rootItems = Array.from(topLevel);

        const conflicts = await invoke<string[]>("check_conflicts", { destPath: destDir, rootItems });
        let conflictResolution = "overwrite";

        if (conflicts.length > 0) {
            const result = await requestConflictResolution(conflicts);
            if (!result || result === "cancel") return;
            conflictResolution = result;
        }

        setProcessing(true, "Extracting...");
        const unlistenProgress = await listen<number>("extract_progress", (e) => {
            currentProgress = e.payload;
            if (elements.progressFill) elements.progressFill.style.width = `${e.payload}%`;
            if (elements.progressText) elements.progressText.innerText = `${Math.round(e.payload)}%`;
        });
        const unlistenFilename = await listen<string>("extract_filename", (e) => {
            handleFilenameEvent(e.payload);
        });

        const unlistenError = await listen<{path: string, error: string}>("extract_error_prompt", async (e) => {
            const resolution = await new Promise<string>((resolve) => {
                const el = elements as any;
                el.extractErrorPath.innerText = e.payload.path;
                el.extractErrorMsg.innerText = e.payload.error;
                el.extractErrorModal.style.display = "flex";
                
                const cleanup = () => {
                    el.extractErrIgnoreAll.onclick = null;
                    el.extractErrIgnore.onclick = null;
                    el.extractErrCancel.onclick = null;
                    el.extractErrorModal.style.display = "none";
                };
                
                el.extractErrIgnoreAll.onclick = () => { cleanup(); resolve("ignore_all"); };
                el.extractErrIgnore.onclick = () => { cleanup(); resolve("ignore"); };
                el.extractErrCancel.onclick = () => { cleanup(); resolve("cancel"); };
            });
            await invoke("resolve_extract_error", { choice: resolution });
        });

        try {
            const report = await invoke<any>("extract_archive", { 
                archivePath: loadedArchive, 
                destPath: destDir, 
                password: currentArchivePassword, 
                targetFiles,
                conflictResolution,
                rootItems
            });
            showExtractionReport(report);
        } finally {
            unlistenProgress();
            unlistenFilename();
            unlistenError();
            setProcessing(false);
        }
    } catch (err: any) {
        await message(`Extraction failed: ${err}`, "Error");
        setProcessing(false);
    }
}

async function handleDirectCompression(paths: string[]) {
    const format = elements.formatSelect?.value || "zip";
    const ext = format.startsWith("tar") ? format : (format === "7z" ? "7z" : "zip");
    const destPath = await save({ filters: [{ name: "Archive", extensions: [ext] }], title: "Save Archive" });
    if (!destPath) return;

    lastResultPath = destPath;
    setProcessing(true, "Compressing...");
    const unlistenFilename = await listen<string>("extract_filename", (e) => {
        handleFilenameEvent(e.payload);
    });

    const password = elements.enablePasswordCb?.checked
      ? (elements.compressPasswordInput?.value || null)
      : null;
    const encryptLevel = (document.getElementById("encrypt-level") as HTMLSelectElement)?.value || null;

    try {
      await invoke("compress_archive", { 
        sourcePaths: paths, destPath, format, 
        splitSize: elements.splitSelect?.value || "0",
        password,
        encryptLevel
      });
      await message("Compression complete!", "Success");
    } catch (err: any) {
      await message(`Compression failed: ${err}`, "Error");
    } finally {
        unlistenFilename();
        setProcessing(false);
    }
}

async function compressSelected() {
    const selected = await open({ multiple: true, title: "Select items to compress" });
    if (selected) await handleDirectCompression(selected);
}

async function compressFolder() {
    const selected = await open({ directory: true, title: "Select folder to compress" });
    if (selected) await handleDirectCompression([selected]);
}

function requestPassword(validator: PasswordValidator, isRetry = false): Promise<string | null> {
    return new Promise((resolve) => {
        const { passwordModal, unlockPasswordInput, passwordSubmit, passwordCancel, modalErrorMsg } = elements;
        if (!passwordModal || !unlockPasswordInput) return resolve(null);

        if (modalErrorMsg) {
            modalErrorMsg.style.display = isRetry ? "block" : "none";
            modalErrorMsg.innerText = "Incorrect password. Please try again.";
        }

        passwordModal.style.display = "flex";
        unlockPasswordInput.value = "";
        unlockPasswordInput.focus();

        const cleanup = () => {
            passwordModal.style.display = "none";
            passwordSubmit.removeEventListener("click", onSubmit);
            passwordCancel.removeEventListener("click", onCancel);
        };

        const onSubmit = async () => {
            if (await validator(unlockPasswordInput.value)) { cleanup(); resolve(unlockPasswordInput.value); }
            else if (modalErrorMsg) modalErrorMsg.style.display = "block";
        };
        const onCancel = () => { cleanup(); resolve(null); };

        passwordSubmit.addEventListener("click", onSubmit);
        passwordCancel.addEventListener("click", onCancel);
    });
}

function requestConflictResolution(conflicts: string[]): Promise<string | null> {
    return new Promise((resolve) => {
        const { conflictModal, conflictMsg, conflictOverwrite, conflictKeep, conflictCancel } = elements;
        if (!conflictModal || !conflictMsg || !conflictOverwrite || !conflictKeep || !conflictCancel) return resolve(null);

        if (conflicts.length === 1) {
            conflictMsg.innerText = `'${conflicts[0]}' already exists. What would you like to do?`;
        } else {
            conflictMsg.innerText = `${conflicts.length} items (including '${conflicts[0]}') already exist. What would you like to do?`;
        }

        conflictModal.style.display = "flex";

        const cleanup = () => {
            conflictModal.style.display = "none";
            conflictOverwrite.removeEventListener("click", onOverwrite);
            conflictKeep.removeEventListener("click", onKeep);
            conflictCancel.removeEventListener("click", onCancel);
        };

        const onOverwrite = () => { cleanup(); resolve("overwrite"); };
        const onKeep = () => { cleanup(); resolve("keep_both"); };
        const onCancel = () => { cleanup(); resolve("cancel"); };

        conflictOverwrite.addEventListener("click", onOverwrite);
        conflictKeep.addEventListener("click", onKeep);
        conflictCancel.addEventListener("click", onCancel);
    });
}

function setProcessing(processing: boolean, statusLine: string = "") {
    isProcessing = processing;
    updateButtonState(processing);
    const { progressContainer, progressFill, progressText, progressStatus, btnReveal } = elements;

    if (progressContainer && progressFill && progressText && progressStatus) {
        if (processing) {
            if (btnReveal) btnReveal.style.display = "none";
            progressContainer.style.display = "flex";
            progressFill.style.width = "0%";
            progressText.innerText = "0%";
            progressStatus.innerText = statusLine;
            
            const lensAnimWrapper = document.getElementById('lens-anim-wrapper');
            if (lensAnimWrapper) {
                lensAnimWrapper.classList.remove('zip-mode', 'unzip-mode');
                if (statusLine.includes("Extract")) {
                    lensAnimWrapper.classList.add('unzip-mode');
                } else if (statusLine.includes("Compress")) {
                    lensAnimWrapper.classList.add('zip-mode');
                }
            }
            currentProgress = 0;
            startTime = Date.now();
            if (elements.progressEta) elements.progressEta.innerText = "ETA: --:--";
            if (elements.progressElapsed) elements.progressElapsed.innerText = "00:00";
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = window.setInterval(() => {
                const elapsedSec = (Date.now() - startTime) / 1000;
                if (elements.progressElapsed) elements.progressElapsed.innerText = formatTime(elapsedSec);

                if (currentProgress > 0 && currentProgress < 100) {
                    const totalEstSec = (elapsedSec / currentProgress) * 100;
                    const remainingSec = totalEstSec - elapsedSec;
                    if (elements.progressEta) elements.progressEta.innerText = `ETA: ${formatTime(remainingSec)}`;
                } else if (currentProgress >= 100) {
                    if (elements.progressEta) elements.progressEta.innerText = "ETA: 00:00";
                }
            }, 500);
        } else {
            if (timerInterval) clearInterval(timerInterval);
            if (btnReveal && lastResultPath) btnReveal.style.display = "block";
            setTimeout(() => { if (!isProcessing) progressContainer.style.display = "none"; }, 3000);
        }
    }
}

async function autoResizeWindow(fileCount: number) {
    try {
        const win = getCurrentWindow();
        const mon = await currentMonitor();
        if (mon) {
            const screenHeight = mon.size.height / mon.scaleFactor;
            const targetHeight = Math.max(600, Math.min(460 + (fileCount * 48), screenHeight * 0.5));
            await win.setSize(new LogicalSize(800, targetHeight));
        }
    } catch (e) {}
}

function handleFilenameEvent(filename: string) {
    if (elements.progressFilename) elements.progressFilename.innerText = filename;
}

function showExtractionReport(report: any) {
    const el = elements as any;
    el.reportModal.style.display = "flex";
    
    el.reportFailedList.innerHTML = "";
    el.reportSuccessList.innerHTML = "";
    
    if (report.failed_files.length > 0) {
        el.reportFailedSection.style.display = "block";
        el.reportIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        el.reportIcon.style.color = "#f59e0b";
        el.reportIcon.style.background = "rgba(245, 158, 11, 0.1)";
        el.reportTitle.innerText = "Partial Extraction Complete";
        el.reportDesc.innerText = `Successfully extracted ${report.success_files.length} files, but ${report.failed_files.length} files encountered errors.`;
        
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
        el.reportIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        el.reportIcon.style.color = "#10b981";
        el.reportIcon.style.background = "rgba(16, 185, 129, 0.1)";
        el.reportTitle.innerText = "Extraction Complete";
        el.reportDesc.innerText = `Successfully extracted ${report.success_files.length} files.`;
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
            li.innerText = `...and ${report.success_files.length - maxDisplay} more`;
            li.style.opacity = "0.6";
            el.reportSuccessList.appendChild(li);
        }
    } else {
        el.reportSuccessSection.style.display = "none";
    }
    
    el.reportClose.onclick = () => {
        el.reportModal.style.display = "none";
    };

    const generateTxt = async () => {
        const findSize = (p: string): string => {
            const f = globalArchiveFiles.find(f => p.endsWith(f.path));
            return f ? formatBytes(f.size) : '-';
        };

        let content = "=== ZipLens Extraction Report ===\n";
        content += `Date: ${new Date().toLocaleString()}\n`;
        content += `Status: ${report.failed_files.length > 0 ? 'Partial Success' : 'Success'}\n`;
        content += `Total Success: ${report.success_files.length}\n`;
        content += `Total Failed: ${report.failed_files.length}\n`;
        content += "=".repeat(40) + "\n\n";
        
        if (report.failed_files.length > 0) {
            content += "--- FAILED FILES ---\n\n";
            report.failed_files.forEach(([path, err]: [string, string], idx: number) => {
                const fname = path.split(/[\/\\]/).pop() || path;
                const ext = fname.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '-';
                const size = findSize(path);
                content += `${idx + 1}. ${fname}\n`;
                content += `   Extension: ${ext}\n`;
                content += `   Size: ${size}\n`;
                content += `   Path: ${path}\n`;
                content += `   Error: ${err}\n\n`;
            });
        }
        
        if (report.success_files.length > 0) {
            content += "--- SUCCESSFUL FILES ---\n\n";
            report.success_files.forEach((path: string, idx: number) => {
                const fname = path.split(/[\/\\]/).pop() || path;
                const ext = fname.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '-';
                const size = findSize(path);
                content += `${idx + 1}. [${ext}] ${fname} (${size}) — ${path}\n`;
            });
        }
        
        const filePath = await save({ filters: [{ name: "Text", extensions: ["txt"] }], title: "Save Report as TXT" });
        if (filePath) {
            try {
                await invoke("save_report_file", { filePath, content });
                await message("Report saved successfully!", "Success");
            } catch (err: any) {
                await message(`Failed to save report: ${err}`, { title: "Error", kind: "error" });
            }
        }
    };

    const generateCsv = async () => {
        const findSize = (p: string): number => {
            const f = globalArchiveFiles.find(f => p.endsWith(f.path));
            return f ? f.size : 0;
        };

        let content = "\uFEFF상태,파일명,확장자,용량,전체경로,에러\n";
        report.failed_files.forEach(([path, err]: [string, string]) => {
            const fname = path.split(/[\/\\]/).pop() || path;
            const ext = fname.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '';
            const size = findSize(path);
            content += `실패,"${fname.replace(/"/g, '""')}","${ext}","${formatBytes(size)}","${path.replace(/"/g, '""')}","${err.replace(/"/g, '""')}"\n`;
        });
        report.success_files.forEach((path: string) => {
            const fname = path.split(/[\/\\]/).pop() || path;
            const ext = fname.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '';
            const size = findSize(path);
            content += `성공,"${fname.replace(/"/g, '""')}","${ext}","${formatBytes(size)}","${path.replace(/"/g, '""')}",\n`;
        });
        
        const filePath = await save({ filters: [{ name: "CSV", extensions: ["csv"] }], title: "Save Report as CSV" });
        if (filePath) {
            try {
                await invoke("save_report_file", { filePath, content });
                await message("Report saved successfully!", "Success");
            } catch (err: any) {
                await message(`Failed to save report: ${err}`, { title: "Error", kind: "error" });
            }
        }
    };

    el.reportExportTxt.onclick = generateTxt;
    el.reportExportCsv.onclick = generateCsv;
}
