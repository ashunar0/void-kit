/**
 * src/domains の置き場所を、何を import するかで守らせる oxlint のプラグイン（試し）。
 * 決まりは docs/domains.md。ここは止めるだけで、なぜかは docs に書く
 * 元は void-kit の presets/domains。直すならそこで直して写し直す
 */
import fs from "node:fs";
import path from "node:path";

/** アプリの根から見たパス（src/domains/invoice/usecases/sendInvoice.ts）。区切りは / */
const relativeOf = (file, root) => path.relative(root, file).replace(/\\/g, "/");

const isTest = (rel) => /\.(test|typetest|spec)\.tsx?$/.test(rel);

/**
 * ファイルの種類。domain なら { kind: "index" | "rules" | "queries" | "mutations" | "usecases" | "usecases-shared", domain }、
 * Void が呼ぶ入口なら { kind: "entry" }、ページのコンポーネント（ブラウザでも動く）なら { kind: "component" }、
 * 表なら { kind: "table", domain }（db/schema/index.ts は domain なし）。どれでもなければ null
 */
const kindOf = (rel) => {
  const domain = /^src\/domains\/([^/]+)\/(index|rules|queries|mutations)\.ts$/.exec(rel);
  if (domain) return { kind: domain[2], domain: domain[1] };
  const usecase = /^src\/domains\/([^/]+)\/usecases\/(_?)[^/]+\.ts$/.exec(rel);
  if (usecase) return { kind: usecase[2] ? "usecases-shared" : "usecases", domain: usecase[1] };
  if (/^db\/schema\/index\.ts$/.test(rel)) return { kind: "table" };
  const table = /^db\/schema\/([^/]+)\.ts$/.exec(rel);
  if (table) return { kind: "table", domain: table[1] };
  if (/^pages\/.*\.server\.[jt]sx?$/.test(rel)) return { kind: "entry" };
  if (/^(routes|crons|queues|middleware)\//.test(rel)) return { kind: "entry" };
  if (rel.startsWith("pages/")) return { kind: "component" };
  return null;
};

/** 拡張子を省いた import を .ts に、ディレクトリなら index.ts に */
const withFile = (abs, root) => {
  const bare = abs.replace(/\.[jt]sx?$/, "");
  if (fs.existsSync(bare) && fs.statSync(bare).isDirectory())
    return `${relativeOf(path.join(bare, "index"), root)}.ts`;
  return `${relativeOf(bare, root)}.ts`;
};

/** import の行き先。アプリの中なら { rel }、パッケージなら { pkg } */
const targetOf = (specifier, file, root) => {
  if (specifier === "@schema") return { rel: "db/schema/index.ts" };
  if (specifier.startsWith("@schema/"))
    return { rel: withFile(path.join(root, "db/schema", specifier.slice("@schema/".length)), root) };
  if (specifier.startsWith(".")) return { rel: withFile(path.resolve(path.dirname(file), specifier), root) };
  return { pkg: specifier };
};

const isPkg = (target, name) => target.pkg === name || target.pkg?.startsWith(`${name}/`);
const isDomainFile = (to) => to?.domain && to.kind !== "table";

const readOr = (file, fallback) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return fallback;
  }
};

/** ドメインどうしの依存（ファイルを読んで 1 度だけ作る）。rules どうしの直接の import も数える */
let world;
const worldOf = (root) => {
  if (world) return world;
  const dir = path.join(root, "src/domains");
  const domains = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
    : [];
  const edges = new Map();
  for (const d of domains) {
    const files = [];
    const walk = (p) => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const full = path.join(p, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name) && !isTest(relativeOf(full, root))) files.push(full);
      }
    };
    walk(path.join(dir, d));
    const to = new Set();
    for (const f of files) {
      for (const m of readOr(f, "").matchAll(/from\s+["']([^"']+)["']/g)) {
        const t = targetOf(m[1], f, root);
        const other = t.rel && /^src\/domains\/([^/]+)\//.exec(t.rel)?.[1];
        if (other && other !== d) to.add(other);
      }
    }
    edges.set(d, to);
  }
  world = { edges };
  return world;
};

/** from から始めて to に戻る道（[from, …, to]）。無ければ null */
const pathBetween = (edges, from, to) => {
  const seen = new Set();
  const walk = (d, trail) => {
    if (d === to) return trail;
    if (seen.has(d)) return null;
    seen.add(d);
    for (const next of edges.get(d) ?? []) {
      const found = walk(next, [...trail, next]);
      if (found) return found;
    }
    return null;
  };
  return walk(from, [from]);
};

/** 同じドメインの中の import。止める理由、null なら通す */
const insideViolation = (from, to, typeOnly) => {
  if (to.kind === "index")
    return "A domain's own files import each other directly; index.ts is for other domains and the entry points";
  if (from.kind === "index") {
    if (to.kind === "rules")
      return "index.ts does not export rules: rules.ts is read directly, by anyone";
    if (to.kind === "mutations")
      return "index.ts does not export mutations: other domains write through a usecase";
    if (to.kind === "usecases-shared")
      return "index.ts does not export usecases/_*: they are shared by this domain's usecases only";
    return null;
  }
  if (from.kind === "rules") {
    if (!typeOnly && to.kind !== "rules")
      return "rules import only other rules: what needs a read or a write goes in usecases";
    return null;
  }
  if (from.kind === "queries" || from.kind === "mutations") {
    if (to.kind === "usecases" || to.kind === "usecases-shared")
      return `${from.kind}.ts is called by usecases, not the other way`;
    return null;
  }
  if (from.kind === "usecases" || from.kind === "usecases-shared") {
    if (to.kind === "usecases")
      return "A usecase does not call another usecase of its own domain. Share the part both need in usecases/_<name>.ts";
    return null;
  }
  return null;
};

/** 表の import。止める理由、null なら通す */
const tableViolation = (from, to, typeOnly) => {
  if (typeOnly) return null;
  if (from.kind === "queries" || from.kind === "mutations") {
    if (to.domain === undefined)
      return `Import this domain's tables from "@schema/${from.domain}", not every table from "@schema"`;
    if (to.domain !== from.domain)
      return `A table belongs to one domain: db/schema/${to.domain}.ts is ${to.domain}'s. Read it through that domain's queries, write it through its usecases`;
    return null;
  }
  if (from.kind === "rules") return "rules do no I/O: a read goes in queries.ts, a write in mutations.ts";
  if (from.kind === "usecases" || from.kind === "usecases-shared")
    return "usecases do not write SQL: put the read in queries.ts and the write in mutations.ts, and call them";
  if (from.kind === "entry" || from.kind === "component")
    return "An entry point does not touch the database: read through a domain's queries, write through its usecases (types from @schema are fine)";
  return null;
};

const isLib = (rel) => rel.startsWith("src/lib/");

/** 止める理由。null なら通す */
const violationOf = (from, fromRel, target, typeOnly, names, root) => {
  // Void が作る .void/ は、名前（@auth-schema・void/db・void/routes）で読む。パスで読むと、ここの決まりを素通りする
  if (target.rel?.startsWith(".void/"))
    return "Void generates .void/: import what it makes by its name (@auth-schema, void/db, void/routes), not by a path into it";
  const to = target.rel ? kindOf(target.rel) : null;
  const fromDomain = from.kind === "table" ? undefined : from.domain;

  // パッケージは、ファイルの種類で決まる
  if (from.kind === "rules" && !typeOnly) {
    if (isPkg(target, "drizzle-orm") || isPkg(target, "void") || target.pkg === "@auth-schema")
      return "rules do no I/O and know nothing of Void: keep them plain functions and values. A read goes in queries.ts, a write in mutations.ts";
    if (isPkg(target, "hono")) return "rules know nothing of HTTP: keep them plain functions and values";
  }
  if ((from.kind === "usecases" || from.kind === "usecases-shared") && isPkg(target, "drizzle-orm"))
    return "usecases do not write SQL: put the read in queries.ts and the write in mutations.ts, and call them";
  if ((from.kind === "entry" || from.kind === "component") && !typeOnly) {
    if (isPkg(target, "drizzle-orm"))
      return "An entry point does not touch the database: read through a domain's queries, write through its usecases";
    if (target.pkg === "void/db" && names.includes("db"))
      return "An entry point does not touch the database: read through a domain's queries, write through its usecases";
  }

  if (to?.kind === "table") {
    if (isLib(fromRel) && !typeOnly)
      return "src/lib is the shared place below every domain: it does not touch the database";
    return tableViolation(from, to, typeOnly);
  }

  if (from.kind === "index" && (target.pkg || !to || to.domain !== fromDomain))
    return "index.ts only re-exports its own domain's queries and usecases";

  if (!isDomainFile(to)) return null;

  if (isLib(fromRel))
    return "src/lib is the shared place below every domain: it imports no domain. What needs a domain's words goes in that domain";

  // 同じドメインの中
  if (to.domain === fromDomain) return insideViolation(from, to, typeOnly);

  // 他のドメイン、または入口・db・その他から。読めるのは index.ts（queries・usecases）と rules.ts だけ
  if (to.kind !== "index" && to.kind !== "rules")
    return `Another domain is read only through its index.ts (queries, usecases) or its rules.ts: import src/domains/${to.domain}/index or src/domains/${to.domain}/rules`;

  if (to.kind === "index" && !typeOnly) {
    if (from.kind === "component")
      return `A page component runs in the browser too: import src/domains/${to.domain}/rules and types only, and get the data from the page's loader`;
    // index.ts は queries を公開する。queries より下にいるものが読むと、上の層を引き込んで循環する
    if (from.kind === "rules" || from.kind === "table")
      return `${from.kind === "rules" ? "rules.ts" : "db/schema"} reads another domain's rules only: import src/domains/${to.domain}/rules`;
    if (from.kind === "queries" || from.kind === "mutations")
      return `${from.kind}.ts reads another domain's rules only (src/domains/${to.domain}/rules). Combine reads and writes of several domains in a usecase`;
  }

  if (fromDomain) {
    const { edges } = worldOf(root);
    const circle = pathBetween(edges, to.domain, fromDomain);
    if (circle)
      return `Domains may not depend on each other in a circle: ${[fromDomain, ...circle].join(" → ")}. Something sits in the wrong domain: move what both need to where both can read it one way`;
  }
  return null;
};

const domainImports = {
  create(context) {
    const file = context.filename;
    const root = context.cwd;
    const rel = relativeOf(file, root);
    if (rel.startsWith("..") || rel.startsWith("node_modules/") || rel.startsWith(".void/") || isTest(rel))
      return {};
    const from = kindOf(rel) ?? { kind: "other" };

    const check = (node) => {
      if (!node.source) return;
      const declTypeOnly = node.importKind === "type" || node.exportKind === "type";
      const specifiers = node.specifiers ?? [];
      const valueNames = specifiers
        .filter((s) => s.importKind !== "type" && s.exportKind !== "type")
        .map((s) => s.imported?.name ?? s.local?.name)
        .filter((n) => n && n !== "default");
      const typeOnly = declTypeOnly || (specifiers.length > 0 && valueNames.length === 0);
      const reason = violationOf(
        from,
        rel,
        targetOf(node.source.value, file, root),
        typeOnly,
        typeOnly ? [] : valueNames,
        root,
      );
      if (reason)
        context.report({
          node: node.source,
          message: `${rel} may not import ${node.source.value}. ${reason}. More: docs/domains.md`,
        });
    };

    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check };
  },
};

export default {
  meta: { name: "domains" },
  rules: { imports: domainImports },
};
