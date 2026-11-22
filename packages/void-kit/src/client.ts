/**
 * The client side: Void's typed fetch, with the endpoint's failures typed too.
 * ```ts
 * const result = await fetchResult("/invoices/[id]/send", { method: "POST", params: { id } });
 * if (!result.ok) {
 *   if (result.error.code === "INVOICE_ALREADY_SENT") ...
 *   return;
 * }
 * result.value; // the success body, as Void's fetch types it
 * ```
 * A failure the endpoint answers (`{ error: { code, message, details? } }`) comes back as `err(error)`.
 * Anything else (a 500, the network) is thrown, as Void's fetch throws it
 */
import { fetch } from "void/client";
import type { RouteMap } from "void/routes";
import { err, ok, type Result } from "./result.ts";

/**
 * The failures of each endpoint, by URL pattern and method. Written by `void-kit prepare`
 * (src/void-kit.gen.d.ts) from each endpoint's `__failures`; never edit it by hand
 */
export interface FailureMap {}

/** The failures carried by an endpoint (createEndpoint's `__failures`). Used by the generated FailureMap */
export type FailuresOf<H> = H extends { readonly __failures: infer F } ? F : never;

type Path = keyof RouteMap & string;
type MethodsOf<P extends Path> = keyof RouteMap[P] & string;
type DefaultMethod<P extends Path> = "GET" extends MethodsOf<P> ? "GET" : never;

type ErrorOf<B> = B extends { error: infer E } ? E : never;

/** What `result.error` is for that endpoint: `{ code, message, details? }`, one shape per code */
export type FailureOf<P extends string, M extends string> = P extends keyof FailureMap
  ? M extends keyof FailureMap[P]
    ? ErrorOf<FailureMap[P][M]>
    : never
  : never;

type Options<P extends Path, M extends MethodsOf<P>> = Parameters<typeof fetch<P, M>>[1];
type Output<P extends Path, M extends MethodsOf<P>> = Awaited<ReturnType<typeof fetch<P, M>>>;

type InputOf<P extends Path, M extends MethodsOf<P>> = RouteMap[P][M] extends { input: infer I }
  ? I
  : {};
type NeedsInput<P extends Path, M extends MethodsOf<P>> = keyof InputOf<P, M> extends never
  ? false
  : true;

export function fetchResult<P extends Path>(
  path: NeedsInput<P, DefaultMethod<P>> extends false ? P : never,
): Promise<Result<Output<P, DefaultMethod<P>>, FailureOf<P, DefaultMethod<P>>>>;
export function fetchResult<P extends Path, M extends MethodsOf<P> = DefaultMethod<P>>(
  path: P,
  // `method?: M` on its own, so M is inferred from what is passed
  options: { method?: M } & Options<P, M>,
): Promise<Result<Output<P, M>, FailureOf<P, M>>>;
export async function fetchResult(path: string, options?: unknown) {
  try {
    return ok(await (fetch as (path: string, options?: unknown) => Promise<unknown>)(path, options));
  } catch (error) {
    const failure = failureIn(error);
    if (failure === undefined) throw error;
    return err(failure);
  }
}

/** The `{ code, message }` of a void-kit failure body, or undefined for any other error */
const failureIn = (error: unknown) => {
  const failure = (error as { data?: { error?: unknown } } | null)?.data?.error;
  if (typeof failure !== "object" || failure === null) return undefined;
  const { code, message } = failure as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string" ? failure : undefined;
};
