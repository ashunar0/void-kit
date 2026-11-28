# Testing

<!-- Copied from void-kit's presets/handlers (https://github.com/ashunar0/void-kit/tree/main/presets/handlers). Change it there first, then copy again. -->

Tests run with `vp test` (Vitest), as Void's testing guide says (`node_modules/void/docs/guide/testing.md`): in Node.js, without a Worker and without a database. Import `it`, `expect`, `describe`, `vi` from `vite-plus/test`.

Two ways of checking, each for what it can show:

- **`vp test`**: the rules and the branches of a usecase. What touches D1, R2 or KV is replaced with `vi.mock()`, as Void's guide does
- **`vp dev` and curl**: what the SQL keeps (a condition in a `WHERE`, a unique index, a foreign key, two requests at once). Only the real D1 can show it

## Where

Next to the code it tests, in `src/` (`src/domains/loan/usecases/borrowBook.test.ts`), or in `tests/`. Never under `routes/` or `pages/`: Void makes every file there a route or a page, a test too (`handlers/no-tests-in-routes` stops it).

A test imports the file it tests directly (`./borrowBook`, `../rules`), and anything else as the code does: another domain through its `index.ts` and `rules.ts`. The import rules of docs/domains.md do not apply to test files otherwise.

## What `vp test` checks

- **A rule** in `rules.ts`: a plain function, called as it is. Most of the spec lives here, so most tests do too
- **A usecase**: what it returns when it succeeds, and each failure it can return (`expect(result).toEqual({ ok: false, error: BookOnLoan })`). Replace its domain's `queries` and `mutations` (and any other domain's `index.ts` it calls) with `vi.mock()`, so each test says what the reads return and what the write reports:

  ```ts
  vi.mock(import("../queries"), () => ({ findBook: vi.fn(), countLoans: vi.fn() }));
  vi.mock(import("../mutations"), () => ({ insertLoanIfAvailable: vi.fn() }));

  it("refuses a fourth book", async () => {
    vi.mocked(findBook).mockResolvedValue(book);
    vi.mocked(countLoans).mockResolvedValue(3);
    expect(await borrowBook({ ... })).toEqual({ ok: false, error: LoanLimitReached });
    expect(insertLoanIfAvailable).not.toHaveBeenCalled();
  });
  ```

  A write that comes back with no row (its condition did not hold) is a case too: say so with the mock (`mockResolvedValue([])`) and check the usecase reads again and returns the failure the spec names (docs/domains.md, Writing)

- **A usecase in steps** (write here, then call another domain, then confirm): make each step fail in turn with the mock, and check what is left and that running it again finishes it
- A query or a mutation is not tested with `vp test`: it is SQL, and a mock would only repeat it. It is checked in `vp dev` (below)
- A loader, an action or a route is not tested: who may call it, its input and what it sends are held by `createHandler`, its types and the lint (docs/handlers.md). Keep what it does to a call of a usecase or of queries, and test those. **When a loader combines results by a rule of the spec** (a book is available when neither retired nor on loan, a member's count of books and overdue flag), that rule is a function of a `rules.ts` (`isAvailable`, `loanSummaryOf`), tested there; what stays in the loader is reading and looking up (a title by id)

## What `vp dev` checks

Every rule of the spec that a write keeps by its SQL: the condition of a write ("at most 3", "not after the year is closed"), a unique index, a foreign key that refuses a delete. Run `vp dev`, sign in with curl and send the requests:

```sh
curl -s -c jar -X POST localhost:5173/api/auth/sign-in/email \
  -H 'content-type: application/json' -d '{"email":"a@example.test","password":"..."}'
```

- **Two writes that must not both win** (lending and retiring the same book, a member borrowing a fourth book in two tabs): send them at the same time, a few times (20) on fresh rows, and check that not both succeeded. The gap between a read and a write is hit only by two requests: a check read before the write passes one at a time and fails here (docs/domains.md, Writing)
- **A rule kept by the write's condition**: send the request that breaks it and check the status (409, 422) and that no row was written
- **A row another domain points at**: delete it and check it is refused

Make the rows through the app (its pages and actions, or curl to them), not by writing into the tables. Write down what was sent and what came back in the report of the work.

The one exception is a state the app never leaves a row in on purpose: a write that stopped halfway (a payment still being recorded, a year still closing), which a cron picks up. Make the row through the app first, then change only its state and its time in `vp dev`'s D1 (the Local Explorer that `vp dev` prints, `/cdn-cgi/local/explorer/api/d1/database`), and run the cron with `POST /__void/scheduled` and a `scheduledTime` past the wait. Say in the report which columns were changed.

## Data

- **The date is an argument.** A usecase takes `today` (or `now`) from its caller, so a test passes a fixed one (`"2026-11-24"`) and the result does not change with the day it runs. When code reads `now` that a test cannot pass, fix the clock with `vi.setSystemTime(new Date("2026-11-24T00:00:00+09:00"))`
- A member is an id (a string): a usecase takes it as an argument, so a test does not sign in
