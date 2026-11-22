import type { AuthUser, CloudContext } from "void";
import { fail, Unauthorized, type Failure } from "./failure.ts";

/**
 * Who may call an endpoint (a guard in its required `auth`) and who is signed in (`CurrentUser`).
 * The session itself is read by Void's auth (Better Auth), which puts the user on `c.var.user`.
 * void-kit only turns that into a `CurrentUser` and decides who is let through
 */

declare const userIdBrand: unique symbol;

/** A user's ID. Mixing one up with another ID (an invoice's) is a type error */
export type UserId = string & { readonly [userIdBrand]: true };

/** Brands a string from outside or from the DB as a user ID. The only `as UserId` */
export const userId = (value: string) => value as UserId;

/**
 * The brand. Its name is invisible outside this file, so only getCurrentUser makes a CurrentUser:
 * a user made by hand (from a request body) cannot be passed where the signed-in user is expected
 */
declare const verified: unique symbol;

/**
 * Who is signed in now: Void's auth user, with its id as a UserId.
 * The app's own data about a person (a profile, a member) is a table of its own, read where it is needed
 */
export type CurrentUser = Readonly<Omit<AuthUser, "id"> & { id: UserId }> & {
  readonly [verified]: true;
};

/**
 * The signed-in CurrentUser, or null. The only way to make a CurrentUser. For guards
 * (requireAuth, and the ones the app adds). A handler reads `c.var.currentUser`, which its guard set
 */
export const getCurrentUser = (c: CloudContext): CurrentUser | null => {
  const user = c.get("user");
  // Void sets null for a signed-out request, and nothing at all when its auth is off.
  // Without this, every requireAuth endpoint would answer 401 with no hint why
  if (user === undefined)
    throw new Error(
      "Void's auth is not on, so nobody can be signed in. Turn it on: `auth: { providers: [\"email\"] }` in void.config.ts, or an auth.ts at the project root (node_modules/void/docs/guide/auth.md)",
    );
  return user as CurrentUser | null;
};

declare const guardBrand: unique symbol;

/**
 * Decides who may call an endpoint and who `currentUser` is. Made only with createGuard, so `auth` cannot be
 * a hand-written object or a middleware that lets everyone through without saying who they are.
 * It carries the failures it may answer, so the client's types know them (`fetchResult` from void-kit/client)
 */
export type Guard<U extends CurrentUser | null, F extends readonly Failure[] = readonly Failure[]> = {
  readonly [guardBrand]: true;
  readonly failures: F;
  readonly check: (c: CloudContext) => U | Promise<U>;
};

/**
 * Makes a guard. `check` returns who the caller is (a CurrentUser from getCurrentUser, or null for anyone),
 * or throws `fail(...)` with one of the failures listed first:
 * ```ts
 * export const requireAdmin = createGuard([Unauthorized, Forbidden], (c) => {
 *   const user = getCurrentUser(c);
 *   if (user === null) throw fail(Unauthorized);
 *   if (user.role !== "admin") throw fail(Forbidden);
 *   return user;
 * });
 * ```
 * Throwing a failure not listed is a bug in the app (500), so the client's types never miss one
 */
export const createGuard = <const F extends readonly Failure[], U extends CurrentUser | null>(
  failures: F,
  check: (c: CloudContext) => U | Promise<U>,
): Guard<U, F> => ({ failures, check }) as unknown as Guard<U, F>;

/** Requires sign-in: `auth: requireAuth`. A signed-out request is answered 401 before the handler */
export const requireAuth = createGuard([Unauthorized], (c) => {
  const user = getCurrentUser(c);
  if (user === null) throw fail(Unauthorized);
  return user;
});

/**
 * Says explicitly that no sign-in is required: `auth: allowAnonymous`. Lets everyone through, and currentUser is null.
 * grep it to list every endpoint anyone may call
 */
export const allowAnonymous = createGuard([], () => null);
