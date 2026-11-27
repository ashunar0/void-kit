# Pages

<!-- Copied from void-kit's presets/pages (https://github.com/ashunar0/void-kit/tree/main/presets/pages). Change it there first, then copy again. -->

The UI follows Dual-Axis Architecture (DAA): `pages/` binds a URL to a screen, and the screens and their parts live in `src/components/`. `lint/pages.mjs` stops what breaks it.

```
pages/                          binds URLs to screens
  circles/[circleId]/members/
    index.tsx                   the binding: renders the screen with the loader's props
    index.server.ts             the loader and actions (docs/handlers.md)
src/components/
  screens/                      one directory per screen
    members/
      index.tsx                 the screen
      memberRow.tsx             used by this screen only
  widgets/                      parts used by two or more screens, one directory each
    circleHeader/
      index.tsx
  shared/                       generic UI: knows no domain's words
```

## pages/

**Every page is a directory with `index.tsx` in it**: `pages/circles/[circleId]/members/index.tsx`, not `members.tsx`; `pages/books/[id]/index.tsx`, not `[id].tsx`. Its loader and actions are `index.server.ts` beside it. The other files Void reads keep their names: `layout.tsx`, `_error.tsx`, `_not-found.tsx`.

**`index.tsx` only binds.** It imports its screen and the type of its loader's props, and renders the screen with them:

```tsx
// pages/circles/[circleId]/members/index.tsx
import { Members } from "../../../../src/components/screens/members";
import type { Props } from "./index.server";

export default function Page(props: Props) {
  return <Members {...props} />;
}
```

The screen takes the same `Props` (`import type { Props } from ".../pages/.../index.server"`): the loader's `response` decides it, so it is written once. A page with no loader renders its screen with no props. `_error.tsx` and `_not-found.tsx` bind too: each renders a screen with Void's `ErrorPageProps`. A `layout.tsx` that only wraps `children` (and imports the CSS) stays as it is; once it shows something (a menu), that goes in a screen.

**A screen is named after its page**, the last segment of its URL that is not a parameter: `members`, `transactions`, and `transaction` for `transactions/[transactionId]`; `errorPage` and `notFound` for `_error` and `_not-found`. Import a screen or a part by its directory (`.../screens/members`), not its `index` file.

## src/components/

| Tier | What goes there | May import |
| --- | --- | --- |
| `screens/<screen>/` | one screen: its `index.tsx`, and the pieces only it uses, beside it | widgets, shared, a domain's `rules.ts`, types |
| `widgets/<part>/` | a part two or more screens use. It knows the domains' words (a circle's header, the fields of a transaction) | other widgets (no cycle), shared, a domain's `rules.ts`, types |
| `shared/<part>/` | generic UI: a hook that runs an action, a pager. It knows no domain | other shared only |

- **A screen never imports another screen.** When a second screen wants a piece of one, move the piece to `widgets/`
- **A piece starts in the screen that needs it** and moves only when a second screen wants it. Nothing goes in `widgets/` or `shared/` in advance
- **Generic first:** a piece that names no domain's type, rule or word goes in `shared/`, however many screens use it. Before moving a piece to `widgets/` for one domain import (a page size), try passing it as a prop
- **A screen or a part is a directory** with `index.tsx` (`index.ts` for a hook), even with nothing else in it yet
- Everything here runs in the browser: it imports a domain's `rules.ts` and types only (docs/domains.md), and talks to the server only through the page's loader props and Void's `useForm` / `action` / `Link`

The loader gives each screen everything it shows, so there is no client-side data layer (DAA's `features/`): the domain axis is `src/domains/` on the server.
