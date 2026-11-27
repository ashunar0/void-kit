# Domains

<!-- Copied from void-kit's presets/domains (https://github.com/ashunar0/void-kit/tree/main/presets/domains). Change it there first, then copy again. -->

Void decides where pages, routes and tables go, not where the business rules go. They live in `src/domains/<noun>/`, outside the entry points. Every domain draws from the same list of file kinds below, and **what a file imports decides which kind it is**, so where a function goes is never a judgment of size. Between domains the rules are those of a modular monolith: one app and one database, split into domains that touch each other only through what each one publishes. `lint/domains.mjs` (rule `domains/imports`) stops an import that breaks the tables below.

```
src/domains/<noun>/
  index.ts            # what other domains and the entry points may call: queries, usecases
  rules.ts            # no I/O: values, plain functions, failures, the shapes of values (monthSchema). Read directly, by anyone
  queries.ts          # reads (SELECT) of this domain's tables
  mutations.ts        # writes (INSERT / UPDATE / DELETE) of this domain's tables
  usecases/<verb>.ts  # one operation: read, check, write. Named by a verb (sendInvoice)
  usecases/_<name>.ts # a part two usecases of this domain share (usecases/_withinBudget.ts)
db/schema/<noun>.ts   # this domain's tables
```

A domain has only the kinds it has something to put in: no empty files (a domain of values alone has only `rules.ts`). The list is fixed: no other kind of file is added to a domain. Each kind has the same role and rules in every domain.

Import with relative paths, and import a domain's `index.ts` and `rules.ts` by name (`../../src/domains/invoice/index`), not by its directory.

## Inside a domain: where a function goes

1. Needs no database and no request → `rules.ts`
2. Only reads → `queries.ts`
3. Only writes → `mutations.ts`
4. Anything else (reads and writes, reads another domain, decides from what it read) → `usecases/<verb>.ts`, in the domain that owns the table it writes

## Entry points

An entry point is what Void calls: a page's loader and actions (`pages/**/*.server.ts`), a server route (`routes/**`), a cron (`crons/**`), a queue (`queues/**`), a middleware (`middleware/**`). It stays thin: it reads its input, checks who is calling, calls queries and usecases, and answers. It does not touch the database (`db` from `void/db`, the tables from `@schema`); types from `@schema` are fine.

What it may put together itself is only a read that makes what it returns: a loader calls each domain's queries and combines the results into the page's props (a list with a flag from another domain, a summary). A flag or a count the spec defines (available, overdue, how many) is worked out by a function of the domain's `rules.ts`, not written in the loader, so it is tested once and every page that shows it agrees. A read whose result is used to write, send or decide (which reminders to send now) is a usecase, even when it begins by reading another domain. A cron or a queue returns nothing to show, so in practice only loaders and routes put reads together.

What goes in `queries.ts` is decided by what the domain needs, not by what a page shows. Reading an invoice with its payments together belongs there when a usecase decides from it (how much is still unpaid); when only a page shows them together, the loader combines two queries.

A page component (`pages/**` that is not `.server`, and the screens and parts in `src/components/`, docs/pages.md) runs in the browser too: it imports a domain's `rules.ts` and types only, never an `index.ts`, which would pull the queries into the browser.

## Tables

**A table belongs to one domain: its tables are in `db/schema/<domain>.ts`.** `db/schema/index.ts` re-exports every file (`export * from "./invoice";`), so `@schema` still has them all for Void (migrations, `void/db`). A domain's queries and mutations import only their own file, `@schema/<domain>`, never `@schema` or another domain's file. Another domain reads those tables through the owner's queries.

Keep `db/schema.ts` out: with it, Void reads `@schema` as that one file and `@schema/<domain>` does not resolve. The auth tables (`@auth-schema`) belong to no domain: any domain's queries may read them, by `@auth-schema`, never by a path into `.void/`. A domain whose only data is there (the list of members) owns no table: it has its `queries.ts` (and `index.ts`, `rules.ts` when it needs them) and no `db/schema/<noun>.ts`.

A value of another domain is copied into your own table only to keep it as it was at that time (an invoice line keeps the item's name and price), or when it never changes and reading it from the owner would go through the owner's rows every time.

## Between domains

1. **Outside a domain, two of its files are read: `index.ts` and `rules.ts`.** A domain's own files import each other directly, never their own `index.ts`
2. **`index.ts` publishes queries and usecases only**, one line each
3. **To change another domain's data, call that domain's usecase.** A usecase may call another domain's usecase through its `index.ts`
4. **Domains do not depend on each other in a circle.** Not invoice → customer and customer → invoice. A circle means something sits in the wrong domain. Fix it in this order:
   1. Look at whose state decides when it happens. If it is one domain's, move it there. If it spans both, put it in the later one: the one whose rows cannot be made without the other's, which holds the foreign key (`payments.invoice_id`: a payment comes after its invoice)
   2. If both need a word, move it into a domain of its own with rules only, below both. Invoices and quotes both need the list of tax rates, so it is the `tax` domain. A word of this app's business (a tax rate) is a domain; what any app has (yen, dates) goes in the shared place, `src/lib/` (the app's own files; `src/lib/void-kit/` holds void-kit's and is not edited)
   3. If neither works, the two were one domain: put them together

   Once fixed, the later one reads the earlier one (a payment reads its invoice), never the other way. Which is earlier is decided by who reads and calls whom, not by who keeps whose id: the ledger keeps a circle's id on its accounts, yet making a circle calls the ledger's usecase to open its ledger, and the ledger never reads the circle. Then the circle is the later one

`rules.ts` imports nothing but a schema library (zod) and other rules, so anyone may read it. `index.ts` publishes queries, so a file below them (`rules.ts`, `db/**`) that read an `index.ts` would import its way round (`db/schema/invoice.ts` → `tax/index` → `tax/queries` → `db/schema/tax.ts`).

A case this page does not settle is a hole in the rules: stop and ask.

## Failures

A failure the rules expect (not found, already sent, on loan) is a value, returned; one nobody expects (the database is down) is thrown. `Result`, `ok`, `err` come from `src/lib/void-kit/result.ts`, and `Failure`, `toHttp` from `src/lib/void-kit/failure.ts` (the handlers preset).

- **Declare each failure once, in the `rules.ts` of the domain that finds it**:
  ```ts
  export const InvoiceAlreadySent = {
    code: "INVOICE_ALREADY_SENT",
    kind: "conflict",
    message: "この請求書はすでに送付されています",
  } as const satisfies Failure;
  ```
  `message` is what the page shows, as it is. `kind` decides the HTTP status (`toHttp` holds the table); never write a status yourself
- **A failure names what this operation could not do, not the state behind it.** The same state can stop two operations, and then they are two failures, each with its own code and message: a book on loan cannot be retired (`BOOK_ON_LOAN`, 「貸出中の本は除籍できません」) and cannot be lent (`BOOK_NOT_AVAILABLE`, 「この本は貸出中です」). Name the code after the thing and what happened (`INVOICE_ALREADY_SENT`)
- **A usecase that can fail returns a `Result`**: `return err(InvoiceAlreadySent)`, and `ok(value)` when it succeeds. A usecase that calls another domain's usecase passes that one's failure on as it is (`if (!result.ok) return result;`), or returns it directly
- **The entry point turns a failure into HTTP**: `if (!result.ok) throw toHttp(result.error);`. Void then puts the message in `form.error` (`action()` returns it as `{ ok: false, error }`). A failure that belongs next to one field is `ValidationError({ field: message })` from `void/handler` instead
- Kinds: `notFound` (404): it does not exist, or the caller may not know it does. `forbidden` (403): the caller can see it but may not do this. `conflict` (409): it clashes with the current state (taken, already sent, on loan). `unprocessable` (422): the request breaks a rule whatever the state (past the deadline). When a failure could be more than one kind, make it `conflict`
- A failure is checked in this order: `notFound` → `forbidden` → `unprocessable` → `conflict`
- Queries do not return failures: a row that is not there is `undefined`, and the usecase or loader decides what that means (a loader answers `c.notFound()`)

## What each file may import

| File                         | May import                                                                                                     | May not                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `index.ts`                   | its own domain's queries, usecases                                                                             | rules, mutations, `usecases/_*`, anything outside its domain                                    |
| `rules.ts`                   | another domain's `rules.ts`, `src/lib`, a schema library (zod), types                                          | `void`, `void/*`, `@schema`, drizzle, hono, any `index.ts`, queries / mutations / usecases      |
| `queries.ts`, `mutations.ts` | `void/db`, `@schema/<its own domain>`, `@auth-schema`, its own domain's files, another domain's `rules.ts`, `src/lib` | `@schema`, another domain's tables, another domain's `index.ts` and other files, its own usecases |
| `usecases/*`                 | its own domain's queries / mutations / rules / `usecases/_*`, another domain's `index.ts` and `rules.ts`, `src/lib`, `void/db` for `db.batch` | drizzle, `@schema` values, another usecase of its own domain (share through `usecases/_*`) |
| entry points                 | a domain's `index.ts` and `rules.ts`, `src/lib`, types from `@schema`                                          | a domain's other files, `db` from `void/db`, `@schema` values, drizzle                         |
| page components, `src/components/**` | a domain's `rules.ts`, `src/lib`, types                                                                        | any `index.ts`, a domain's other files, `void/db`, `@schema` values                            |
| `db/**`                      | a domain's `rules.ts`, so a table can use a list of values (`taxRates`), `src/lib`                             | any `index.ts`, a domain's other files                                                          |
| `src/lib/**`                 | other files in `src/lib`, packages                                                                             | any domain, `db/**`                                                                             |
| anything else                | a domain's `index.ts` and `rules.ts`, `src/lib`                                                                | a domain's other files                                                                          |

## Writing

- **What must be written together lives in one domain.** When two rows must never be written one without the other, their tables belong to the same domain: the domain of the usecase that writes them
- To write them together, the usecase puts the mutations in one `db.batch([...])` (`db` from `void/db`; D1 has no interactive transaction)
- **What a write must check at the moment it writes lives in its domain too.** Reading first and writing after lets another request come in between (a book is lent after the check that it is not, then retired). So the check is the write's own condition, one statement nothing can come between: a conditional `UPDATE ... WHERE`, or `INSERT ... SELECT ... WHERE NOT EXISTS (...)` (drizzle: `db.insert(table).select(...)`, listing every column in the table's order). Its condition reads only this domain's tables. When it would need another domain's, the state it reads belongs here: retiring needs "not on loan" and lending needs "not retired", so retirement is loan's state (a `retirements` table), not a column of the book. A usecase may still read first, to say which failure it was; the write decides. When the write's condition has several parts and no row comes back, read again in the same order as the checks before the write, and return the first that holds
- **A change made from what someone was looking at carries the version they saw.** Two treasurers edit the same row: the row has a `version`, the form sends it back, and the update is `WHERE id = ? AND version = ?` setting `version + 1`. No row back means someone else changed it first: a failure of its own ("someone changed it first"), not a not-found
- Every write goes through a usecase, even one with nothing to check: otherwise "is there a check?" is a choice made each time, and adding one later moves the code
- `mutations.ts` returns the query, not yet run. The usecase awaits it and reads the result: no row back from an update means it found nothing or lost to another edit

## Writing across domains

A usecase that changes several domains holds the steps and calls each domain's usecase in turn (cancelling an invoice: invoice → payment → notification). The actions and the cron call that one usecase. On D1 the steps cannot be one transaction: how to keep a failure halfway from breaking anything is in the design-knowledge skill (a write in steps, a thing whose state moves).

Events between domains are not used while the domains share one database: they are harder to follow than a call. Something that may happen later on its own (a mail) can go through a Queue when it comes up.

## An entry point that works through many (cron, queue)

- The entry point calls **a usecase that picks** and **a usecase for one**: the reminder cron picks with `pickOverdueInvoices` and calls `sendReminder` on each
- The one that picks writes nothing: it decides what to work on and returns it. When one domain's queries are enough to pick, a query does it
- The entry point holds only the loop and "one failure does not stop the rest"
- The two are not put together into one usecase: a usecase does not call another usecase of its own domain
- The usecase for one does not trust what was decided when it was picked: it switches the state with a conditional update (design-knowledge: a thing whose state moves)
