/**
 * Expected failures are returned as values; unexpected ones (the DB is down) are thrown.
 * Narrow on `ok` before reading `value`, so a failure cannot be skipped.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T) => ({ ok: true, value }) as const;

export const err = <E>(error: E) => ({ ok: false, error }) as const;
