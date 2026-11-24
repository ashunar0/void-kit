/**
 * Void が呼ぶ handler を createHandler（src/lib/void-kit/handler.ts）で作らせる oxlint のプラグイン（試し）。
 * 決まりは docs/handlers.md。ここは止めるだけで、なぜかは docs に書く
 * 元は void-kit の presets/handlers。直すならそこで直して写し直す
 */
import path from "node:path";

const relativeOf = (file, root) => path.relative(root, file).replace(/\\/g, "/");

const isTest = (rel) => /\.(test|typetest|spec)\.tsx?$/.test(rel);

const isPageServer = (rel) => /^pages\/.*\.server\.[jt]sx?$/.test(rel);
const isRoute = (rel) => rel.startsWith("routes/");

/** Void が handler として読む export の名前 */
const routeMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ALL"]);

const isCreateHandler = (node) =>
  node?.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "createHandler";

const configOf = (call) => (call.arguments[0]?.type === "ObjectExpression" ? call.arguments[0] : null);

const hasKey = (object, key) =>
  object.properties.some(
    (p) => p.type === "Property" && !p.computed && (p.key.name ?? p.key.value) === key,
  );

const MORE = "More: docs/handlers.md";

/** export された handler が createHandler で作られているか。loader と routes は response も要る */
const throughCreateHandler = {
  create(context) {
    const rel = relativeOf(context.filename, context.cwd);
    if (isTest(rel) || !(isPageServer(rel) || isRoute(rel))) return {};

    const requireCreated = (node, name, needsResponse) => {
      if (!isCreateHandler(node)) {
        context.report({
          node: node ?? context.sourceCode.ast,
          message: `${name} in ${rel} is built with createHandler from src/lib/void-kit/handler, so that who may call it (auth) is always declared. ${MORE}`,
        });
        return;
      }
      const config = configOf(node);
      if (needsResponse && config && !hasKey(config, "response"))
        context.report({
          node: config,
          message: `${name} returns what reaches the ${isRoute(rel) ? "client" : "browser (it is put in the page's HTML)"}: declare it as response, so a column it should not send is left out. ${MORE}`,
        });
    };

    return {
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;
        if (declaration?.type !== "VariableDeclaration") return;
        for (const d of declaration.declarations) {
          const name = d.id.name;
          if (isRoute(rel) && routeMethods.has(name)) requireCreated(d.init, name, true);
          if (!isPageServer(rel)) continue;
          if (name === "loader") requireCreated(d.init, name, true);
          if (name === "action") requireCreated(d.init, name, false);
          if (name === "actions") {
            if (d.init?.type !== "ObjectExpression") {
              requireCreated(d.init, name, false);
              continue;
            }
            for (const p of d.init.properties)
              requireCreated(p.value, `actions.${p.key?.name ?? p.key?.value}`, false);
          }
        }
      },
    };
  },
};

/** c.json / Response.json で返すと、response のスキーマを素通りする */
const noJsonResponse = {
  create(context) {
    const rel = relativeOf(context.filename, context.cwd);
    if (isTest(rel) || !(isPageServer(rel) || isRoute(rel))) return {};
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.property.name !== "json") return;
        if (callee.object.type !== "Identifier" || !["c", "Response"].includes(callee.object.name)) return;
        context.report({
          node,
          message: `Return the value instead of ${callee.object.name}.json(): createHandler checks it against response only when it is returned as it is. ${MORE}`,
        });
      },
    };
  },
};

/** 時計を読むのは createHandler だけ。ほかは handler に渡された now を使う */
const noClock = {
  create(context) {
    const rel = relativeOf(context.filename, context.cwd);
    if (isTest(rel) || rel === "src/lib/void-kit/handler.ts" || rel.startsWith("..") || rel.startsWith("node_modules/"))
      return {};
    const report = (node) =>
      context.report({
        node,
        message: `Do not read the clock here: take now from the handler's input ({ now }) and pass it (or today) down as an argument. ${MORE}`,
      });
    return {
      NewExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "Date" && node.arguments.length === 0)
          report(node);
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          callee.object.name === "Date" &&
          callee.property.name === "now"
        )
          report(node);
      },
    };
  },
};

/** routes/ と pages/ に置いたファイルは、Void が route やページにする。テストもそうなる */
const noTestsInRoutes = {
  create(context) {
    const rel = relativeOf(context.filename, context.cwd);
    if (!isTest(rel) || !(rel.startsWith("routes/") || rel.startsWith("pages/"))) return {};
    return {
      Program(node) {
        context.report({
          node,
          message: `Void makes every file under routes/ and pages/ a route or a page, a test too: move ${rel} next to the code it tests in src/, or into tests/. ${MORE.replace("handlers.md", "testing.md")}`,
        });
      },
    };
  },
};

export default {
  meta: { name: "handlers" },
  rules: {
    "through-create-handler": throughCreateHandler,
    "no-json-response": noJsonResponse,
    "no-clock": noClock,
    "no-tests-in-routes": noTestsInRoutes,
  },
};
