/**
 * void-kit init のテスト。Void や人が書いたものを残して、void-kit の分だけを書くこと。
 * 2 回打っても同じになること
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "void-kit.mjs");
const run = (cwd, ...args) => execFileSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });

const voidApp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "void-kit-"));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "app",
      scripts: { dev: "vp dev", postinstall: "void prepare" },
      devDependencies: { void: "^1.11.0" },
    }),
  );
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules\n");
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "<!--injected-by-void-v1.11.0-->\n## Void\n<!--/injected-by-void-->\n");
  return dir;
};

test("init adds the lint config, the AGENTS.md block and the check script, and keeps the rest", () => {
  const dir = voidApp();
  run(dir, "init");
  const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
  assert.match(agents, /^<!--injected-by-void-v1\.11\.0-->\n## Void\n/);
  assert.match(agents, /<!--injected-by-void-kit-->[\s\S]*node_modules\/void-kit\/docs\/index\.md/);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  assert.deepEqual(pkg.scripts, {
    dev: "vp dev",
    postinstall: "void prepare && void-kit prepare",
    check: "void-kit check",
  });
  assert.match(fs.readFileSync(path.join(dir, ".gitignore"), "utf8"), /^node_modules\nsrc\/void-kit\.gen\.d\.ts\n$/);
  assert.match(fs.readFileSync(path.join(dir, ".oxlintrc.json"), "utf8"), /void-kit\/lint\/recommended\.json/);
});

test("init twice changes nothing", () => {
  const dir = voidApp();
  run(dir, "init");
  const snapshot = () =>
    ["AGENTS.md", "package.json", ".oxlintrc.json", ".gitignore"].map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
  const first = snapshot();
  assert.match(run(dir, "init"), /Already set up/);
  assert.deepEqual(snapshot(), first);
});

test("init says when Void's auth looks off, and not when it is on", () => {
  const dir = voidApp();
  assert.match(run(dir, "init"), /auth looks off/);
  fs.writeFileSync(path.join(dir, "void.config.ts"), 'export default defineConfig({ auth: { providers: ["email"] } });');
  assert.doesNotMatch(run(dir, "init"), /auth looks off/);
});

test("init stops outside a Void app", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "void-kit-"));
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
  assert.throws(() => run(dir, "init"), /npx void init/);
});

test("prepare writes the failures of every endpoint, keyed as Void's RouteMap", () => {
  const dir = voidApp();
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };
  write("routes/index.ts", "export const GET = createEndpoint();\n");
  write("routes/(admin)/users/[id]/index.ts", "export const GET = createEndpoint();\nexport const DELETE = createEndpoint();\n");
  write("routes/users/[id]/index.dev.ts", "export const POST = createEndpoint();\n");
  write("routes/_lib/index.ts", "export const GET = 1;\n");
  write("routes/users/[id]/_response.ts", "export const GET = 1;\n");
  run(dir, "prepare");
  const generated = fs.readFileSync(path.join(dir, "src", "void-kit.gen.d.ts"), "utf8");
  assert.match(generated, /"\/": \{\n {6}GET: FailuresOf<\(typeof import\("\.\.\/routes\/index\.ts"\)\)\["GET"\]>;/);
  assert.match(generated, /"\/users\/\[id\]": \{\n {6}GET: .*\(admin\)\/users\/\[id\]\/index\.ts.*\n {6}DELETE: .*\n {6}POST: .*index\.dev\.ts/);
  assert.doesNotMatch(generated, /_lib|_response/);
  assert.match(run(dir, "prepare"), /up to date/);
});
