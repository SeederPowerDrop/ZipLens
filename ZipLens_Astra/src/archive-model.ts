/** Shared path/selection rules; keep these independent of Tauri and the DOM. */
export function archiveStem(filename: string): string {
  return filename.replace(/\.(?:tar\.(?:gz|zst|bz2|xz)|(?:zip|7z)\.\d{3}|tgz|tzst|tbz2?|txz|zip|zipx|cbz|7z|rar|tar|gz|zst|bz2|xz)$/i, "") || "Archive";
}
export function archiveRoots(paths: string[]): string[] {
  return [...new Set(paths.map(p => p.replace(/\\/g, "/").split("/").filter(x => x && x !== ".")[0]).filter(Boolean))];
}
export function csvCell(value: string | number): string {
  let text = String(value);
  // Quoting alone doesn't prevent spreadsheet formula execution from an archive filename.
  if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
