# Adding a resource

A resource is a directory under `routes/`, and its endpoints are in that directory's `index.ts`: `routes/invoices/index.ts` is `/invoices`, `routes/invoices/[id]/index.ts` is `/invoices/:id`, a child resource nests (`routes/customers/[customerId]/invoices/index.ts`). The path under `routes/` is the whole URL, so an `/api` prefix is a directory (`routes/api/invoices/index.ts`); keep whichever the app already uses. One URL is one `index.ts`; Void would also read `routes/invoices/[id].ts`, but that is stopped by lint `route-file-is-index`, so there is one place for each URL. `index.dev.ts` / `index.prod.ts` (Void's environment-only routes) are allowed. A directory in parentheses only groups files and is left out of the URL (`routes/(admin)/users/index.ts` is `/users`); each endpoint still declares its own auth.

Void makes every `.ts` under `routes/` a route unless a segment of its path starts with `_`. So a file that is not an endpoint starts with `_` (`_response.ts`, `_index.test.ts`), or lives outside `routes/`. Code outside `routes/` (the queries, the functions that return a `Result`, the IDs) is placed as the app likes; void-kit fixes only `routes/`. `src/` is a good start (`src/invoices.ts` for `findInvoice` above): it is in the tsconfig `include` Void writes, and `lib/` is not. Import without an extension (`../_response`), as Void's starter does.

Each method is one export, `GET` / `POST` / `PUT` / `PATCH` / `DELETE`, made with `createEndpoint`. Anything else there — a helper, a re-export, a default export, Void's own `defineHandler` — is stopped by lint `route-exports-endpoints`. `void prepare` reads the exports, so Void's typed fetch (`fetch` from `void/client`) knows each endpoint's input and success body.

```ts
// routes/invoices/[id]/index.ts
import { createEndpoint, NotFound, requireAuth } from "void-kit";
import { z } from "zod";
import { invoiceResponse, invoiceResponseSchema } from "../_response";

export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { params: z.object({ id: z.string() }) },
    responses: { success: invoiceResponseSchema, failures: [NotFound] },
  },
  async (c, { params }, reply) => {
    const invoice = await findInvoice(c.var.currentUser.id, params.id);
    if (invoice === undefined) return reply.failure(NotFound.code);
    return reply.success(invoiceResponse(invoice));
  },
);
```

- `auth` is required: `requireAuth`, `allowAnonymous`, or a guard the app made with `createGuard` ([rules.md](rules.md))
- `request` takes `params`, `query` and `body`, each any Standard Schema (zod, valibot, ...). The handler gets them validated as its second argument
- `responses.success` is the body of the 200. `responses.failures` lists the failures the handler returns; those of the guard and of validation are not written
- The handler returns only what `reply` makes (`reply.success(body)` / `reply.failure(code)`), never `c.json(...)` or a plain value

An update is `PUT` with the whole input, the same schema as the create; use `PATCH` only when a client must change some fields and leave the rest. A change of state is not an update: it is a verb directory under the thing with only `POST` (`routes/invoices/[id]/send/index.ts` for `POST /invoices/:id/send`), not a `PATCH` of the status and not a noun (`/sending`). An undo is another verb (`publish` / `unpublish`).
