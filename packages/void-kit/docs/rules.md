# Rules

The rules every file keeps. Types and lint stop most of them; the rest are here.

- **Who may call**: every endpoint's `auth` is a guard, and it is required, so a forgotten guard and a deliberately public endpoint differ. `requireAuth` answers 401 to a signed-out request and sets `c.var.currentUser` to the signed-in `CurrentUser`; `allowAnonymous` lets everyone through and sets it to `null` (grep it to list every public endpoint). Void's auth (Better Auth, `void/auth`) reads the session; void-kit only turns its user into a `CurrentUser`. **Void's auth must be on** for anyone to be signed in: `auth: { providers: ["email"] }` in `void.config.ts`, or an `auth.ts` at the project root (`node_modules/void/docs/guide/auth.md`). void-kit does not turn it on; while it is off, `requireAuth` throws an error saying so
  - A guard is made only with `createGuard(failures, (c) => ...)`: it returns who the caller is, or throws `fail(...)` with one of the failures it lists. Throwing one it does not list is a 500, since the client's types would not know it. A `CurrentUser` is made only by `getCurrentUser(c)`, so a user made by hand (from a request body) cannot pass for the signed-in one. A handler reads `c.var.currentUser`, never `getCurrentUser`
    ```ts
    // src/auth.ts
    export const requireAdmin = createGuard([Unauthorized, Forbidden], (c) => {
      const user = getCurrentUser(c);
      if (user === null) throw fail(Unauthorized);
      if (user.role !== "admin") throw fail(Forbidden);
      return user;
    });
    ```
  - **Permissions come in two kinds.** Decided by the user alone (only an admin): the guard. Needs the row, or mixes in an "or" (an admin or the author): all of it in code, after the row is read, returning `Forbidden`. Never put half of an "or" in the guard: it would turn away the other half
- **Failures**: expected ones (not found, no permission, an external service not answering) are returned as `Result` (`err(NotFound.code)`) from the code that found them, and answered with `reply.failure(...)`. Unexpected ones (the DB is down) are thrown
  - 401, 403, 404 are void-kit standards (`Unauthorized` / `Forbidden` / `NotFound`). Make the others as `{ code, kind, message } as const`; void-kit decides the status from `kind`: `unauthenticated` 401, `forbidden` 403, `notFound` 404, `conflict` 409, `unprocessable` 422, `upstream` 502
  - `conflict` (409): it clashes with the thing's current state (taken, already sent, out of stock). `unprocessable` (422): the request itself breaks a rule, whatever the state (past the deadline)
  - **Details**: when the client needs the numbers behind a failure to show it, add `details: z.object({ ... })` to it. It is then always returned as `reply.failure({ code, details })`, and answered as `{ error: { code, message, details } }`
  - Name a code `<THING>_` + what happened (`INVOICE_NOT_SENDABLE`). Clients branch on the `code`, not on the status
  - What you cannot see is `NOT_FOUND` (its existence is not revealed); what you can see but may not touch is `FORBIDDEN`
- **Input validation (400)**: void-kit answers it before the handler, as `VALIDATION_ERROR` with every field that was wrong in `details`, by field name (`{ amount: ["Too small"] }`). A body that is not JSON is the `message`, with `details: {}`
- **Check order**: the guard (401 → 403) → input validation 400 → NOT_FOUND → FORBIDDEN (a permission that needs the row) → unprocessable → conflict
- **Replies**: `reply.success(body)` is always 200, and the body is checked against `responses.success` while it runs: a key the schema does not have is left out (a row passed as it is does not send its other columns), and a body that does not match is a 500. Create and update return the thing as its GET shows it; delete returns `{ ok: true }`
- **IDs**: `as …Id` is written only in the file that declares that `…Id` (its maker, `invoiceId(value)`). Everywhere else calls the maker (`void-kit/no-id-cast`). `UserId` and its maker `userId(value)` come from `void-kit`
- **Module scope**: keep no changing values there (`let`, a `Map`, an array you push to). One Worker serves concurrent requests, so it would be shared across them (`void-kit/no-module-scope-state`)
- **Optional input**: `undefined` in input, `null` in the DB. Normalize with `?? null` before writing

## Do not

- Edit `node_modules/void-kit`. If something is missing, tell the user
- Write an endpoint with Void's `defineHandler`, or answer with `c.json(...)`
- Scatter failure codes as strings (take them from a `Failure` or a void-kit standard)
