import { join } from 'node:path';
import { JsonFileStore } from './JsonFileStore.js';

/**
 * Minimal cart store, added only so the scheduler's "remove expired carts"
 * task has a real thing to do. This system's core domain is Orders, not
 * Carts, so this is intentionally tiny - no API surface, just enough to
 * demonstrate the scheduled cleanup.
 */
export class CartRepository {
  #store;

  constructor(dataDir) {
    this.#store = new JsonFileStore(join(dataDir, 'carts.json'));
  }

  async add(cart) {
    await this.#store.mutate((carts) => {
      carts.push(cart);
      return carts;
    });
  }

  async findAll() {
    return this.#store.read();
  }

  async removeExpired(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    let removedCount = 0;
    await this.#store.mutate((carts) => {
      const kept = carts.filter((c) => new Date(c.createdAt).getTime() >= cutoff);
      removedCount = carts.length - kept.length;
      return kept;
    });
    return removedCount;
  }
}
