import fs from "node:fs";
import path from "node:path";

export const fileOf = (context) => context.filename ?? context.getFilename();

/** 一番近い package.json のあるディレクトリ。アプリの根として使う */
const projectCache = new Map();
export const projectOf = (file) => {
  let dir = path.dirname(file);
  while (true) {
    if (projectCache.has(dir)) return projectCache.get(dir);
    if (fs.existsSync(path.join(dir, "package.json"))) {
      const project = { root: dir };
      projectCache.set(dir, project);
      return project;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

/** アプリの根から見たパス（routes/invoices/index.ts）。区切りは / */
export const relativeOf = (file, project) =>
  path.relative(project.root, file).replace(/\\/g, "/");

/** テストのファイル（*.test.ts、*.spec.ts） */
export const isTest = (rel) => /\.(test|spec)\.[mc]?[tj]sx?$/.test(rel);

/**
 * Void がルートとして読むファイルなら、routes/ から見たパスを返す。違えば null。
 * Void と同じく routes/（sourceDir があれば <sourceDir>/routes/）の下の .ts / .mts / .js / .mjs で、
 * `_` で始まる区切りを含まないもの。WebSocket の `.ws.ts` は endpoint ではないので除く
 */
export const routeFileOf = (context) => {
  const file = fileOf(context);
  const project = projectOf(file);
  if (!project) return null;
  const match = /^(?:[^/]+\/)?routes\/(.+\.(?:ts|mts|js|mjs))$/.exec(relativeOf(file, project));
  if (!match) return null;
  const route = match[1];
  if (route.split("/").some((segment) => segment.startsWith("_"))) return null;
  if (/\.ws\.[mc]?[tj]s$/.test(route)) return null;
  return route;
};
