// Ambient module declaration for `@zenon-lab/personal-data-guard`.
//
// ⚠️ WHY THIS FILE EXISTS. The package is a devDependency declared as
// `file:../personal-data-guard` — a SIBLING checkout that exists on the
// maintainer's machine and nowhere else. A clean clone (any adopter, CI)
// never has that sibling: `npm ci` leaves a DANGLING symlink there, and
// without this file `tsc` could not resolve the package's own types at all,
// failing `check:types` on every machine but the maintainer's.
//
// 🛑 TYPESCRIPT ONLY FALLS BACK TO THIS DECLARATION WHEN THE REAL PACKAGE
//    CANNOT BE RESOLVED through normal module resolution. When the sibling
//    IS present (the maintainer's machine), the package's OWN types win and
//    this file is never even consulted — present ⇒ unchanged behavior,
//    absent ⇒ `check:types` still passes. NEVER remove this thinking it is
//    redundant with the real package's types: that removes the one case it
//    exists for.
//
// 🛑 KEEP IN SYNC WITH THE SLICE THIS REPO ACTUALLY CONSUMES
//    (`src/commit-msg-leak.js`, `tools/commit-msg-check.js`) — this is NOT
//    the package's full public API, only the functions ctxroute calls from
//    TYPE-CHECKED (non-test) code. Widening it beyond that would let a typo
//    in a real signature slip through unnoticed.
declare module '@zenon-lab/personal-data-guard' {
  export function scan(
    text: string,
    patterns: { name: string; re: RegExp }[]
  ): { name: string; excerpt: string }[];

  export function forbiddenPatterns(
    user?: string,
    personalFolder?: string,
    extras?: string[]
  ): { name: string; re: RegExp }[];
}
