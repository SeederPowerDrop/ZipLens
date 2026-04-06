/**
 * Centralized DOM element references
 */
export const elements = {
  get dropZone() { return document.getElementById("drop-zone"); },
  get btnExtract() { return document.getElementById("btn-extract"); },
  get btnCompressFile() { return document.getElementById("btn-compress-file"); },
  get btnCompress() { return document.getElementById("btn-compress"); },
  get progressContainer() { return document.getElementById("progress-container"); },
  get progressFill() { return document.getElementById("progress-fill"); },
  get progressText() { return document.getElementById("progress-text"); },
  get progressStatus() { return document.getElementById("progress-status"); },
  get progressFilename() { return document.getElementById("progress-filename"); },
  get progressElapsed() { return document.getElementById("progress-elapsed"); },
  get progressEta() { return document.getElementById("progress-eta"); },
  get formatSelect() { return document.getElementById("format-select") as HTMLSelectElement; },
  get splitSelect() { return document.getElementById("split-select") as HTMLInputElement; },
  get enablePasswordCb() { return document.getElementById("enable-password-cb") as HTMLInputElement; },
  get compressPasswordGroup() { return document.getElementById("compress-password-group") as HTMLDivElement; },
  get compressPwdToggle() { return document.getElementById("compress-pwd-toggle") as HTMLButtonElement; },
  get compressPasswordInput() { return document.getElementById("compress-password") as HTMLInputElement; },
  get unlockPwdToggle() { return document.getElementById("unlock-pwd-toggle") as HTMLButtonElement; },
  get unlockPasswordInput() { return document.getElementById("unlock-password") as HTMLInputElement; },
  get logContainer() { return document.getElementById("log-container"); },
  get previewHeader() { return document.getElementById("preview-header"); },
  get previewColsHeader() { return document.getElementById("preview-cols-header"); },
  get passwordModal() { return document.getElementById("password-modal") as HTMLDivElement; },
  get passwordSubmit() { return document.getElementById("password-submit") as HTMLButtonElement; },
  get passwordCancel() { return document.getElementById("password-cancel") as HTMLButtonElement; },
  get modalErrorMsg() { return document.getElementById("modal-error-msg") as HTMLDivElement; },
  get previewStatsMain() { return document.getElementById("preview-stats-main"); },
  get previewStatsSub() { return document.getElementById("preview-stats-sub"); },
  get extFilterContainer() { return document.getElementById("ext-filter-container"); },
  get searchInput() { return document.getElementById("preview-search") as HTMLInputElement; },
  get searchMatchesText() { return document.getElementById("search-matches-text"); },
  get toggleAllBtn() { return document.getElementById("toggle-all") as HTMLButtonElement; },
  get btnReveal() { return document.getElementById("btn-reveal") as HTMLButtonElement; }
};

/**
 * Updates UI processing state
 */
export function updateButtonState(processing: boolean) {
  if (elements.btnExtract) (elements.btnExtract as HTMLButtonElement).disabled = processing;
  if (elements.btnCompressFile) (elements.btnCompressFile as HTMLButtonElement).disabled = processing;
  if (elements.btnCompress) (elements.btnCompress as HTMLButtonElement).disabled = processing;
}
