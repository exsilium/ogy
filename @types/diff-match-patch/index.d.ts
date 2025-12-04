declare module "diff-match-patch" {
  export const DIFF_DELETE: -1;
  export const DIFF_INSERT: 1;
  export const DIFF_EQUAL: 0;

  export type Diff = [number, string];

  export class diff_match_patch {
    diff_main(text1: string, text2: string): Diff[];
  }
}
