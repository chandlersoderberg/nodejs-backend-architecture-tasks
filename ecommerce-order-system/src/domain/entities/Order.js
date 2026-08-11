import { randomUUID } from 'node:crypto';
import { OrderStatus } from '../enums/OrderStatus.js';

export class Order {
  constructor({ id, customer, items, total, status = OrderStatus.CREATED, createdAt }) {
    this.id = id || randomUUID();
    this.customer = customer;
    this.items = items;
    this.total = total;
    this.status = status;
    this.createdAt = createdAt || new Date().toISOString();
  }

  static calculateTotal(items) {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(data) {
    return new Order(data);
  }
}
