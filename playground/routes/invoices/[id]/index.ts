import { createEndpoint, NotFound, requireAuth } from "void-kit";
import { z } from "zod";
import { findInvoice, invoiceSchema } from "../_data.ts";

export const GET = createEndpoint(
  {
    auth: requireAuth,
    request: { params: z.object({ id: z.string() }) },
    responses: { success: invoiceSchema, failures: [NotFound] },
  },
  async (_c, { params }, reply) => {
    const invoice = findInvoice(params.id);
    if (invoice === undefined) return reply.failure(NotFound.code);
    return reply.success(invoice);
  },
);
