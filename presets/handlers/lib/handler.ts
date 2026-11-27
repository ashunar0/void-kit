import {
  defineHandler,
  type CloudContext,
  type HandlerInput,
  type TypedHandler,
  type ValidatorSlots,
} from "void";
import { requireAuth } from "void/auth";
import { HTTPException } from "hono/http-exception";
import type { MiddlewareHandler } from "hono";

/**
 * Who may call a handler, and who they are. Runs before any input validation.
 * `check` returns the member the handler receives, or throws (a redirect, a 401, a 403)
 */
export type Guard<Member> = { readonly check: (c: CloudContext) => Member | Promise<Member> };

/** Makes a guard: `export const requireRole = (role) => guard((c) => { ... })` */
export const guard = <Member>(
  check: (c: CloudContext) => Member | Promise<Member>,
): Guard<Member> => ({
  check,
});

/** For a page: a signed-out visitor is sent to the sign-in page */
export const requireMember = guard((c) => requireAuth(c, { throwRedirect: "/sign-in" }));

/** For a route under routes/ (called with fetch): a signed-out request gets 401, not a redirect */
export const requireMemberApi = guard((c) => requireAuth(c));

/** Says explicitly that anyone may call it. The member is always null. grep it to list every public handler */
export const allowAnonymous = guard((): null => null);

type Slots = ValidatorSlots;
type Schema = NonNullable<Slots["body"]>;
type Out<S> = S extends Schema ? NonNullable<S["~standard"]["types"]>["output"] : never;
type In<S> = S extends Schema ? NonNullable<S["~standard"]["types"]>["input"] : never;

/** The validator slots a config declares */
type SlotsOf<C> = { [K in keyof C & keyof Slots]: C[K] } & {};

/** What the handler receives besides c: the validated input, who is calling, and the time of the request */
type Input<C, Member> = HandlerInput<SlotsOf<C>> & { member: Member; now: Date };

/** At most 4 (Void takes 5 in all, auth is one) */
type Middleware =
  | []
  | [MiddlewareHandler]
  | [MiddlewareHandler, MiddlewareHandler]
  | [MiddlewareHandler, MiddlewareHandler, MiddlewareHandler]
  | [MiddlewareHandler, MiddlewareHandler, MiddlewareHandler, MiddlewareHandler];

/**
 * The schemas a config declares, put back together from their own type parameters.
 * Each one has its own so that TypeScript reads them before it types the handler beside them
 */
type Declared<B, Q, P, S> = (B extends Schema ? { body: B } : {}) &
  (Q extends Schema ? { query: Q } : {}) &
  (P extends Schema ? { params: P } : {}) &
  (S extends Schema ? { response: S } : {});

/** What reaches the page or the client: the response schema's output when there is one */
type Returned<C, R> = C extends { response: infer S extends Schema }
  ? Out<S> | Extract<Awaited<R>, Response>
  : R;

/**
 * What the handler may return. With a response schema, its input (or a Response, for a redirect or a 404),
 * so a value that drifted from the schema is underlined where it is returned, not found at run time
 */
type MayReturn<C, R> = C extends { response: infer S extends Schema }
  ? In<S> | Response | Promise<In<S> | Response>
  : R;

const MEMBER = "voidKit.member";

/**
 * A loader, an action, an entry of actions, or a method of a route:
 * `export const loader = createHandler({ auth: requireMember, response: propsSchema, handler: async (c, { member, now }) => ... })`.
 * Runs auth → middleware → input validation → handler, then checks what it returns against `response`.
 * The handler is the config's last key: with it inside, the config is always one key per line once formatted
 */
export const createHandler = <
  Member,
  R,
  B extends Schema | undefined = undefined,
  Q extends Schema | undefined = undefined,
  P extends Schema | undefined = undefined,
  S extends Schema | undefined = undefined,
>(config: {
  /** Required. requireMember, requireMemberApi, allowAnonymous, or a guard of the app's */
  auth: Guard<Member>;
  /** Other middleware, run after auth and before the input is validated */
  middleware?: Middleware;
  /** The input, validated as Void does */
  body?: B;
  query?: Q;
  params?: P;
  /**
   * What the handler returns, checked while it runs: a key the schema does not have is left out,
   * and a value that does not match is a 500. Required for a loader and for routes (docs/handlers.md)
   */
  response?: S;
  /** What it does: `(c, { body, query, params, member, now }) => ...`. Written last */
  handler: (
    c: CloudContext,
    input: Input<Declared<B, Q, P, S>, Member>,
  ) => MayReturn<Declared<B, Q, P, S>, R>;
}): TypedHandler<
  SlotsOf<Declared<B, Q, P, S>>,
  Exclude<Awaited<Returned<Declared<B, Q, P, S>, R>>, Response>
> => {
  const { handler } = config;
  const auth: MiddlewareHandler = async (c, next) => {
    c.set(MEMBER, await config.auth.check(c as unknown as CloudContext));
    await next();
  };
  const slots: Slots = {};
  if (config.body) slots.body = config.body;
  if (config.query) slots.query = config.query;
  if (config.params) slots.params = config.params;

  const run = defineHandler.withValidator(slots)(async (c, input) => {
    const now = new Date();
    const result = await handler(c, { ...(input as object), member: c.get(MEMBER), now } as Input<
      Declared<B, Q, P, S>,
      Member
    >);
    if (config.response === undefined || result instanceof Response) return result;
    const checked = await config.response["~standard"].validate(result);
    if (checked.issues) {
      console.error("The handler returned what its response schema does not allow", checked.issues);
      throw new HTTPException(500, { message: "Internal Server Error" });
    }
    return checked.value;
  });

  const middleware = config.middleware ?? [];
  return (defineHandler as (...args: unknown[]) => unknown)(auth, ...middleware, run) as never;
};
