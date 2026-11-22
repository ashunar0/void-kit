import { allowAnonymous, createEndpoint as endpoint } from "void-kit";
import { z } from "zod";

export type Invoice = { id: string };

export const GET = endpoint(
  { auth: allowAnonymous, responses: { success: z.object({ id: z.string() }) } },
  async (_c, _i, reply) => reply.success({ id: "a" }),
);
