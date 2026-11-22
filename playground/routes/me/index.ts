import { createEndpoint, requireAuth } from "void-kit";
import { z } from "zod";

export const GET = createEndpoint(
  {
    auth: requireAuth,
    responses: { success: z.object({ id: z.string(), email: z.string() }) },
  },
  async (c, _input, reply) =>
    reply.success({ id: c.var.currentUser.id, email: c.var.currentUser.email }),
);
