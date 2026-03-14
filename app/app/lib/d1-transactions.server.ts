export async function runInTransaction<T>(
  _db: { prepare: (sql: string) => { run: () => Promise<unknown> } },
  operation: () => Promise<T>
): Promise<T> {
  void operation;
  throw new Error(
    "runInTransaction is unsupported with Cloudflare D1. Use db.batch() or another D1-safe pattern instead."
  );
}
