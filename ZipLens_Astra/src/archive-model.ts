import appConfig from "../src-tauri/tauri.conf.json" with { type: "json" };

/** Finder, drag-and-drop and CLI recognition share the bundle's extension list. */
export const archiveExtensions = appConfig.bundle.fileAssociations.flatMap(type => type.ext);
export function isArchivePath(path: string): boolean {
  const name = path.replace(/\\/g, "/").split("/").pop() || "";
  return archiveExtensions.includes(name.split(".").pop()!.toLowerCase()) && name.includes(".");
}
/** Shared path/selection rules; keep these independent of Tauri and the DOM. */
export function archiveStem(filename: string): string {
  const compound = /\.(?:tar\.(?:gz|gzip|zst|zstd|bz2|bzip2|xz|lzma|z)|(?:zip|7z)\.\d{3})$/i;
  if (compound.test(filename)) return filename.replace(compound, "") || "Archive";
  return (isArchivePath(filename) ? filename.replace(/\.[^.]+$/, "") : filename) || "Archive";
}
export function archiveRoots(paths: string[]): string[] {
  return [...new Set(paths.map(p => p.replace(/\\/g, "/").split("/").filter(x => x && x !== ".")[0]).filter(Boolean))];
}

export interface ExtractionSnapshot {
  archivePath: string;
  password: string | null;
  targetFiles: string[] | null;
  rootItems: string[];
  emptySelection: boolean;
}

/** Capture before any dialog awaits: Finder events must not change the extraction request. */
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
export function csvCell(value: string | number): string {
  let text = String(value);
  // Quoting alone doesn't prevent spreadsheet formula execution from an archive filename.
  if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
