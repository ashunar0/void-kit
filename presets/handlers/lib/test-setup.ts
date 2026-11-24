import { vi } from "vite-plus/test";

/**
 * Every test file gets its own fresh local D1 as the `db` of "void/db" (setupFiles in vite.config.ts).
 * The rest of "void/db" (sql, eq, ...) is Void's own
 */
vi.mock("void/db", async (original) => ({
  ...(await original<typeof import("void/db")>()),
  db: await (await import("./test-db")).createTestDb(),
}));
