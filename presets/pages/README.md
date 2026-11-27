# pages preset

How the UI of a Void app is laid out, after Dual-Axis Architecture (DAA): every page is a directory with `index.tsx` that only renders its screen, and the screens and parts live in `src/components/screens/`, `widgets/` and `shared/`, one directory each. With an oxlint plugin that stops a page file that is not `index.tsx`, a page that does more than bind, a screen that imports another screen, and shared UI that knows a domain. Not published to npm: a project copies these files and owns them.

## Copy

```sh
cp -r presets/pages/docs presets/pages/lint <your-app>/
```

It goes with the [domains preset](../domains/README.md), whose lint treats `src/components/` as browser code (a domain's `rules.ts` and types only).

`vite.config.ts` (Vite+, `vp lint`):

```ts
export default defineConfig({
  // ...
  lint: {
    jsPlugins: ["./lint/pages.mjs"],
    rules: {
      "pages/page-is-index": "error",
      "pages/binding-only": "error",
      "pages/component-tiers": "error",
    },
  },
});
```

With plain Vite, put the same `jsPlugins` and `rules` in `.oxlintrc.json`. Leave `lint/**` out of the app's lint and format settings, as the other presets say.

`AGENTS.md`:

```md
Pages and screens: read [docs/pages.md](docs/pages.md) before writing one.
```

To change the rules, change them here and copy again.
