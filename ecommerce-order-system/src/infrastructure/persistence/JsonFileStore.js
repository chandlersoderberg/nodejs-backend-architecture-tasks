import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Generic JSON-array file store.
 *
 * Two safety problems come up with "just fs.writeFile the JSON":
 *  1. Two writes racing each other can interleave and corrupt the file.
 *     Fix: every write goes through a single promise chain (`#writeLock`)
 *     so writes to the SAME file happen strictly one after another.
 *  2. A crash mid-write can leave a half-written / truncated file.
 *     Fix: write to a temp file then rename() it over the real file.
 *     rename() is atomic on the same filesystem, so readers only ever
 *     see the old file or the fully-written new file, never a partial one.
 *
 * This is the ONLY class that touches fs for data files - repositories
 * build on top of it instead of calling fs directly, so persistence
 * logic stays in one place and could be swapped for a real database
 * later without touching business logic.
 */
export class JsonFileStore {
  #filePath;
  #writeLock = Promise.resolve();

  constructor(filePath) {
    this.#filePath = filePath;
  }

  async #ensureFile() {
    await mkdir(dirname(this.#filePath), { recursive: true });
    try {
      await readFile(this.#filePath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        await writeFile(this.#filePath, '[]', 'utf-8');
      } else {
        throw err;
      }
    }
  }

  async read() {
    await this.#ensureFile();
    const raw = await readFile(this.#filePath, 'utf-8');
    try {
      return JSON.parse(raw);
    } catch {
      // Corrupt file (e.g. process killed mid-write, before the atomic
      // rename fix would have applied). Fail safe with an empty list
      // rather than crashing the whole app on startup.
      return [];
    }
  }

  async #writeInternal(data) {
    const tmpPath = `${this.#filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await rename(tmpPath, this.#filePath);
  }

  write(data) {
    this.#writeLock = this.#writeLock.then(() => this.#writeInternal(data));
    return this.#writeLock;
  }

  /**
   * Atomic read-modify-write. `mutator` receives the current array and
   * must return the new array. Queued on the same write lock so it can't
   * race with a plain write() or another mutate() call.
   */
  mutate(mutator) {
    this.#writeLock = this.#writeLock.then(async () => {
      const current = await this.read();
      const next = mutator(current);
      await this.#writeInternal(next);
      return next;
    });
    return this.#writeLock;
  }
}
