export const DEFAULT_TEST_TIMEOUT_SECONDS = 300;

export class TestDeadlineExceeded extends Error {
  constructor(seconds: number) {
    super(`test exceeded its ${seconds}s deadline`);
  }
}

export async function withTestDeadline<T>(run: Promise<T>, seconds = DEFAULT_TEST_TIMEOUT_SECONDS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TestDeadlineExceeded(seconds)), seconds * 1000);
  });
  try {
    return await Promise.race([run, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Fallback for a CDP script used directly. Run it under safe-smoke to bound and clean up Chrome too. */
export function limitStandaloneBrowserTest(name: string): void {
  setTimeout(() => {
    console.error(`${name}: ${new TestDeadlineExceeded(DEFAULT_TEST_TIMEOUT_SECONDS).message}`);
    process.exit(124);
  }, DEFAULT_TEST_TIMEOUT_SECONDS * 1000).unref();
}
