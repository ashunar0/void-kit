# Testing

<!-- Copied from void-kit's presets/handlers (https://github.com/ashunar0/void-kit/tree/main/presets/handlers). Change it there first, then copy again. -->

Tests run with `vp test` (Vitest). Import `it`, `expect`, `describe`, `vi` from `vite-plus/test`.

**Every test file gets its own fresh local D1** — the same Miniflare D1 as `vp dev` — with every migration in `db/migrations` applied, as the `db` of `void/db`. `src/lib/void-kit/test-setup.ts` does it for every file (`test.setupFiles` in `vite.config.ts`); a test does not mock `void/db` itself. So queries, mutations and usecases run their real SQL: a condition in a `WHERE`, a unique index, an `INSERT ... SELECT ... WHERE NOT EXISTS` are tested as they are.

## Where

Next to the code it tests, in `src/` (`src/domains/loan/usecases/borrowBook.test.ts`), or in `tests/`. Never under `routes/` or `pages/`: Void makes every file there a route or a page, a test too (`handlers/no-tests-in-routes` stops it).

## What

- **A usecase**: what it returns when it succeeds, and each failure it can return (`expect(result).toEqual({ ok: false, error: BookOnLoan })`), with the rows that lead to it made by the test
- **A query with a condition** (a status filter, an order): rows on both sides of the condition
- **A rule** in `rules.ts`: a plain function, called as it is
- **Two writes that must not both win** (lending and retiring the same book): run them together with `Promise.all` and check that not both succeeded. JavaScript switches between them at every `await`, so the gap between a read and a write is hit, as it would be by two requests
- A loader, an action or a route is not tested: who may call it, its input and what it sends are held by `createHandler`, its types and the lint (docs/handlers.md). Keep what it does to a call of a usecase or of queries, and test those

## Data

- The tests in one file share its database, in order. Each test makes the rows it needs (its own book, its own member id: `"member-1"`); it does not count on what another test left or on an empty table. A test that reads a list uses a member or a filter no other test touches
- A member is an id (a string): a usecase takes it as an argument, so a test does not sign in. Insert a row in the auth `user` table only for a query that reads it
- **The date is an argument.** A usecase takes `today` (or `now`) from its caller, so a test passes a fixed one (`"2026-11-24"`) and the result does not change with the day it runs. When code reads `now` that a test cannot pass, fix the clock with `vi.setSystemTime(new Date("2026-11-24T00:00:00+09:00"))`
