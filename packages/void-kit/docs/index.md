# void-kit docs

The rules of a Void app's server routes built with void-kit, for the installed version. Void decides everything else (pages, `void/db`, `void/auth`, deploys); read its docs in `node_modules/void/docs/` for those. When unsure, read an existing endpoint under `routes/` to the end and write the same way.

Always read:

- [rules.md](rules.md): the rules every file keeps (who may call, failures, check order, IDs, replies, module scope)

Read before you…

- **add a resource or an endpoint** under `routes/`: [resources.md](resources.md)
- **call an endpoint** from the client (pages, components) and handle its failures: [client.md](client.md)
