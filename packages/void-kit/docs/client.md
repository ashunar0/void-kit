# Calling an endpoint

Call endpoints with `fetchResult` from `void-kit/client`. It takes what Void's typed fetch (`fetch` from `void/client`) takes, and returns a `Result`: the success body, or the failure the endpoint answered, typed by its code.

```ts
import { fetchResult } from "void-kit/client";

const result = await fetchResult("/invoices/[id]/send", { method: "POST", params: { id } });
if (!result.ok) {
  switch (result.error.code) {
    case "INVOICE_ALREADY_SENT": // show it was sent already
    case "NOT_FOUND": // ...
    case "UNAUTHORIZED": // send to sign-in
  }
  return;
}
result.value; // the invoice
```

To name a success body (for `useState` or props), use `SuccessOf`; do not dig it out of `.void/routes.d.ts`:

```ts
import type { SuccessOf } from "void-kit/client";

type Invoice = SuccessOf<"/invoices/[id]">; // GET when no method is given
type InvoiceList = SuccessOf<"/invoices", "GET">;
```

- `result.error` is `{ code, message, details? }`. Its codes are the endpoint's `responses.failures`, those of its guard (`UNAUTHORIZED` for `requireAuth`), and `VALIDATION_ERROR` when it reads input. Branch on `code`, never on `message` or the status
- `VALIDATION_ERROR`'s `details` maps each field to its messages (`{ amount: ["Too small"] }`); show `details.<field>` next to the field
- A failure that declares details has them typed once the `code` is checked
- Anything that is not a declared failure (a 500, the network, a URL with no endpoint) is thrown, as Void's `fetch` throws it
- The types come from `src/void-kit.gen.d.ts`, which `void-kit prepare` writes from `routes/` (`check` and `postinstall` run it). Never edit it. After adding a failure to an endpoint, run `check` (or `void-kit prepare`) for the client to see it

Do not catch Void's `FetchError` and read `e.data` by hand, and do not copy failure codes into the client as strings: both lose the types.
