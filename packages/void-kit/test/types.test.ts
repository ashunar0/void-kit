/**
 * What the types must stop. Checked by `tsc` (pnpm check); every @ts-expect-error has to be an error.
 * Running it does nothing
 */
import { z } from "zod";
import {
  allowAnonymous,
  createEndpoint,
  NotFound,
  requireAuth,
  type CurrentUser,
  type Guard,
} from "../src/index.ts";

const schema = z.object({ id: z.string() });

// auth is required
// @ts-expect-error
createEndpoint({ responses: { success: schema } }, async (_c, _i, reply) => reply.success({ id: "a" }));

// a guard made by hand is not a guard
createEndpoint(
  // @ts-expect-error
  { auth: { check: () => null }, responses: { success: schema } },
  async (_c, _i, reply) => reply.success({ id: "a" }),
);

// the handler returns only what reply makes
createEndpoint(
  { auth: allowAnonymous, responses: { success: schema } },
  // @ts-expect-error
  async (c) => c.json({ id: "a" }),
);

// the success body must match the schema
createEndpoint({ auth: allowAnonymous, responses: { success: schema } }, async (_c, _i, reply) =>
  // @ts-expect-error
  reply.success({ id: 1 }),
);

// only declared failures
createEndpoint(
  { auth: allowAnonymous, responses: { success: schema, failures: [NotFound] } },
  // @ts-expect-error
  async (_c, _i, reply) => reply.failure("FORBIDDEN"),
);

// no failures declared
createEndpoint({ auth: allowAnonymous, responses: { success: schema } }, async (_c, _i, reply) =>
  // @ts-expect-error
  reply.failure("NOT_FOUND"),
);

// currentUser follows the guard: a user behind requireAuth, null behind allowAnonymous
createEndpoint({ auth: requireAuth, responses: { success: schema } }, async (c, _i, reply) => {
  const user: CurrentUser = c.var.currentUser;
  return reply.success({ id: user.id });
});
createEndpoint({ auth: allowAnonymous, responses: { success: schema } }, async (c, _i, reply) => {
  // @ts-expect-error
  const user: CurrentUser = c.var.currentUser;
  return reply.success({ id: String(user) });
});

// a CurrentUser cannot be made by hand
// @ts-expect-error
const forged: CurrentUser = { id: "u_1", name: "x", email: "x", emailVerified: true, createdAt: new Date(), updatedAt: new Date() };

// the input has the declared parts, validated
createEndpoint(
  {
    auth: allowAnonymous,
    request: { params: z.object({ id: z.string() }), query: z.object({ q: z.string() }) },
    responses: { success: schema },
  },
  async (_c, input, reply) => {
    // @ts-expect-error
    input.body;
    return reply.success({ id: input.params.id + input.query.q });
  },
);

// the handler is Void's TypedHandler: typed fetch reads __validators and __output
const GET = createEndpoint(
  { auth: allowAnonymous, request: { query: z.object({ q: z.string() }) }, responses: { success: schema } },
  async (_c, { query }, reply) => reply.success({ id: query.q }),
);
const output: { id: string } = GET.__output;
const validators: { query: typeof GET.__validators.query } = GET.__validators;

export type { Guard };
void [forged, output, validators];

// __failures lists the declared failures, the guard's and VALIDATION_ERROR when there is input
const Taken = { code: "TAKEN", kind: "conflict", message: "Taken", details: z.object({ by: z.string() }) } as const;
const WITH_FAILURES = createEndpoint(
  {
    auth: requireAuth,
    request: { params: z.object({ id: z.string() }) },
    responses: { success: schema, failures: [NotFound, Taken] },
  },
  async (_c, _i, reply) => reply.failure(NotFound.code),
);
type Codes = (typeof WITH_FAILURES.__failures)["error"]["code"];
const codes: Codes[] = ["NOT_FOUND", "TAKEN", "UNAUTHORIZED", "VALIDATION_ERROR"];
// @ts-expect-error
const notACode: Codes = "FORBIDDEN";
// details follow the code
type TakenBody = Extract<typeof WITH_FAILURES.__failures, { error: { code: "TAKEN" } }>;
const by: TakenBody["error"]["details"] = { by: "alice" };

// no input, no guard failures: only what is declared
const PUBLIC = createEndpoint(
  { auth: allowAnonymous, responses: { success: schema } },
  async (_c, _i, reply) => reply.success({ id: "a" }),
);
const nothing: [typeof PUBLIC.__failures] extends [never] ? true : false = true;

void [codes, notACode, by, nothing];
