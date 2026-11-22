// expect: void-kit/no-module-scope-state | let at module scope
// expect: void-kit/no-module-scope-state | new Map() at module scope
export let count = 0;
export const cache = new Map<string, string>();
