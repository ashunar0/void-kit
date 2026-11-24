# Handlers

<!-- Copied from void-kit's presets/handlers (https://github.com/ashunar0/void-kit/tree/main/presets/handlers). Change it there first, then copy again. -->

Everything Void calls over HTTP — a page's `loader`, its `action` or each of its `actions`, and each method of a route under `routes/` (`GET`, `POST`, ...) — is built with `createHandler` from `src/lib/void-kit/handler.ts`, not with `defineHandler`. `lint/handlers.mjs` stops one that is not.

```ts
export const loader = createHandler(
  { auth: requireMember, query: loanFilterSchema, response: propsSchema },
  async (c, { query, member, now }) => {
    // ...
  },
);
```

It runs **auth → middleware → input validation → the handler**, then checks what the handler returned against `response`.

## The config

| Key | |
| --- | --- |
| `auth` | Required: who may call it. `requireMember` for a page (a signed-out visitor is sent to `/sign-in`), `requireMemberApi` for a route under `routes/` (a signed-out request gets 401: a redirect would hand `fetch` the sign-in page), `allowAnonymous` for anyone. A permission decided by who the caller is alone (only an admin) is a guard of its own, made with `guard((c) => ...)`; one that needs the row (the owner) is checked in the usecase |
| `middleware` | Other middleware, run after `auth`. At most 4 |
| `body`, `query`, `params` | The input, validated as Void does (`form.errors` on a page) |
| `response` | What the handler returns. Required for a `loader` and for every method of a route; not written for an action, which returns nothing (the page is loaded again) or a redirect |

`response` is there because what a loader returns is put into the page's HTML as it is, and what a route returns is sent as it is: a row passed whole sends every column. The schema's output is what is sent, so a key it does not have is left out, and a value that does not match is a 500 (a bug the types missed). Write it next to the loader, in the same file, and take `Props` from the loader as usual (`InferProps<typeof loader>`): it is the schema's output.

## What the handler receives

`(c, { body, query, params, member, now })`:

- the input it declared
- `member`: who is calling, as `auth` returned it. `requireMember` gives the signed-in user; `allowAnonymous` gives `null`
- `now`: the time of the request. **Nothing else reads the clock** (`new Date()` with no argument, `Date.now()`): pass `now`, or a day made from it, down to the usecases as an argument. A test fixes the time with `vi.setSystemTime`, or passes the day to the usecase directly

Return the value; do not return `c.json(...)` or `Response.json(...)`, which would skip `response`. `c.redirect(...)` and `c.notFound()` are fine. A failure from a usecase is thrown as `throw toHttp(result.error)` (docs/domains.md, Failures).

## Redirects that need no code

A path that only sends people elsewhere (`/` → `/books`) is `routing.redirects` in `void.config.ts`, not a loader.
