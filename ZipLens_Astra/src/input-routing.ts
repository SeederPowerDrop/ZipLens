import { isArchivePath } from "./archive-model.ts";

/** Native metadata prevents archive-like directory names from opening as archives. */
export interface InputPath {
  path: string;
  isDirectory: boolean;
}

export type InputRoute =
  | { kind: "empty" }
  | { kind: "extract"; path: string; archiveCount: number }
  | { kind: "compress"; paths: string[] };

/** A mixed selection is kept together as the input of a new archive. */
export function classifyInputPaths(inputs: readonly InputPath[]): InputRoute {
  const uniqueInputs = [...new Map(inputs.map(input => [input.path, input])).values()];
  if (uniqueInputs.length === 0) return { kind: "empty" };

  if (uniqueInputs.every(input => !input.isDirectory && isArchivePath(input.path))) {
    return {
      kind: "extract",
      path: uniqueInputs[0].path,
      archiveCount: uniqueInputs.length
    };
  }

  return { kind: "compress", paths: uniqueInputs.map(input => input.path) };
}
