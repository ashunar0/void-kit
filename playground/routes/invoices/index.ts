import { allowAnonymous, createEndpoint } from "void-kit";
import { z } from "zod";
import { invoiceSchema } from "./_data.ts";

export const POST = createEndpoint(
  {
    auth: allowAnonymous,
    request: { body: z.object({ amount: z.number().positive() }) },
    responses: { success: invoiceSchema },
  },
  async (_c, { body }, reply) => reply.success({ id: "inv_2", amount: body.amount }),
);
