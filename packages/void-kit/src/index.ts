/**
 * Entry point of void-kit. The contents live in one file per role.
 * - endpoint.ts: endpoint declarations and how they answer (createEndpoint, reply)
 * - auth.ts: who may call (createGuard, requireAuth, allowAnonymous) and who is signed in (CurrentUser, UserId)
 * - failure.ts: expected failures and their statuses (Failure, fail, NotFound, ...)
 * - result.ts: expected failures as values (Result, ok, err)
 */
export {
  createEndpoint,
  type EndpointConfig,
  type EndpointContext,
  type EndpointInput,
  type Replied,
  type Reply,
} from "./endpoint.ts";
export {
  allowAnonymous,
  createGuard,
  getCurrentUser,
  requireAuth,
  userId,
  type CurrentUser,
  type Guard,
  type UserId,
} from "./auth.ts";
export {
  fail,
  Forbidden,
  NotFound,
  Unauthorized,
  VALIDATION_ERROR,
  type Failure,
  type FailureKind,
  type FieldErrors,
} from "./failure.ts";
export { err, ok, type Result } from "./result.ts";
