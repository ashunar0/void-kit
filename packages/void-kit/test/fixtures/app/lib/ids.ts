// expect: void-kit/no-id-cast | UserId is applied with as
import type { UserId } from "void-kit";

// the file that declares OrderId may brand it
export type OrderId = string & { readonly __brand: "OrderId" };
export const orderId = (value: string) => value as OrderId;

// anywhere else calls the maker (userId(value) from void-kit)
export const fromRow = (row: { userId: string }) => row.userId as UserId;
