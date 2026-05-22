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
  get selectAllBtn() { return document.getElementById("select-all") as HTMLButtonElement; },
  get deselectAllBtn() { return document.getElementById("deselect-all") as HTMLButtonElement; },
  get toggleAllBtn() { return document.getElementById("toggle-all") as HTMLButtonElement; },
  get btnReveal() { return document.getElementById("btn-reveal") as HTMLButtonElement; },
  get conflictModal() { return document.getElementById("conflict-modal") as HTMLDivElement; },
  get conflictMsg() { return document.getElementById("conflict-msg") as HTMLParagraphElement; },
  get conflictOverwrite() { return document.getElementById("conflict-overwrite") as HTMLButtonElement; },
  get conflictKeep() { return document.getElementById("conflict-keep") as HTMLButtonElement; },
  get conflictCancel() { return document.getElementById("conflict-cancel") as HTMLButtonElement; },

  get extractErrorModal() { return document.getElementById("extract-error-modal") as HTMLDivElement; },
  get extractErrorPath() { return document.getElementById("extract-error-path") as HTMLParagraphElement; },
  get extractErrorMsg() { return document.getElementById("extract-error-msg") as HTMLParagraphElement; },
  get extractErrIgnoreAll() { return document.getElementById("extract-err-ignore-all") as HTMLButtonElement; },
  get extractErrIgnore() { return document.getElementById("extract-err-ignore") as HTMLButtonElement; },
  get extractErrCancel() { return document.getElementById("extract-err-cancel") as HTMLButtonElement; },

  get reportModal() { return document.getElementById("report-modal") as HTMLDivElement; },
  get reportIcon() { return document.getElementById("report-icon") as HTMLDivElement; },
  get reportTitle() { return document.getElementById("report-title") as HTMLHeadingElement; },
  get reportDesc() { return document.getElementById("report-desc") as HTMLParagraphElement; },
  get reportFailedSection() { return document.getElementById("report-failed-section") as HTMLDivElement; },
  get reportFailedList() { return document.getElementById("report-failed-list") as HTMLUListElement; },
  get reportSuccessSection() { return document.getElementById("report-success-section") as HTMLDivElement; },
  get reportSuccessList() { return document.getElementById("report-success-list") as HTMLUListElement; },
  get reportClose() { return document.getElementById("report-close") as HTMLButtonElement; },
  get reportExportTxt() { return document.getElementById("report-export-txt") as HTMLButtonElement; },
  get reportExportCsv() { return document.getElementById("report-export-csv") as HTMLButtonElement; },
  get breadcrumbContainer() { return document.getElementById("breadcrumb-container") as HTMLDivElement; },
  
  get btnAbout() { return document.getElementById("btn-about") as HTMLButtonElement; },
  get aboutModal() { return document.getElementById("about-modal") as HTMLDivElement; },
  get aboutClose() { return document.getElementById("about-close") as HTMLButtonElement; },
  get aboutCloseX() { return document.getElementById("about-close-x") as HTMLButtonElement; }
};


/**
 * Updates UI processing state
 */
export function updateButtonState(processing: boolean) {
  if (elements.btnExtract) (elements.btnExtract as HTMLButtonElement).disabled = processing;
  if (elements.btnCompressFile) (elements.btnCompressFile as HTMLButtonElement).disabled = processing;
  if (elements.btnCompress) (elements.btnCompress as HTMLButtonElement).disabled = processing;
}
