/**
 * ページと画面の置き方（DAA）を止める oxlint のプラグイン（試し）。
 * 決まりは docs/pages.md。ここは止めるだけで、なぜかは docs に書く
 * 元は void-kit の presets/pages。直すならそこで直して写し直す
 */
import path from "node:path";

const relativeOf = (file, root) => path.relative(root, file).replace(/\\/g, "/");

const isTest = (rel) => /\.(test|typetest|spec)\.tsx?$/.test(rel);

const MORE = "More: docs/pages.md";

/** pages/ に置いてよいファイルの名前。index.tsx と index.server.ts のほかは、Void が名前で読むものだけ */
const pageFileNames = new Set([
  "index.tsx",
  "index.server.ts",
  "layout.tsx",
  "layout.server.ts",
  "_error.tsx",
  "_not-found.tsx",
  "vite-env.d.ts",
]);

/** ページは <ディレクトリ>/index.tsx。members.tsx や [id].tsx は、ディレクトリにする */
const pageIsIndex = {
  create(context) {
    const rel = relativeOf(context.filename, context.cwd);
    if (!rel.startsWith("pages/") || isTest(rel)) return {};
    const name = path.posix.basename(rel);
    if (pageFileNames.has(name)) return {};
    const stem = name.replace(/(\.server)?\.[jt]sx?$/, "");
    const server = /\.server\.[jt]sx?$/.test(name);
    const dir = path.posix.dirname(rel);
    return {
      Program(node) {
        context.report({
          node,
          message: `A page is a directory with index.tsx in it: move ${rel} to ${dir}/${stem}/index${server ? ".server.ts" : ".tsx"}. ${MORE}`,
        });
      },
    };
  },
};

/** import の行が型だけか */
const isTypeOnly = (node) => {
  if (node.importKind === "type" || node.exportKind === "type") return true;
  const specifiers = node.specifiers ?? [];
  return specifiers.length > 0 && specifiers.every((s) => s.importKind === "type" || s.exportKind === "type");
};

/** 相対の import の行き先（root からの相対）。パッケージなら null */
const targetRelOf = (specifier, file, root) =>
  specifier.startsWith(".") ? relativeOf(path.resolve(path.dirname(file), specifier), root) : null;

/** src/components/ の中での層と、画面・部品の名前 */
const tierOf = (rel) => {
  const m = /^src\/components\/(screens|widgets|shared)\/([^/]+)(\/|$)/.exec(rel);
  return m ? { tier: m[1], name: m[2], nested: m[3] === "/" } : null;
};

/** pages/ の .tsx は画面を描くだけ。import してよいのは画面と、型だけ */
const bindingOnly = {
  create(context) {
    const rel = relativeOf(context.filename, context.cwd);
    if (!rel.startsWith("pages/") || !rel.endsWith(".tsx") || isTest(rel)) return {};
    const check = (node) => {
      if (!node.source || isTypeOnly(node)) return;
      const spec = node.source.value;
      const target = targetRelOf(spec, context.filename, context.cwd);
      if (target && tierOf(target)?.tier === "screens") return;
      // Void の部品を読むときに要る、副作用だけの import（CSS）
      if (/\.css$/.test(spec)) return;
      context.report({
        node: node.source,
        message: `${rel} only binds its URL to a screen: import the screen from src/components/screens/ and the type of the loader's props, and put ${spec} in the screen. ${MORE}`,
      });
    };
    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check };
  },
};

/** 画面・部品は 1 つずつディレクトリ。画面は画面を読まない。shared はドメインも画面も部品も読まない */
const componentTiers = {
  create(context) {
    const rel = relativeOf(context.filename, context.cwd);
    const from = tierOf(rel);
    if (!rel.startsWith("src/components/") || isTest(rel)) return {};
    if (!from || !from.nested) {
      return {
        Program(node) {
          context.report({
            node,
            message: `${rel} is not in a tier: a screen goes in src/components/screens/<screen>/, a part two screens use in widgets/<part>/, generic UI in shared/<part>/, each a directory with index.tsx. ${MORE}`,
          });
        },
      };
    }
    const check = (node) => {
      if (!node.source) return;
      const target = targetRelOf(node.source.value, context.filename, context.cwd);
      if (!target) return;
      const to = tierOf(target);
      let reason = null;
      if (target.startsWith("pages/") && !isTypeOnly(node))
        reason = "a component takes its data as props: import only the type of the loader's props from pages/";
      else if (to?.tier === "screens" && !(from.tier === "screens" && to.name === from.name))
        reason =
          from.tier === "screens"
            ? `a screen never imports another screen: move what both use to src/components/widgets/`
            : "a part never imports a screen";
      else if (from.tier === "shared" && to && to.tier !== "shared")
        reason = "shared UI knows no domain and no part: pass what it shows as props";
      else if (from.tier === "shared" && target.startsWith("src/domains/"))
        reason = "shared UI knows no domain: pass what it shows as props, or move it to widgets/";
      if (reason)
        context.report({
          node: node.source,
          message: `${rel} may not import ${node.source.value}: ${reason}. ${MORE}`,
        });
    };
    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check };
  },
};

export default {
  meta: { name: "pages" },
  rules: {
    "page-is-index": pageIsIndex,
    "binding-only": bindingOnly,
    "component-tiers": componentTiers,
  },
};
