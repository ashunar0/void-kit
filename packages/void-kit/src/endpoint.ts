import type { Context } from "hono";
import type { CloudContext, CloudEnv, TypedHandler } from "void";
import type { CurrentUser, Guard } from "./auth.ts";
import {
  errorBody,
  FAILURE_STATUS,
  invalid,
  VALIDATION_ERROR,
  VoidKitError,
  type Failure,
  type FieldErrors,
} from "./failure.ts";
import type {
  AnySchema,
  InferInput,
  InferOutput,
  StandardIssue,
} from "./standard-schema.ts";
import { pathOf } from "./standard-schema.ts";

/**
 * The input an endpoint validates before its handler runs. The names are Void's (`params` / `query` / `body`),
 * so Void's typed fetch checks them at the call site
 */
export type RequestConfig = {
  readonly params?: AnySchema;
  readonly query?: AnySchema;
  readonly body?: AnySchema;
};

export type EndpointConfig = {
  /** Who may call it. Required, so a forgotten guard and a deliberately public endpoint (`allowAnonymous`) differ */
  readonly auth: Guard<CurrentUser | null, readonly Failure[]>;
  readonly request?: RequestConfig;
  readonly responses: {
    /** The body of the 200. Checked while it runs too: a key it does not have is left out */
    readonly success: AnySchema;
    /** The failures the handler returns with reply.failure. Those of the guard and of validation are not written */
    readonly failures?: readonly Failure[];
  };
};

type MaybePromise<T> = T | Promise<T>;

type UserOf<C extends EndpointConfig> = C["auth"] extends Guard<infer U, any> ? U : never;

/** The validated input, one key for each part the endpoint declares */
export type EndpointInput<C extends EndpointConfig> = C extends { request: infer R }
  ? { [K in keyof R as R[K] extends AnySchema ? K : never]: R[K] extends AnySchema ? InferOutput<R[K]> : never }
  : {};

/** Void's context, with the `currentUser` the guard set */
export type EndpointContext<C extends EndpointConfig> = Context<
  CloudEnv & { Variables: { currentUser: UserOf<C> } }
>;

declare const replied: unique symbol;

/**
 * A response made by reply. The handler can return nothing else, so every answer goes
 * through the declaration (no `c.json(...)` with a status or a shape of its own)
 */
export type Replied = Response & { readonly [replied]: true };

type Declared<C extends EndpointConfig> = C["responses"] extends {
  failures: readonly (infer F)[];
}
  ? F
  : never;

/** What reply.failure takes: the code alone, or the code with its details when that failure declares them */
type FailureArg<F> = F extends { code: infer K; details: infer D extends AnySchema }
  ? { readonly code: K; readonly details: InferInput<D> }
  : F extends { code: infer K }
    ? K
    : never;

/** The argument type of reply.failure on an endpoint that declares no failures, so the red squiggle says why */
type NoFailureDeclared =
  "This endpoint declares no failures. Add them to responses.failures: [NotFound, ...]";

export type Reply<C extends EndpointConfig> = {
  /** Success. Always 200, so only the body is passed */
  success(body: InferInput<C["responses"]["success"]>): Promise<Replied>;
  /**
   * An expected failure. Only a code declared in responses.failures is accepted;
   * its status comes from the failure's kind
   */
  failure(
    error: [Declared<C>] extends [never] ? NoFailureDeclared : FailureArg<Declared<C>>,
  ): Promise<Replied>;
};

/** The body a failure is answered with, as the client reads it: `{ error: { code, message, details? } }` */
export type FailureBody<F> = F extends { code: infer K; details: infer D extends AnySchema }
  ? { error: { code: K; message: string; details: InferOutput<D> } }
  : F extends { code: infer K }
    ? { error: { code: K; message: string } }
    : never;

type ValidationFailureBody = {
  error: { code: typeof VALIDATION_ERROR; message: string; details: FieldErrors };
};

/**
 * Every failure the endpoint may answer: those it declares, those of its guard, and VALIDATION_ERROR when it
 * reads input. Carried as `__failures` (types only), which void-kit prepare hands to the client
 */
export type EndpointFailures<C extends EndpointConfig> =
  | FailureBody<Declared<C>>
  | FailureBody<C["auth"]["failures"][number]>
  | (C extends { request: infer R } ? (keyof R extends never ? never : ValidationFailureBody) : never);

/** The validators as Void's codegen reads them (`__validators`), so typed fetch checks the input */
type ValidatorsOf<C extends EndpointConfig> = C extends { request: infer R } ? R : {};

/**
 * Declares an endpoint of a Void route file:
 * ```ts
 * export const GET = createEndpoint(
 *   {
 *     auth: requireAuth,
 *     request: { params: z.object({ id: z.string() }) },
 *     responses: { success: invoiceSchema, failures: [NotFound] },
 *   },
 *   async (c, { params }, reply) => {
 *     const invoice = await findInvoice(params.id);
 *     if (invoice === undefined) return reply.failure(NotFound.code);
 *     return reply.success(invoice);
 *   },
 * );
 * ```
 * Runs, in this order: the guard (401 / 403) → input validation (400) → the handler.
 * Returns Void's TypedHandler, so typed fetch knows the input and the success body
 */
export const createEndpoint = <const C extends EndpointConfig>(
  config: C,
  handler: (
    c: EndpointContext<C>,
    input: EndpointInput<C>,
    reply: Reply<C>,
  ) => MaybePromise<Replied>,
): TypedHandler<ValidatorsOf<C>, InferOutput<C["responses"]["success"]>> & {
  readonly __failures: EndpointFailures<C>;
} => {
  const endpoint = async (c: CloudContext) => {
    try {
      c.set("currentUser", await checkGuard(config.auth, c));
      const input = await validateInput(config.request ?? {}, c);
      return await handler(c as never, input as never, replyFor(config, c) as never);
    } catch (error) {
      if (error instanceof VoidKitError) return error.toResponse();
      throw error;
    }
  };
  return endpoint as never;
};

/** Runs the guard. A failure it does not declare is a bug: the client's types would not know it */
const checkGuard = async (guard: EndpointConfig["auth"], c: CloudContext) => {
  try {
    return await guard.check(c);
  } catch (error) {
    if (error instanceof VoidKitError && !guard.failures.some((f) => f.code === error.code))
      throw new Error(
        `The guard of ${c.req.method} ${c.req.routePath} threw ${error.code}, which it does not declare. List it in createGuard([...], check)`,
      );
    throw error;
  }
};

const readJson = async (c: CloudContext) => {
  try {
    return { value: await c.req.json() };
  } catch {
    return { issues: [{ message: "The request body must be JSON" }] };
  }
};

/** Validates every declared part, and answers 400 with all their problems at once */
const validateInput = async (request: RequestConfig, c: CloudContext) => {
  const raw = {
    params: () => ({ value: c.req.param() }),
    query: () => ({ value: Object.fromEntries(new URL(c.req.url).searchParams) }),
    body: () => readJson(c),
  };
  const input: Record<string, unknown> = {};
  const issues: StandardIssue[] = [];
  for (const part of ["params", "query", "body"] as const) {
    const schema = request[part];
    if (schema === undefined) continue;
    const read: { value?: unknown; issues?: readonly StandardIssue[] } = await raw[part]();
    const checked = read.issues ? read : await schema["~standard"].validate(read.value);
    if (checked.issues) issues.push(...checked.issues);
    else input[part] = checked.value;
  }
  if (issues.length > 0) throw invalid(issues);
  return input;
};

const replyFor = (config: EndpointConfig, c: CloudContext) => ({
  success: async (body: unknown) => {
    const checked = await config.responses.success["~standard"].validate(body);
    if (checked.issues) {
      const [first] = checked.issues;
      const at = pathOf(first?.path);
      throw new Error(
        `The success of ${c.req.method} ${c.req.routePath} does not match responses.success: ${first?.message}${at ? ` (at ${at})` : ""}`,
      );
    }
    return Response.json(checked.value, { status: 200 });
  },
  failure: async (error: string | { code: string; details: unknown }) => {
    const { code, details } =
      typeof error === "string" ? { code: error, details: undefined } : error;
    const declared = config.responses.failures?.find((f) => f.code === code);
    if (declared === undefined)
      throw new Error(
        `${code} is not declared in responses.failures of ${c.req.method} ${c.req.routePath}`,
      );
    return Response.json(errorBody(code, declared.message, details), {
      status: FAILURE_STATUS[declared.kind],
    });
  },
});
