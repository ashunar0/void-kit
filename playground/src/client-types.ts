// Not run: tsc checks that the client sees what the endpoints declared
import { fetch } from "void/client";
import { fetchResult, type SuccessOf } from "void-kit/client";

export const read = async () => {
  const invoice = await fetch("/invoices/[id]", { params: { id: "inv_1" } });
  const amount: number = invoice.amount;
  // @ts-expect-error the success schema has no internalNote
  void invoice.internalNote;

  await fetch("/invoices", { method: "POST", body: { amount: 1 } });
  // @ts-expect-error amount must be a number
  await fetch("/invoices", { method: "POST", body: { amount: "1" } });
  return amount;
};

export const readResult = async () => {
  const result = await fetchResult("/invoices/[id]", { params: { id: "inv_1" } });
  if (!result.ok) {
    // the failures of GET /invoices/[id]: its own, its guard's, and validation of params
    const code: "NOT_FOUND" | "UNAUTHORIZED" | "VALIDATION_ERROR" = result.error.code;
    // @ts-expect-error not a failure of this endpoint
    const other: typeof result.error.code = "FORBIDDEN";
    if (result.error.code === "VALIDATION_ERROR") {
      const fields: Record<string, string[]> = result.error.details;
      void fields;
    }
    return [code, other];
  }
  const amount: number = result.value.amount;

  // the method picks the endpoint: POST /invoices is public and reads a body
  const created = await fetchResult("/invoices", { method: "POST", body: { amount: 1 } });
  if (!created.ok) {
    const code: "VALIDATION_ERROR" = created.error.code;
    return [code];
  }
  // @ts-expect-error amount must be a number
  await fetchResult("/invoices", { method: "POST", body: { amount: "1" } });
  // @ts-expect-error GET /invoices/[id] needs params
  await fetchResult("/invoices/[id]");

  const me = await fetchResult("/me");
  if (!me.ok) {
    const code: "UNAUTHORIZED" = me.error.code;
    return [code];
  }
  return [amount, created.value.id, me.value.email];
};

// the success body has a name for the client (useState, props)
type Invoice = SuccessOf<"/invoices/[id]">;
type Created = SuccessOf<"/invoices", "POST">;
export const names = (invoice: Invoice, created: Created) => invoice.amount + created.amount;
// @ts-expect-error the success schema has no internalNote
export const noNote = (invoice: Invoice) => invoice.internalNote;
