# Handlers

<!-- Copied from void-kit's presets/handlers (https://github.com/ashunar0/void-kit/tree/main/presets/handlers). Change it there first, then copy again. -->

Everything Void calls over HTTP — a page's `loader`, its `action` or each of its `actions`, and each method of a route under `routes/` (`GET`, `POST`, ...) — is built with `createHandler` from `src/lib/void-kit/handler.ts`, not with `defineHandler`. `lint/handlers.mjs` stops one that is not.

```ts
export const loader = createHandler({
  auth: requireMember,
  query: loanFilterSchema,
  response: propsSchema,
  handler: async (c, { query, member, now }) => {
    // ...
  },
});
```

The handler is the last key of the config, not a second argument: with a function inside, the formatter cannot put the config on one line, so every handler has the same shape.

It runs **auth → middleware → input validation → the handler**, then checks what the handler returned against `response`.

## The config

| Key | |
| --- | --- |
| `auth` | Required: who may call it. `requireMember` for a page (a signed-out visitor is sent to `/sign-in`), `requireMemberApi` for a route under `routes/` (a signed-out request gets 401: a redirect would hand `fetch` the sign-in page), `allowAnonymous` for anyone. A permission decided by who the caller is alone (only an admin) is a guard of its own, made with `guard((c) => ...)`; one that needs the row (the owner) is checked in the usecase |
| `middleware` | Other middleware, run after `auth`. At most 4 |
| `body`, `query`, `params` | The input, validated as Void does (`form.errors` on a page) |
| `response` | What the handler returns. Required for a `loader` and for every method of a route; not written for an action, which returns nothing (the page is loaded again) or a redirect |
| `handler` | Required, written last: what it does, `async (c, { ... }) => ...` (below) |

`response` is there because what a loader returns is put into the page's HTML as it is, and what a route returns is sent as it is: a row passed whole sends every column. The handler's return value is typed by the schema's input, so a value that drifted from it (a column whose type changed) is a type error. The error is reported at the `handler:` key, not at the `return`: read its last lines, which name the property. The schema's output is what is sent, so a key it does not have is left out, and a value that still does not match while it runs is a 500 (a bug the types missed, such as a cast with `as`). Write it next to the loader, in the same file, and take `Props` from the loader as usual (`InferProps<typeof loader>`): it is the schema's output.

A guard of the app's goes in `src/guards.ts`: `src/lib/` imports no domain, and a domain does not import `void/auth`. It reads the caller with `requireAuth`, decides with a function of the domain's `rules.ts`, and refuses with a failure from there, thrown as a usecase's is:

```ts
// src/guards.ts
export const requireAdmin = guard((c) => {
  const member = requireAuth(c, { throwRedirect: "/sign-in" });
  if (!isAdmin(member)) throw toHttp(AdminOnly); // AdminOnly: kind "forbidden", in member/rules.ts
  return member;
});
```

A 403 from a loader or an action is shown by `pages/_error.tsx` (Void's error page, given `error.status` and `error.message`). Without one, a page answers with plain text. The app has one as soon as any guard refuses.

## What the handler receives

`(c, { body, query, params, member, now })`:

- the input it declared
- `member`: who is calling, as `auth` returned it. `requireMember` gives the signed-in user; `allowAnonymous` gives `null`
- `now`: the time of the request. **Nothing else reads the clock** (`new Date()` with no argument, `Date.now()`): pass `now`, or a day made from it, down to the usecases as an argument. A test fixes the time with `vi.setSystemTime`, or passes the day to the usecase directly

Return the value; do not return `c.json(...)` or `Response.json(...)`, which would skip `response`. `c.redirect(...)` and `c.notFound()` are fine. A failure from a usecase is thrown as `throw toHttp(result.error)` (docs/domains.md, Failures).

## Redirects that need no code

A path that only sends people elsewhere (`/` → `/books`) is `routing.redirects` in `void.config.ts`, not a loader.
