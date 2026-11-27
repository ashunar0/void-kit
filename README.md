# void-kit

Rules for writing a [Void](https://void.cloud) app's server side so that it comes out in one shape, whoever writes it (AI included): who may call each loader, action and route, what it may send, how an expected failure is returned, and where the business rules go. Each rule that can be checked is stopped by types or lint as it is written, with how to fix it.

> Unofficial. Not affiliated with Void (VoidZero).

[日本語](README.ja.md)

## Why

When AI writes a backend, the details drift every time: whether a page checks who is signed in, what a loader sends to the browser, how a failure reaches the form, where a rule lives. Void decides where pages, routes and tables go; it leaves these to whoever writes the code. void-kit fixes them up front and stops what breaks them.

It is the Void edition of [hono-kit](https://github.com/ashunar0/hono-kit), and adds less: what Void already has (routing, validation, forms, auth, database, deploys) is used as it is. void-kit only decides where and in what order Void's parts are called.

```ts
// pages/books/[id].server.ts
export const loader = createHandler(
  { auth: requireMember, response: propsSchema }, // who may call it, and what may reach the browser
  async (c, { member, now }) => {
    // ...
  },
);

export const actions = {
  borrow: createHandler({ auth: requireMember }, async (c, { member, now }) => {
    const result = await borrowBook(member.id, Number(c.req.param("id")), todayInJapan(now));
    if (!result.ok) throw toHttp(result.error); // the message shows in form.error
  }),
};
```

## Presets

void-kit is not an npm package. Like [shadcn/ui](https://ui.shadcn.com), you copy the files into your app and own them. Each preset's README says what to copy and how to turn its lint on.

| Preset | What it decides |
| --- | --- |
| [handlers](presets/handlers/README.md) | Every loader, action and route is built with `createHandler`: `auth` (required) runs before the input is validated, the handler receives who is calling (`member`) and the time (`now`), and what a loader or route returns is checked against its `response` schema. An expected failure is a `Result`, turned into HTTP by `toHttp` |
| [domains](presets/domains/README.md) | Where the business rules go (`src/domains/<noun>/`), which file may import which, and how domains call each other. Needs handlers |

With AI, point `AGENTS.md` at the preset docs and ask it to make `tsc` and the lint pass.

## Status

- 0.x, and the shape still moves. It is tried by having another AI build a small app from the docs alone and collecting where it hesitated
- Tested on Void 1.12 with React, D1 and zod
- Decisions and open questions: [DESIGN.ja.md](DESIGN.ja.md) (Japanese)

## License

MIT
