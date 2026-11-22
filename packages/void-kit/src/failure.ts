import type { AnySchema, StandardIssue } from "./standard-schema.ts";
import { pathOf } from "./standard-schema.ts";

/** Failure kinds. FAILURE_STATUS alone maps them to HTTP statuses */
export type FailureKind =
  | "unauthenticated"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "unprocessable"
  | "upstream";

/**
 * Maps failure kinds to HTTP statuses. Only this one place holds it (same idea as Go's errors.go or gRPC status codes).
 * Add a kind only when a failure appears that none of the existing ones can express
 */
export const FAILURE_STATUS = {
  unauthenticated: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  unprocessable: 422,
  upstream: 502,
} as const satisfies Record<FailureKind, number>;

/**
 * An expected failure: a code, a kind and a default message. It knows no HTTP status, so code that is
 * not HTTP (crons, queues, the app's own rules) may import it too.
 * `export const NotDraft = { code: "NOT_DRAFT", kind: "conflict", message: "…" } as const;`
 * When the client needs the numbers behind it, add `details: z.object({ ... })`: that failure is then
 * always returned with them (`reply.failure({ code, details })`)
 */
export type Failure<K extends string = string, Kind extends FailureKind = FailureKind> = {
  readonly code: K;
  readonly kind: Kind;
  readonly message: string;
  readonly details?: AnySchema;
};

export const Unauthorized = {
  code: "UNAUTHORIZED",
  kind: "unauthenticated",
  message: "Authentication required",
} as const;

export const Forbidden = {
  code: "FORBIDDEN",
  kind: "forbidden",
  message: "This operation is not allowed",
} as const;

export const NotFound = {
  code: "NOT_FOUND",
  kind: "notFound",
  message: "Not found",
} as const;

/** The failure response body: `{ error: { code, message, details? } }` */
export const errorBody = (code: string, message: string, details?: unknown) => ({
  error: details === undefined ? { code, message } : { code, message, details },
});

/** A failure void-kit raises itself and answers with errorBody. Thrown by fail() and input validation */
export class VoidKitError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toResponse() {
    return Response.json(errorBody(this.code, this.message, this.details), {
      status: this.status,
    });
  }
}

/**
 * Raises a failure outside a handler's reply, e.g. in a guard: `throw fail(Unauthorized)`.
 * A failure that declares details is returned with them through reply.failure, never thrown
 */
export const fail = (
  failure: Failure & { readonly details?: undefined },
  message = failure.message,
) => new VoidKitError(failure.code, FAILURE_STATUS[failure.kind], message);

/** What was wrong with each field, by its name: `{ amount: ["Too small"], "items.0.name": ["Required"] }` */
export type FieldErrors = Record<string, string[]>;

/** The code answered (400) when input validation fails, before the handler runs */
export const VALIDATION_ERROR = "VALIDATION_ERROR";

/**
 * The 400 for these problems: every field's reasons in details, by field name (as in Laravel or Rails).
 * A problem with the input as a whole (not JSON, not an object) is the message, with `details: {}`
 */
export const invalid = (issues: readonly StandardIssue[]) => {
  const fields: FieldErrors = {};
  let whole: string | undefined;
  for (const { message, path } of issues) {
    const field = pathOf(path);
    if (field === "") whole ??= message;
    else (fields[field] ??= []).push(message);
  }
  return new VoidKitError(VALIDATION_ERROR, 400, whole ?? "Invalid request", fields);
};
