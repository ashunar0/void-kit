# Testing

<!-- Copied from void-kit's presets/handlers (https://github.com/ashunar0/void-kit/tree/main/presets/handlers). Change it there first, then copy again. -->

Tests run with `vp test` (Vitest). Import `it`, `expect`, `describe`, `vi` from `vite-plus/test`.

**Every test file gets its own fresh local D1** — the same Miniflare D1 as `vp dev` — with every migration in `db/migrations` applied, as the `db` of `void/db`. `src/lib/void-kit/test-setup.ts` does it for every file (`test.setupFiles` in `vite.config.ts`); a test does not mock `void/db` itself. So queries, mutations and usecases run their real SQL: a condition in a `WHERE`, a unique index, an `INSERT ... SELECT ... WHERE NOT EXISTS` are tested as they are.

## Where

Next to the code it tests, in `src/` (`src/domains/loan/usecases/borrowBook.test.ts`), or in `tests/`. Never under `routes/` or `pages/`: Void makes every file there a route or a page, a test too (`handlers/no-tests-in-routes` stops it).

A test imports the file it tests directly (`./borrowBook`, `./queries`, `../rules`), and anything else as the code does: another domain through its `index.ts` and `rules.ts`. The import rules of docs/domains.md do not apply to test files otherwise.

## What

- **A usecase**: what it returns when it succeeds, and each failure it can return (`expect(result).toEqual({ ok: false, error: BookOnLoan })`), with the rows that lead to it made by the test
- **A query with a condition** (a status filter, an order): rows on both sides of the condition
- **A rule** in `rules.ts`: a plain function, called as it is
- **Two writes that must not both win** (lending and retiring the same book, a member borrowing a fourth book in two tabs): run them together with `Promise.all` and check that not both succeeded. JavaScript switches between them at every `await`, so the gap between a read and a write is hit, as it would be by two requests. Repeat it a few times in a loop (20) on fresh rows, and give that test a longer timeout (`30_000`): run with the others it passes vitest's 5 seconds. Every rule of the spec that a write must keep ("at most 3", "one member at a time") deserves one: a check read before the write passes this test only when the write checks it again (docs/domains.md, Writing)
- **A gap `Promise.all` will not hit** (a usecase that marks a year as closing, then counts the balances: a transaction must not slip in between): make it happen. Replace the read in the middle with one that first runs the other write, and keep the rest of the module: `vi.mock(import("../queries"), async (original) => { const actual = await original(); return { ...actual, sumTransactions: async (...args) => { await recordTransaction(...); return actual.sumTransactions(...args); } }; })`. Then check the test fails with the write's condition taken out
- A loader, an action or a route is not tested: who may call it, its input and what it sends are held by `createHandler`, its types and the lint (docs/handlers.md). Keep what it does to a call of a usecase or of queries, and test those. **When a loader combines results by a rule of the spec** (a book is available when neither retired nor on loan, a member's count of books and overdue flag), that rule is a function of a `rules.ts` (`isAvailable`, `loanSummaryOf`), tested there; what stays in the loader is reading and looking up (a title by id)

## Data

- The tests in one file share its database, in order. Each test makes the rows it needs (its own book, its own member id: `"member-1"`); it does not count on what another test left or on an empty table
- **Make the rows through the app's usecases** (`addBook`, then `borrowBook`), not by inserting into the tables: rows a usecase could not have made test nothing real. The rules apply while you build them, so build in an order they allow (borrow the loan due last first, or an earlier one is overdue on the day of the next). Insert directly only into a table no usecase writes: the auth `user` table, with `db` from `void/db` and `userTable` from `@auth-schema`
- A list filtered by member: use a member no other test touches. A list of everything (every overdue loan, every member): keep only the rows the test made (`rows.filter((r) => ids.includes(r.id))`) and check their order among themselves
- A member is an id (a string): a usecase takes it as an argument, so a test does not sign in
- **The date is an argument.** A usecase takes `today` (or `now`) from its caller, so a test passes a fixed one (`"2026-11-24"`) and the result does not change with the day it runs. When code reads `now` that a test cannot pass, fix the clock with `vi.setSystemTime(new Date("2026-11-24T00:00:00+09:00"))`
