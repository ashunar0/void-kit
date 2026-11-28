import { logger } from "void/log";

/** What one sweep did. A Result with ok: false (refused by a rule, put back) is refused; a throw is failed */
export type SweepResult<T> = {
  name: string;
  picked: number;
  done: number;
  refused: number;
  failed: Array<{ item: T | undefined; error: string }>;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * For a cron: runs `run` on each thing `pick` returns, one at a time. A throw does not stop the rest
 * (stopping would stop on the same thing every run); it is collected and returned. A throw from `pick`
 * is returned with nothing run. Pass the results to `finishSweeps` at the end of the cron
 */
export const sweep = async <T>(
  name: string,
  pick: () => Promise<ReadonlyArray<T>>,
  run: (item: T) => Promise<{ ok: boolean }>,
): Promise<SweepResult<T>> => {
  let items: ReadonlyArray<T>;
  try {
    items = await pick();
  } catch (error) {
    return {
      name,
      picked: 0,
      done: 0,
      refused: 0,
      failed: [{ item: undefined, error: messageOf(error) }],
    };
  }
  const result: SweepResult<T> = { name, picked: items.length, done: 0, refused: 0, failed: [] };
  for (const item of items) {
    try {
      // One at a time: two of them do not write to the same rows at once
      const outcome = await run(item);
      if (outcome.ok) {
        result.done += 1;
      } else {
        result.refused += 1;
      }
    } catch (error) {
      result.failed.push({ item, error: messageOf(error) });
    }
  }
  return result;
};

/**
 * Logs what every sweep did, then throws when any failed, so Void reports the cron as failed.
 * Call it last, after every sweep has run
 */
export const finishSweeps = (name: string, results: ReadonlyArray<SweepResult<unknown>>) => {
  const summary = results.map(({ failed, ...counts }) => ({ ...counts, failed: failed.length }));
  logger.info(`${name} finished`, { summary });
  const failures = results.flatMap((result) =>
    result.failed.map((failure) => ({ sweep: result.name, ...failure })),
  );
  if (failures.length > 0) {
    logger.error(`${name} failed for some`, { failures });
    throw new Error(`${name}: ${failures.length} failed`);
  }
};
