/** setTimeout that rejects early if the given AbortSignal fires (used for JOB_TIMEOUT handling). */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted before start'));

    const timer = setTimeout(resolve, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Job timed out'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
