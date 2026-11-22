# void-kit

It stops, as you write, what you had to watch for each time in [Void](https://void.cloud)'s server routes (`routes/`) — who may call, what you return, the status of a failure, and which file is which URL — with types and lint.
When it stops you it shows how to fix it, so AI can fix it on its own. Failure codes reach the client's types too.

> Unofficial. Not affiliated with Void (VoidZero).

[日本語](README.ja.md)

## Why

When AI writes a backend, the details drift every time: which file is which URL, how failures are returned, how access is checked.
void-kit fixes the shape up front and stops deviations.

It is the Void edition of [hono-kit](https://github.com/ashunar0/hono-kit). hono-kit borrowed Void's routing and left out the build, deploy and infrastructure; void-kit goes the other way. It uses what Void already has (routing, database, auth, typed fetch, deploys) as it is, and adds only the rules for writing an endpoint.

```ts
// routes/invoices/[id]/index.ts
export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { params: z.object({ id: z.string() }) },
    responses: { success: invoiceSchema, failures: [NotFound] },
  },
  async (c, { params }, reply) => {
    const invoice = await findInvoice(c.var.currentUser.id, params.id);
    if (invoice === undefined) return reply.failure(NotFound.code);
    return reply.success(invoice);
  },
);
```

```ts
// the client
const result = await fetchResult("/invoices/[id]", { params: { id } });
if (!result.ok) result.error.code; // "NOT_FOUND" | "UNAUTHORIZED" | "VALIDATION_ERROR"
```

## Getting started

Not on npm yet. Once it is, in a Void app:

```sh
npx void init
npm install void-kit
npx void-kit init
npm run check
```

`void-kit init` adds `.oxlintrc.json`, a block in `AGENTS.md`, and the `check` and `postinstall` scripts. It does not touch your code.

`void-kit check` runs `void prepare`, the failure types, typecheck, lint and tests, and lists all failures at the end. With AI, "make `check` pass" is the one instruction you need.

## The rules

The rules ship inside the package, so they match the installed version: start at `node_modules/void-kit/docs/index.md` ([on GitHub](packages/void-kit/docs/index.md)). The block in `AGENTS.md` only points there.

## Scope

- Void's server routes only. Not pages' loaders and actions yet
- Any Standard Schema library works for validation (tested with zod)
- 0.x. The shape will change as it gets used in real products. Decisions and open questions: [DESIGN.ja.md](DESIGN.ja.md) (Japanese)

## License

MIT
