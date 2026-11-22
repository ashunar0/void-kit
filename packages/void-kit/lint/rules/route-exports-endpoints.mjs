import { reportWithDocs } from "../docs.mjs";
import { createEndpointNamesOf, isCreateEndpointCall, unwrap } from "../ast.mjs";
import { routeFileOf } from "../project.mjs";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const otherExport = (name) =>
  `${name} is exported from a route file. Only GET / POST / PUT / PATCH / DELETE may be exported here, each created with createEndpoint. Move other exports to a file that starts with _ (e.g. _response.ts), or keep it unexported`;

const notCreateEndpoint = (name) =>
  `${name} is exported but its value is not created with createEndpoint (from void-kit). Declare it as \`export const ${name} = createEndpoint({ auth, responses }, handler)\`, not with Void's defineHandler, so auth and the responses contract are not skipped`;

const RE_EXPORT =
  "Do not re-export from a route file. Only GET / POST / PUT / PATCH / DELETE, each created with createEndpoint, may be exported here";

const NO_DEFAULT =
  "Do not export default from a route file. Export one method per constant: `export const GET = createEndpoint(...)`";

/**
 * ルートファイル（Void が routes/ から読むもの）の export は、GET / POST / PUT / PATCH / DELETE だけ、
 * それぞれ `export const X = createEndpoint(...)` の形で書く。
 *
 * Void は HTTP メソッドの名前の export なら何でも endpoint にする。素の defineHandler や関数でも通るので、
 * 型の決まり（auth が必須・reply でしか返せない）はここで export の形を決めないと効かない。
 * OPTIONS / HEAD も Void は読むが、hono（と Void）が答えるので書かせない
 */
export default {
  create(context) {
    const report = reportWithDocs(context, "resources.md");
    if (routeFileOf(context) === null) return {};
    const createEndpointNames = createEndpointNamesOf();

    const check = (node, name, init) => {
      if (!METHODS.has(name)) report({ node, message: otherExport(name) });
      else if (!isCreateEndpointCall(unwrap(init), createEndpointNames.names))
        report({ node, message: notCreateEndpoint(name) });
    };

    return {
      Program: createEndpointNames.Program,
      ExportDefaultDeclaration(node) {
        report({ node, message: NO_DEFAULT });
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== "type") report({ node, message: RE_EXPORT });
      },
      ExportNamedDeclaration(node) {
        // export type ... は値を持たないので endpoint ではない。許す
        if (node.exportKind === "type") return;
        if (node.source) {
          report({ node, message: RE_EXPORT });
          return;
        }

        if (!node.declaration) {
          // export { x as GET }: その場の createEndpoint の呼び出しではないので、GET という名前でも通さない
          for (const spec of node.specifiers) {
            if (spec.exportKind === "type") continue;
            const name = spec.exported?.name ?? spec.exported?.value;
            report({
              node: spec,
              message: METHODS.has(name) ? notCreateEndpoint(name) : otherExport(name),
            });
          }
          return;
        }

        const { declaration } = node;
        if (declaration.type === "TSTypeAliasDeclaration" || declaration.type === "TSInterfaceDeclaration")
          return;
        if (declaration.type !== "VariableDeclaration") {
          // export function GET() {} / export class X {}: createEndpoint の呼び出しではあり得ない
          const name = declaration.id?.name ?? "this export";
          report({
            node: declaration,
            message: METHODS.has(name) ? notCreateEndpoint(name) : otherExport(name),
          });
          return;
        }

        for (const declarator of declaration.declarations) {
          if (declarator.id?.type !== "Identifier")
            report({ node: declarator, message: otherExport("this export") });
          else check(declarator, declarator.id.name, declarator.init);
        }
      },
    };
  },
};
