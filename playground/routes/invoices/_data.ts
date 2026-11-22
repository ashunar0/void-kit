import { z } from "zod";

export const invoiceSchema = z.object({ id: z.string(), amount: z.number() });

/** Stand-in for void/db, so the playground needs no database */
export const findInvoice = (id: string) =>
  id === "inv_1" ? { id, amount: 100, internalNote: "not for clients" } : undefined;
