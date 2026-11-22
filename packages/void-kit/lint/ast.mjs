/** `as const` や `satisfies` を剥がす */
export const unwrap = (node) => {
  let cur = node;
  while (cur && (cur.type === "TSAsExpression" || cur.type === "TSSatisfiesExpression"))
    cur = cur.expression;
  return cur;
};

/**
 * ファイルの中で createEndpoint が束縛されている名前（alias 含む）を集める。
 * `import { createEndpoint as ep } from "void-kit"` でも ep を同じものとして見るため
 */
export const createEndpointNamesOf = () => {
  const names = new Set();
  return {
    names,
    Program(node) {
      for (const statement of node.body) {
        if (statement.type !== "ImportDeclaration" || statement.source?.value !== "void-kit")
          continue;
        for (const s of statement.specifiers ?? []) {
          if (
            s.type === "ImportSpecifier" &&
            (s.imported?.name ?? s.imported?.value) === "createEndpoint"
          )
            names.add(s.local.name);
        }
      }
    },
  };
};

/** `createEndpoint(...)` の呼び出しか */
export const isCreateEndpointCall = (node, names) =>
  node?.type === "CallExpression" &&
  node.callee?.type === "Identifier" &&
  names.has(node.callee.name);
