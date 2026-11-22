#!/usr/bin/env node
/**
 * void-kit の CLI。
 *   void-kit init    `void init` で作った Void アプリに void-kit の決まりを足す。
 *                    .oxlintrc.json・AGENTS.md のブロック・package.json の check を書く。アプリのコードには触らない
 *   void-kit prepare routes/ の endpoint から、失敗の型の表（src/void-kit.gen.d.ts）を書く。fetchResult が読む
 *   void-kit check   void prepare → void-kit prepare → 型検査 → lint → テスト。落ちても最後まで回し、失敗をまとめて出す
 *
 * check の中身はどのアプリでも同じなので、アプリに写さずここに持つ（hono-kit は scripts/check.mjs を写していた）
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const app = process.cwd();
const require = createRequire(import.meta.url);

const die = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const readPackage = () => {
  const file = path.join(app, "package.json");
  if (!fs.existsSync(file)) die("No package.json here. Run this at the root of a Void app");
  return readJson(file);
};

/** ロックファイルから、アプリが使っているパッケージマネージャを決める */
const packageManager = () =>
  [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ].find(([lock]) => fs.existsSync(path.join(app, lock)))?.[1] ?? "npm";

// ---- prepare ----

/** 失敗の型の表を書く場所。Void が書く tsconfig の include に src は入っている。.void/ は Void が知らないファイルを消すので使わない */
const GENERATED = "src/void-kit.gen.d.ts";
const METHODS = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g;
const ENTRY = /^index(\.(dev|prod))?\.(ts|mts|js|mjs)$/;

/** Void と同じく routes/（sourceDir を src にしていれば src/routes/） */
const routesDir = () =>
  ["routes", "src/routes"].map((dir) => path.join(app, dir)).find((dir) => fs.existsSync(dir));

/** routes/ の下の endpoint のファイル。`_` で始まる区切りは Void も読まない。index.ts 以外は lint が止める */
const entryFiles = (dir, segments = []) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("_") || (entry.name.startsWith(".") && entry.name !== ".well-known")) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entryFiles(full, [...segments, entry.name]);
    return ENTRY.test(entry.name) ? [{ file: full, segments }] : [];
  });

/** Void の RouteMap と同じ鍵: `(group)` を抜き、`[id]` はそのまま（`/invoices/[id]`） */
const patternOf = (segments) =>
  `/${segments.filter((s) => !(s.startsWith("(") && s.endsWith(")"))).join("/")}`;

const prepare = () => {
  const dir = routesDir();
  const out = path.join(app, GENERATED);
  /** pattern → method → それを export しているファイル（.dev と .prod で同じ URL を持てる） */
  const table = new Map();
  for (const { file, segments } of dir ? entryFiles(dir) : []) {
    const methods = table.get(patternOf(segments)) ?? new Map();
    for (const [, method] of fs.readFileSync(file, "utf8").matchAll(METHODS))
      methods.set(method, [...(methods.get(method) ?? []), file]);
    table.set(patternOf(segments), methods);
  }

  const importOf = (file) => {
    const rel = path.relative(path.dirname(out), file).replace(/\\/g, "/");
    return `(typeof import(${JSON.stringify(rel.startsWith(".") ? rel : `./${rel}`)}))`;
  };
  const entries = [...table]
    .filter(([, methods]) => methods.size > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pattern, methods]) => {
      const lines = [...methods].map(
        ([method, files]) =>
          `      ${method}: ${files.map((f) => `FailuresOf<${importOf(f)}[${JSON.stringify(method)}]>`).join(" | ")};`,
      );
      return `    ${JSON.stringify(pattern)}: {\n${lines.join("\n")}\n    };`;
    });
  const text = `// Written by \`void-kit prepare\` from routes/. Never edit it; not committed.
import type { FailuresOf } from "void-kit/client";

declare module "void-kit/client" {
  interface FailureMap {
${entries.join("\n")}
  }
}
`;
  const before = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : undefined;
  if (before !== text) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    console.log(`✓ Wrote ${GENERATED}`);
  } else console.log(`✓ ${GENERATED} is up to date`);
};

// ---- init ----

const AGENTS_START = "<!--injected-by-void-kit-->";
const AGENTS_END = "<!--/injected-by-void-kit-->";
const AGENTS_BLOCK = `${AGENTS_START}
## void-kit

- Server routes (\`routes/\`) are written with [void-kit](https://github.com/ashunar0/void-kit), on top of Void. **Before writing anything under \`routes/\`, read \`node_modules/void-kit/docs/index.md\`**, then the page for what you are doing. Where void-kit and Void's docs differ about routes, void-kit wins.
- **Do not stop until \`void-kit check\` (the \`check\` script) prints \`All checks passed\`.** Every lint message says how to fix it. Do not silence lint.

${AGENTS_END}`;

const OXLINTRC = `{
  "extends": ["./node_modules/void-kit/lint/recommended.json"]
}
`;

/** Void の auth が有効そうか。auth.ts があるか、void.config に auth の設定があるか */
const authLooksOn = () => {
  const has = (name) => ["ts", "mts", "js", "mjs"].some((ext) => fs.existsSync(path.join(app, `${name}.${ext}`)));
  if (has("auth")) return true;
  const config = ["ts", "mts", "js", "mjs"]
    .map((ext) => path.join(app, `void.config.${ext}`))
    .find((file) => fs.existsSync(file));
  return config !== undefined && /["']?\bauth["']?\s*:/.test(fs.readFileSync(config, "utf8"));
};

const init = () => {
  const pkg = readPackage();
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!deps.void) die("This is not a Void app (no void in package.json). Run `npx void init` first");
  const done = [];

  const oxlintrc = path.join(app, ".oxlintrc.json");
  if (!fs.existsSync(oxlintrc)) {
    fs.writeFileSync(oxlintrc, OXLINTRC);
    done.push("wrote .oxlintrc.json");
  } else if (!fs.readFileSync(oxlintrc, "utf8").includes("void-kit/lint/recommended.json")) {
    console.log(`! .oxlintrc.json exists: add "./node_modules/void-kit/lint/recommended.json" to its "extends" yourself`);
  }

  // AGENTS.md: void-kit のブロックだけを書き直す（Void や人が書いた所は残す）
  const agents = path.join(app, "AGENTS.md");
  const before = fs.existsSync(agents) ? fs.readFileSync(agents, "utf8") : "";
  const pattern = new RegExp(`${AGENTS_START}[\\s\\S]*?${AGENTS_END}`);
  const after = pattern.test(before)
    ? before.replace(pattern, AGENTS_BLOCK)
    : `${before}${before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n"}${AGENTS_BLOCK}\n`;
  if (after !== before) {
    fs.writeFileSync(agents, after);
    done.push("wrote the void-kit block in AGENTS.md");
  }

  // 生成物は git に入れない（Void の .void/ と同じ。install と check のたびに書く）
  const gitignore = path.join(app, ".gitignore");
  const ignored = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, "utf8") : "";
  if (!ignored.split("\n").includes(GENERATED)) {
    fs.writeFileSync(gitignore, `${ignored}${ignored === "" || ignored.endsWith("\n") ? "" : "\n"}${GENERATED}\n`);
    done.push(`added ${GENERATED} to .gitignore`);
  }

  // install の後に書く（Void の postinstall の void prepare と同じ）。clone した直後から型が揃う
  const postinstall = pkg.scripts?.postinstall;
  if (!postinstall?.includes("void-kit prepare")) {
    pkg.scripts = {
      ...pkg.scripts,
      postinstall: postinstall ? `${postinstall} && void-kit prepare` : "void-kit prepare",
    };
    fs.writeFileSync(path.join(app, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    done.push("added void-kit prepare to the postinstall script");
  }

  if (pkg.scripts?.check !== "void-kit check") {
    if (pkg.scripts?.check) console.log(`! package.json already has a check script ("${pkg.scripts.check}"); left as it is`);
    else {
      pkg.scripts = { ...pkg.scripts, check: "void-kit check" };
      fs.writeFileSync(path.join(app, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
      done.push('added "check": "void-kit check" to package.json');
    }
  }

  for (const line of done) console.log(`✓ ${line}`);
  if (done.length === 0) console.log("✓ Already set up");

  // requireAuth は Void の auth が有効でないと誰もサインインできない。void-kit は有効にしないので、
  // それらしい設定が見当たらなければ知らせる（import で有効にする道もあるので、止めはしない）
  if (!authLooksOn())
    console.log(
      '! Void\'s auth looks off, so requireAuth cannot let anyone in. Turn it on: `auth: { providers: ["email"] }` in void.config.ts (node_modules/void/docs/guide/auth.md)',
    );
  console.log(`  Next: ${packageManager()} run check`);
};

// ---- check ----

/** oxlint は void-kit の依存。アプリで入れなくても動く */
const oxlintBin = () => {
  const manifest = require.resolve("oxlint/package.json");
  const { bin } = readJson(manifest);
  return path.join(path.dirname(manifest), typeof bin === "string" ? bin : bin.oxlint);
};

const check = () => {
  const pkg = readPackage();
  const pm = packageManager();
  const env = {
    ...process.env,
    PATH: `${path.join(app, "node_modules", ".bin")}${path.delimiter}${process.env.PATH}`,
  };
  const steps = [
    // 古い .void/ のままだと、型も typed fetch も前のルートを見る
    { name: "void prepare", command: "void", args: ["prepare"] },
    // 失敗の型の表。古いままだと fetchResult が前の失敗を見る
    { name: "void-kit prepare", command: process.execPath, args: [process.argv[1], "prepare"] },
    { name: "typecheck", command: "tsc", args: ["--noEmit"] },
    { name: "lint", command: process.execPath, args: [oxlintBin()] },
    // テストの道具はアプリが選ぶ。test の script があれば回す
    ...(pkg.scripts?.test ? [{ name: "test", command: pm, args: ["run", "test"] }] : []),
  ];

  const failed = [];
  for (const { name, command, args } of steps) {
    console.log(`\n── ${name} ──`);
    const { status, error } = spawnSync(command, args, { stdio: "inherit", cwd: app, env });
    if (error) console.error(`✗ Could not run ${command}: ${error.message}`);
    if (status !== 0) failed.push(name);
  }
  if (!pkg.scripts?.test) console.log("\n(no test script, so no tests were run)");

  if (failed.length > 0) {
    console.error(`\nFailed: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
};

// ---- 入口 ----

const [command] = process.argv.slice(2);
if (command === "init") init();
else if (command === "prepare") prepare();
else if (command === "check") check();
else die("Usage: void-kit init | void-kit prepare | void-kit check");
