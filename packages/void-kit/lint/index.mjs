/**
 * void-kit の形を守らせる oxlint のプラグイン。アプリの .oxlintrc.json で
 * `"extends": ["./node_modules/void-kit/lint/recommended.json"]` として読み込む
 */
import noIdCast from "./rules/no-id-cast.mjs";
import noModuleScopeState from "./rules/no-module-scope-state.mjs";
import routeExportsEndpoints from "./rules/route-exports-endpoints.mjs";
import routeFileIsIndex from "./rules/route-file-is-index.mjs";

export default {
  meta: { name: "void-kit" },
  rules: {
    "route-exports-endpoints": routeExportsEndpoints,
    "route-file-is-index": routeFileIsIndex,
    "no-module-scope-state": noModuleScopeState,
    "no-id-cast": noIdCast,
  },
};
