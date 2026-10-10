import { isArchivePath } from "./archive-model.ts";

/** Rust의 파일 메타데이터로 확인한 입력이다. .zip으로 끝나는 폴더도 압축할 재료로 취급한다. */
export interface InputPath {
  path: string;
  isDirectory: boolean;
}

export type InputRoute =
  | { kind: "empty" }
  | { kind: "extract"; path: string; archiveCount: number }
  | { kind: "compress"; paths: string[] };

/**
 * 입력 순서를 유지하며 중복을 제거한다. 모두 압축 파일일 때만 첫 파일의 목록을 연다.
 * 일반 파일/폴더가 하나라도 섞이면 선택 전체를 새 압축 파일의 재료로 유지한다.
 * 실제 열기·안내 메시지·압축 옵션 표시는 호출자가 맡는다.
 */
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
