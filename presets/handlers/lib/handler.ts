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
export const guard = <Member>(check: (c: CloudContext) => Member | Promise<Member>): Guard<Member> => ({
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

/** The validator slots a config declares */
type SlotsOf<C> = { [K in keyof C & keyof Slots]: C[K] } & {};

/** What the handler receives besides c: the validated input, who is calling, and the time of the request */
type Input<C, Member> = HandlerInput<SlotsOf<C>> & { member: Member; now: Date };

type Config<Member> = Slots & {
  /** Required. requireMember, requireMemberApi, allowAnonymous, or a guard of the app's */
  auth: Guard<Member>;
  /** Other middleware, run after auth and before the input is validated. At most 4 (Void takes 5 in all) */
  middleware?:
    | []
    | [MiddlewareHandler]
    | [MiddlewareHandler, MiddlewareHandler]
    | [MiddlewareHandler, MiddlewareHandler, MiddlewareHandler]
    | [MiddlewareHandler, MiddlewareHandler, MiddlewareHandler, MiddlewareHandler];
  /**
   * What the handler returns, checked while it runs: a key the schema does not have is left out,
   * and a value that does not match is a 500. Required for a loader and for routes (docs/handlers.md)
   */
  response?: Schema;
};

/** What reaches the page or the client: the response schema's output when there is one */
type Returned<C, R> = C extends { response: infer S extends Schema }
  ? Out<S> | Extract<Awaited<R>, Response>
  : R;

const MEMBER = "voidKit.member";

/**
 * A loader, an action, an entry of actions, or a method of a route:
 * `export const loader = createHandler({ auth: requireMember, response: propsSchema }, async (c, { member, now }) => ...)`.
 * Runs auth → middleware → input validation → handler, then checks what it returns against `response`
 */
export const createHandler = <const C extends Config<Member>, Member, R>(
  config: C & { auth: Guard<Member> },
  handler: (c: CloudContext, input: Input<C, Member>) => R,
): TypedHandler<SlotsOf<C>, Exclude<Awaited<Returned<C, R>>, Response>> => {
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
    const result = await handler(c, { ...(input as object), member: c.get(MEMBER), now } as Input<C, Member>);
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
