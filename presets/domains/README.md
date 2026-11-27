# domains preset

Rules for where business logic goes in a Void app (`src/domains/<noun>/`, with each domain's tables in `db/schema/<noun>.ts`), with an oxlint plugin that stops imports breaking them. Not published to npm: a project copies these files and owns them.

## Copy

```sh
cp -r presets/domains/docs presets/domains/lint <your-app>/
```

It needs the [handlers preset](../handlers/README.md) too: a usecase returns its failures with `Result` and `Failure` from there.

`vite.config.ts` (Vite+, `vp lint`):

```ts
export default defineConfig({
  // ...
  lint: {
    jsPlugins: ["./lint/domains.mjs"],
    rules: { "domains/imports": "error" },
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
The business rules live in `src/domains/`: read [docs/domains.md](docs/domains.md) before touching them.
```

To change the rules, change them here and copy again.
