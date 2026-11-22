# void-kit docs

The rules of a Void app's server routes built with void-kit, for the installed version. Void decides everything else (pages, `void/db`, `void/auth`, deploys); read its docs in `node_modules/void/docs/` for those. When unsure, read an existing endpoint under `routes/` to the end and write the same way.

Always read:

- [rules.md](rules.md): the rules every file keeps (who may call, failures, check order, IDs, replies, module scope)

Read before you…

- **add a resource or an endpoint** under `routes/`: [resources.md](resources.md)
- **call an endpoint** from the client (pages, components) and handle its failures: [client.md](client.md)

## Known issues in Void

Not void-kit's rules: problems in Void (1.11) that void-kit apps run into. Remove a line once Void fixes it.

- **Referencing the user table** (`userTable` from `.void/better-auth-schema.ts`, for an owner's foreign key): Void's auth guide says to add `"@auth-schema"` to the tsconfig `paths`. That passes the typecheck and `void db generate`, but `vp dev` stops with `Cannot find module '@auth-schema'`, because the dev server does not read tsconfig `paths`. If you use the alias, also add `resolve: { tsconfigPaths: true }` to `defineConfig` in `vite.config.ts` ([voidzero-dev/void#900](https://github.com/voidzero-dev/void/issues/900))
