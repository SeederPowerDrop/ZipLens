import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, message, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow, LogicalSize, currentMonitor } from "@tauri-apps/api/window";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { formatBytes, formatTime } from "./utils";
import { elements, updateButtonState } from "./ui";

// --- State Variables ---
let lastResultPath: string | null = null;
let loadedArchive: string | null = null;
let currentArchivePassword: string | null = null;
let isProcessing = false;
let startTime = 0;
let timerInterval: number | null = null;
let currentProgress = 0;


interface StartupAction {
  action: "extract" | "compress" | "";
  paths: string[];
}

interface ArchiveFileInfo {
  path: string;
  size: number;
  compressed_size: number | null;
  is_encrypted: boolean;
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
            } else {
                throw err;
            }
        }
        
        loadedArchive = path;
        if (elements.dropZone) elements.dropZone.classList.add("loaded");
        if (elements.previewHeader) elements.previewHeader.style.display = "flex";
        if (elements.previewColsHeader) elements.previewColsHeader.style.display = "flex";

        // Update stats
        if (elements.previewStatsMain && elements.previewStatsSub) {
            elements.previewStatsMain.innerText = `${files.length} / ${files.length} files selected`;
            const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
            elements.previewStatsSub.innerText = `(Extracted Size: ${formatBytes(totalSize)} / Total: ${formatBytes(totalSize)})`;
        }

        renderFileList(files);
        await autoResizeWindow(files.length);

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

function renderFileList(files: ArchiveFileInfo[]) {
    if (!elements.logContainer) return;
    elements.logContainer.innerHTML = "";
    elements.logContainer.style.display = "flex";

    const checkboxesArray: HTMLInputElement[] = [];
    let lastCheckedIndex: number | null = null;

    const updateStats = () => {
        let selCount = 0, selSize = 0, totalSize = 0, visCount = 0;
        checkboxesArray.forEach((cb, idx) => {
            const item = elements.logContainer?.children[idx] as HTMLElement;
            if (!item || item.style.display === "none") return;
            visCount++;
            const fSize = files[idx].size || 0;
            totalSize += fSize;
            if (cb.checked) { selCount++; selSize += fSize; }
        });
        if (elements.previewStatsMain && elements.previewStatsSub) {
            elements.previewStatsMain.innerText = `${selCount} / ${visCount} files selected`;
            elements.previewStatsSub.innerText = `(Extracted Size: ${formatBytes(selSize)} / Total: ${formatBytes(totalSize)})`;
        }
    };

    files.forEach((f, idx) => {
        const item = document.createElement("div");
        item.className = "log-item";
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "file-checkbox";
        checkbox.value = f.path;
        checkbox.checked = true;
        
        checkbox.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.shiftKey && lastCheckedIndex !== null) {
                const [start, end] = [Math.min(lastCheckedIndex, idx), Math.max(lastCheckedIndex, idx)];
                for (let i = start; i <= end; i++) checkboxesArray[i].checked = checkbox.checked;
            }
            lastCheckedIndex = idx;
            updateStats();
        });

        const info = document.createElement("div");
        info.className = "file-info-row";
        const badge = f.path.match(/\.([^.\\/]+)$/)?.[1]?.toUpperCase().substring(0, 5) || "FILE";
        const lock = f.is_encrypted ? '🔒 ' : '';
        info.innerHTML = `<span class="file-name">${lock}<span class="ext-badge">${badge}</span>${f.path}</span>
                         <div class="flex-col" style="align-items:flex-end;width:180px;flex-shrink:0;">
                             <div style="font-size:11px;font-family:monospace;"><span style="color:var(--text-muted);font-size:10px;">SIZE</span> ${formatBytes(f.size)}</div>
                         </div>`;

        item.appendChild(checkbox);
        item.appendChild(info);
        item.addEventListener("click", (e) => {
            if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
            updateStats();
        });

        checkboxesArray.push(checkbox);
        elements.logContainer?.appendChild(item);
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

        const checkboxes = elements.logContainer?.querySelectorAll(".file-checkbox") as NodeListOf<HTMLInputElement>;
        const selectedFiles = Array.from(checkboxes || []).filter(cb => cb.checked).map(cb => cb.value);
        if (checkboxes?.length && !selectedFiles.length) {
            await message("No files selected.", { title: "Error", kind: "error" });
            return;
        }

        lastResultPath = destDir;
        const targetFiles = selectedFiles.length < (checkboxes?.length || 0) ? selectedFiles : null;

        setProcessing(true, "Extracting...");
        const unlisten = await listen<number>("extract_progress", (e) => {
            currentProgress = e.payload;
            if (elements.progressFill) elements.progressFill.style.width = `${e.payload}%`;
            if (elements.progressText) elements.progressText.innerText = `${Math.round(e.payload)}%`;
        });

        try {
            await invoke("extract_archive", { 
                archivePath: loadedArchive, 
                destPath: destDir, 
                password: currentArchivePassword, 
                targetFiles 
            });
            await message("Extraction complete!", { title: "Success", kind: "info" });
        } finally {
            unlisten();
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

    try {
      await invoke("compress_archive", { sourcePaths: paths, destPath, format, splitSize: elements.splitSelect?.value || "0" });
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
