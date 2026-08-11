import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Scheduler } from '../src/infrastructure/scheduler/Scheduler.js';
import { OrderRepository } from '../src/infrastructure/persistence/OrderRepository.js';
import { CartRepository } from '../src/infrastructure/persistence/CartRepository.js';
import { Order } from '../src/domain/entities/Order.js';
import { OrderStatus } from '../src/domain/enums/OrderStatus.js';

describe('Scheduler', () => {
  let dataDir, orderRepo, cartRepo, scheduler;

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'scheduler-test-'));
    orderRepo = new OrderRepository(dataDir);
    cartRepo = new CartRepository(dataDir);
    scheduler = new Scheduler(orderRepo, cartRepo, { dataDir });
  });

  after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  test('msUntilNextMidnight always returns a value between 0 and 24h', () => {
    const ms = Scheduler.msUntilNextMidnight();
    assert.ok(ms > 0 && ms <= 24 * 60 * 60 * 1000);
  });

  test('runDailyTasks archives orders, writes a sales report, and removes expired carts', async () => {
    const order = new Order({
      customer: { name: 'Test' },
      items: [{ productId: 'p1', quantity: 2, price: 100 }],
      total: 200,
    });
    await orderRepo.save(order);

    await cartRepo.add({
      id: 'expired-cart',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      items: [],
    });
    await cartRepo.add({ id: 'fresh-cart', createdAt: new Date().toISOString(), items: [] });

    const result = await scheduler.runDailyTasks();

    assert.equal(result.archived, 1);
    assert.equal(result.expiredCarts, 1);

    const archivedOrder = await orderRepo.findById(order.id);
    assert.equal(archivedOrder.status, OrderStatus.ARCHIVED);

    const remainingCarts = await cartRepo.findAll();
    assert.equal(remainingCarts.length, 1);
    assert.equal(remainingCarts[0].id, 'fresh-cart');

    const reportContent = JSON.parse(await readFile(result.report.filePath, 'utf-8'));
    assert.equal(reportContent.orderCount, 1);
    assert.equal(reportContent.totalRevenue, 200);
  });
});
