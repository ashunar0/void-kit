import { reportWithDocs } from "../docs.mjs";
import { routeFileOf } from "../project.mjs";

/**
 * ルートファイルは index.ts だけ（`index.dev.ts` / `index.prod.ts` も可）。1 つの URL に 1 ファイル。
 *
 * Void は `routes/invoices/[id].ts` も `routes/invoices/[id]/index.ts` も同じ URL にするので、
 * 置き場所を選ぶ場面ができて書く人ごとに揺れる。ディレクトリが URL、その中の index.ts が入口、と決める。
 * Void は `_` で始まらない .ts をすべてルートにするので、`index.test.ts` を横に置くと
 * `/invoices/index.test` という URL ができてしまう。それもここで止まる
 */
export default {
  create(context) {
    const report = reportWithDocs(context, "resources.md");
    const route = routeFileOf(context);
    if (route === null) return {};
    const name = route.split("/").pop();
    if (/^index(\.(dev|prod))?\.(ts|mts|js|mjs)$/.test(name)) return {};

    const isTest = /\.(test|spec)\./.test(name);
    const url = route.replace(/\.((dev|prod)\.)?(ts|mts|js|mjs)$/, "");
    const message = isTest
      ? `${route} would be served as a URL: Void makes every file under routes/ that does not start with _ a route. Name the test with _ (e.g. _index.test.ts), or put it outside routes/`
      : `A route file is named index.ts in the directory of its URL. Move ${route} to routes/${url}/index.ts. A file that is not an endpoint starts with _ (e.g. _response.ts)`;

    return {
      Program(node) {
        report({ node, message });
      },
    };
  },
};
