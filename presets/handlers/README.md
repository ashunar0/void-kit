# handlers preset

`createHandler`: how every loader, action and route of a Void app is written. It runs who may call it (`auth`, required) before the input is validated, hands the handler who is calling (`member`) and the time of the request (`now`), and checks what a loader or a route returns against its `response` schema, so a column it should not send is left out. With it come `Result` / `Failure` / `toHttp` (an expected failure is a value, and its HTTP status comes from its kind) an oxlint plugin that stops a handler built any other way, and a test setup that gives every test file its own local D1 with the migrations applied. Not published to npm: a project copies these files and owns them.

## Copy

```sh
mkdir -p <your-app>/src/lib/void-kit
cp presets/handlers/lib/* <your-app>/src/lib/void-kit/
cp -r presets/handlers/docs presets/handlers/lint <your-app>/
```

`failure.ts` and `handler.ts` import `hono`: the app needs `hono` in its dependencies. The tests need `miniflare` as a dev dependency, at the version Void depends on (`"miniflare"` in `node_modules/void/package.json`): `pnpm add -D miniflare@<that version>`. Bump it when Void moves.

Tests may live in `tests/`: add it to `include` in `tsconfig.json`, or the lint that reads types sees them as errors.

`requireMember` sends a signed-out visitor to `/sign-in`. Change that path in `src/lib/void-kit/handler.ts` to the app's sign-in page.

`vite.config.ts` (Vite+, `vp lint`):

```ts
export default defineConfig({
  // ...
  test: {
    setupFiles: ["./src/lib/void-kit/test-setup.ts"],
  },
  lint: {
    jsPlugins: ["./lint/handlers.mjs"],
    rules: {
      "handlers/through-create-handler": "error",
      "handlers/no-json-response": "error",
      "handlers/no-clock": "error",
      "handlers/no-tests-in-routes": "error",
    },
  },
});
```

With plain Vite, put the same `jsPlugins` and `rules` in `.oxlintrc.json`.

The copied files are not written to the app's lint and format settings (a Void app starts with `@cloudflare/oxlint-config`). Leave them out of both, next to what Void generates:

```ts
lint: { ignorePatterns: [/* ... */ "lint/**", "src/lib/void-kit/**"] },
fmt: { ignorePatterns: ["AGENTS.md", "docs/**", "lint/**", "src/lib/void-kit/**", "db/migrations/**"] },
```

`AGENTS.md`:

```md
Every loader, action and route is built with `createHandler`: read [docs/handlers.md](docs/handlers.md) before writing one.
Tests: read [docs/testing.md](docs/testing.md) before writing one, and run them with `vp test`.
```

To change the rules, change them here and copy again.
