import { createEndpoint, requireAuth } from "void-kit";
import { z } from "zod";

export const DELETE = createEndpoint(
  { auth: requireAuth, responses: { success: z.object({ ok: z.literal(true) }) } },
  async (_c, _i, reply) => reply.success({ ok: true }),
);
