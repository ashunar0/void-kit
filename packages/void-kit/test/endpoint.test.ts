import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { z } from "zod";
import {
  allowAnonymous,
  createEndpoint,
  createGuard,
  err,
  fail,
  Forbidden,
  getCurrentUser,
  NotFound,
  ok,
  requireAuth,
  Unauthorized,
  type Result,
} from "../src/index.ts";

const invoiceSchema = z.object({ id: z.string(), amount: z.number() });
const invoices = new Map([["inv_1", { id: "inv_1", amount: 100, secret: "x" }]]);

const OverBudget = {
  code: "OVER_BUDGET",
  kind: "unprocessable",
  message: "Over the budget",
  details: z.object({ budget: z.number() }),
} as const;

const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { params: z.object({ id: z.string() }) },
    responses: { success: invoiceSchema, failures: [NotFound] },
  },
  async (c, { params }, reply) => {
    assert.equal(c.var.currentUser.name, "Alice");
    const invoice = invoices.get(params.id);
    if (invoice === undefined) return reply.failure(NotFound.code);
    return reply.success(invoice);
  },
);

const findBudget = (amount: number): Result<number, { code: "OVER_BUDGET"; details: { budget: number } }> =>
  amount > 1000 ? err({ code: OverBudget.code, details: { budget: 1000 } }) : ok(amount);

const POST = createEndpoint(
  {
    auth: allowAnonymous,
    request: { body: z.object({ amount: z.number().positive() }) },
    responses: { success: invoiceSchema, failures: [OverBudget] },
  },
  async (c, { body }, reply) => {
    assert.equal(c.var.currentUser, null);
    const result = findBudget(body.amount);
    if (!result.ok) return reply.failure(result.error);
    return reply.success({ id: "inv_2", amount: result.value });
  },
);

const requireAdmin = createGuard([Unauthorized, Forbidden], (c) => {
  const user = getCurrentUser(c);
  if (user === null) throw fail(Unauthorized);
  if (user.name !== "Admin") throw fail(Forbidden);
  return user;
});

const DELETE = createEndpoint(
  { auth: requireAdmin, responses: { success: z.object({ ok: z.literal(true) }) } },
  async (_c, _input, reply) => reply.success({ ok: true }),
);

// a guard that throws a failure it does not declare
const sloppyGuard = createGuard([Unauthorized], () => {
  throw fail(Forbidden);
});
const SLOPPY = createEndpoint(
  { auth: sloppyGuard, responses: { success: z.object({ ok: z.literal(true) }) } },
  async (_c, _input, reply) => reply.success({ ok: true }),
);

const BROKEN = createEndpoint(
  { auth: allowAnonymous, responses: { success: invoiceSchema } },
  // a value that only claims its type, as `as` would
  async (_c, _input, reply) => reply.success({ id: 1 } as never),
);

/** null: signed out. undefined: Void's auth is off, so it sets no user at all */
const appAs = (name: string | null | undefined) => {
  const app = new Hono();
  app.use(async (c, next) => {
    if (name !== undefined)
      c.set("user" as never, (name === null ? null : { id: "u_1", name }) as never);
    await next();
  });
  app.get("/invoices/:id", GET as never);
  app.post("/invoices", POST as never);
  app.delete("/invoices/:id", DELETE as never);
  app.get("/broken", BROKEN as never);
  app.get("/sloppy", SLOPPY as never);
  return app;
};

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

test("success is 200, and keys the schema does not have are left out", async () => {
  const res = await appAs("Alice").request("/invoices/inv_1");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: "inv_1", amount: 100 });
});

test("a declared failure gets its status from its kind", async () => {
  const res = await appAs("Alice").request("/invoices/nope");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: { code: "NOT_FOUND", message: "Not found" } });
});

test("requireAuth answers 401 before the handler", async () => {
  const res = await appAs(null).request("/invoices/inv_1");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), {
    error: { code: "UNAUTHORIZED", message: "Authentication required" },
  });
});

test("requireAuth without Void's auth says how to turn it on, instead of a silent 401", async () => {
  const app = appAs(undefined);
  let thrown: unknown;
  app.onError((e, c) => {
    thrown = e;
    return c.text("boom", 500);
  });
  assert.equal((await app.request("/invoices/inv_1")).status, 500);
  assert.match(String(thrown), /auth is not on.*void\.config\.ts/);
  // allowAnonymous reads no user, so a public endpoint works without auth
  assert.equal((await app.request("/invoices", json({ amount: 5 }))).status, 200);
});

test("a guard the app writes can answer 403", async () => {
  assert.equal((await appAs("Alice").request("/invoices/inv_1", { method: "DELETE" })).status, 403);
  assert.equal((await appAs("Admin").request("/invoices/inv_1", { method: "DELETE" })).status, 200);
});

test("invalid input is 400 with every field's reasons", async () => {
  const res = await appAs(null).request("/invoices", json({ amount: -1 }));
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: { code: string; details: Record<string, string[]> } };
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.deepEqual(Object.keys(body.error.details), ["amount"]);
});

test("a body that is not JSON is 400 with no fields", async () => {
  const res = await appAs(null).request("/invoices", json("{"));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: { code: "VALIDATION_ERROR", message: "The request body must be JSON", details: {} },
  });
});

test("a failure with details is returned with them", async () => {
  const res = await appAs(null).request("/invoices", json({ amount: 5000 }));
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), {
    error: { code: "OVER_BUDGET", message: "Over the budget", details: { budget: 1000 } },
  });
});

test("a success that does not match its schema is a bug: 500", async () => {
  const app = appAs(null);
  app.onError((_e, c) => c.text("boom", 500));
  assert.equal((await app.request("/broken")).status, 500);
});

test("a guard that throws a failure it does not declare is a bug: 500, not a silent 403", async () => {
  const app = appAs(null);
  let thrown: unknown;
  app.onError((e, c) => {
    thrown = e;
    return c.text("boom", 500);
  });
  assert.equal((await app.request("/sloppy")).status, 500);
  assert.match(String(thrown), /threw FORBIDDEN, which it does not declare/);
});
