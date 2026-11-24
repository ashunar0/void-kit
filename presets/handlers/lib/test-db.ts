import { readdirSync, readFileSync } from "node:fs";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterAll } from "vite-plus/test";
import { createDb } from "void/db";

/** Splits a migration file into its statements, without the comment lines */
const statementsOf = (file: string) =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((part) => part.replace(/^\s*--.*$/gm, "").trim())
    .filter((part) => part !== "");

/**
 * A fresh local D1 (the same Miniflare D1 as `vp dev`) with every migration in db/migrations applied,
 * as the `db` of "void/db" for one test file:
 * `vi.mock("void/db", async (original) => ({ ...(await original()), db: await createTestDb() }))`.
 * It is thrown away when the file's tests end
 */
export const createTestDb = async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({ modules: true, script: "export default {}", d1Databases: ["DB"] }),
  );
  afterAll(() => mf.dispose());
  const d1 = await mf.getD1Database("DB");
  const files = readdirSync("db/migrations").filter((file) => file.endsWith(".sql")).sort();
  for (const file of files)
    for (const statement of statementsOf(`db/migrations/${file}`)) await d1.prepare(statement).run();
  return createDb(d1);
};
