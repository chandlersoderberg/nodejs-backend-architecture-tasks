import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { OrderStatus } from '../../domain/enums/OrderStatus.js';
import { logger, LogEvent } from '../logger/logger.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CART_MAX_AGE_MS = 24 * 60 * 60 * 1000; // carts older than 1 day are considered abandoned/expired

/**
 * A cron-like "run this every midnight" scheduler built with nothing but
 * setTimeout. The trick that avoids busy-polling: instead of checking
 * "is it midnight yet?" every N seconds, we calculate exactly how many ms
 * away the next midnight is and schedule ONE timer for that. When it
 * fires, we do the work, then immediately calculate the next midnight
 * (24h later) and schedule the next timer. Self-perpetuating, and idle
 * (zero CPU) between runs.
 */
export class Scheduler {
  #orderRepository;
  #cartRepository;
  #config;
  #timer = null;

  constructor(orderRepository, cartRepository, config) {
    this.#orderRepository = orderRepository;
    this.#cartRepository = cartRepository;
    this.#config = config;
  }

  static msUntilNextMidnight(now = new Date()) {
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0); // rolls over to tomorrow 00:00:00.000
    return nextMidnight.getTime() - now.getTime();
  }

  start() {
    this.#scheduleNext();
  }

  #scheduleNext() {
    const delay = Scheduler.msUntilNextMidnight();
    this.#timer = setTimeout(() => {
      this.runDailyTasks().finally(() => this.#scheduleNext());
    }, delay);
    // Don't let this timer keep the process alive by itself.
    this.#timer.unref?.();
  }

  stop() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  /** The actual daily work. Public + separately callable so it's testable without waiting for real midnight. */
  async runDailyTasks() {
    const archived = await this.#archiveCompletedOrders();
    const report = await this.#generateDailySalesReport();
    const expiredCarts = await this.#cartRepository.removeExpired(CART_MAX_AGE_MS);

    logger.info(LogEvent.SCHEDULER_TASK_RUN, {
      archivedOrders: archived,
      salesReportFile: report.filePath,
      totalOrdersInReport: report.orderCount,
      expiredCartsRemoved: expiredCarts,
    });

    return { archived, report, expiredCarts };
  }

  async #archiveCompletedOrders() {
    const orders = await this.#orderRepository.findAll();
    let count = 0;
    for (const order of orders) {
      if (order.status === OrderStatus.CREATED) {
        await this.#orderRepository.update(order.id, { status: OrderStatus.ARCHIVED });
        count++;
      }
    }
    return count;
  }

  async #generateDailySalesReport() {
    const orders = await this.#orderRepository.findAll();
    const dateStr = new Date().toISOString().slice(0, 10);
    const reportsDir = join(this.#config.dataDir, 'reports');
    await mkdir(reportsDir, { recursive: true });

    const filePath = join(reportsDir, `sales-report-${dateStr}.json`);
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);

    await writeFile(
      filePath,
      JSON.stringify({ date: dateStr, orderCount: orders.length, totalRevenue }, null, 2)
    );

    return { filePath, orderCount: orders.length, totalRevenue };
  }
}
