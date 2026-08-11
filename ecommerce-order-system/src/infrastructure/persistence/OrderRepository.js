import { join } from 'node:path';
import { JsonFileStore } from './JsonFileStore.js';
import { Order } from '../../domain/entities/Order.js';

export class OrderRepository {
  #store;

  constructor(dataDir) {
    this.#store = new JsonFileStore(join(dataDir, 'orders.json'));
  }

  async save(order) {
    await this.#store.mutate((orders) => {
      const index = orders.findIndex((o) => o.id === order.id);
      const plain = order.toJSON();
      if (index === -1) orders.push(plain);
      else orders[index] = plain;
      return orders;
    });
    return order;
  }

  async findById(id) {
    const orders = await this.#store.read();
    const found = orders.find((o) => o.id === id);
    return found ? Order.fromJSON(found) : null;
  }

  async findAll() {
    const orders = await this.#store.read();
    return orders.map(Order.fromJSON);
  }

  async update(id, patch) {
    let updated = null;
    await this.#store.mutate((orders) => {
      const index = orders.findIndex((o) => o.id === id);
      if (index !== -1) {
        orders[index] = { ...orders[index], ...patch };
        updated = orders[index];
      }
      return orders;
    });
    return updated ? Order.fromJSON(updated) : null;
  }
}
