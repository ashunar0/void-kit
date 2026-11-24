import { HTTPException } from "hono/http-exception";

/** The kinds of expected failure. The status comes from the kind, never written by hand */
const statusOf = {
  notFound: 404,
  forbidden: 403,
  conflict: 409,
  unprocessable: 422,
} as const;

/** An expected failure. Declare each one in its domain's rules.ts with `as const` */
export type Failure = {
  readonly code: string;
  readonly kind: keyof typeof statusOf;
  readonly message: string;
};

/** Turns a failure into the exception Void shows in `form.error` (or `action()`'s error) */
export const toHttp = (failure: Failure) =>
  new HTTPException(statusOf[failure.kind], { message: failure.message });
