/**
 * lint ルールのテスト。fixtures/app の各ファイルは、わざと違反を書いてある。
 * 先頭の `// expect: <ルール> | <メッセージの一部>` が、そのファイルに出るべき指摘。
 * メッセージは AI への指示なので、メッセージの一部も固定する。
 * 指摘の数は expect の数と一致する（余計な指摘が出たら落ちる）。expect の無いファイルは 0 件
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, "fixtures", "app");
const oxlint = path.join(here, "..", "node_modules", ".bin", "oxlint");

const run = () => {
  let stdout;
  try {
    stdout = execFileSync(oxlint, ["-c", ".oxlintrc.json", "--format", "json", "."], {
      cwd: app,
      encoding: "utf8",
    });
  } catch (error) {
    // 指摘があると終了コードが 1 になる。JSON は stdout に出ている
    stdout = error.stdout;
    if (!stdout) throw error;
  }
  return JSON.parse(stdout).diagnostics;
};

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const expectations = (file) =>
  [...fs.readFileSync(file, "utf8").matchAll(/^\/\/ expect: (.+?) \| (.+)$/gm)].map((m) => ({
    rule: m[1],
    message: m[2],
  }));

const diagnostics = run();
const files = walk(app).filter((f) => f.endsWith(".ts"));

for (const file of files) {
  const rel = path.relative(app, file);
  test(rel, () => {
    const expected = expectations(file);
    const actual = diagnostics.filter((d) => path.resolve(app, d.filename) === file);
    const shown = actual.map((d) => `${d.code}: ${d.message}`).join("\n");
    assert.equal(actual.length, expected.length, `expected ${expected.length}, got:\n${shown}`);
    for (const e of expected) {
      const rule = `${e.rule.split("/")[0]}(${e.rule.split("/")[1]})`;
      assert.ok(
        actual.some((d) => d.code === rule && d.message.includes(e.message)),
        `missing ${e.rule} "${e.message}" in:\n${shown}`,
      );
    }
  });
}

test("every diagnostic points to a void-kit docs page that exists", () => {
  for (const d of diagnostics.filter((d) => d.code.startsWith("void-kit("))) {
    const page = /node_modules\/void-kit\/docs\/(\S+)$/.exec(d.message)?.[1];
    assert.ok(page, d.message);
    assert.ok(fs.existsSync(path.join(here, "..", "docs", page)), `docs/${page} is missing`);
  }
});
