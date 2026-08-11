import { writeFile, mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JobType } from '../../../domain/enums/JobType.js';
import { sleep } from './sleep.js';

/**
 * Each handler receives (job, signal, config) and must respect `signal`
 * for abort/timeout support. These are deliberately simple simulations
 * (a real system would call an email provider, a PDF service, etc.) -
 * the interesting part of this project is the QUEUE, not the handlers.
 */
export function createJobHandlers(config) {
  return {
    [JobType.SEND_ORDER_EMAIL]: async (job, signal) => {
      await sleep(200, signal);
      // In a real system: call an email provider API here.
      return { sent: true, to: job.orderId };
    },

    [JobType.GENERATE_INVOICE]: async (job, signal) => {
      await sleep(300, signal);
      const invoicesDir = join(config.dataDir, 'invoices');
      await mkdir(invoicesDir, { recursive: true });
      const invoicePath = join(invoicesDir, `${job.orderId}.json`);
      await writeFile(
        invoicePath,
        JSON.stringify({ orderId: job.orderId, generatedAt: new Date().toISOString() }, null, 2)
      );
      return { invoicePath };
    },

    [JobType.REDUCE_INVENTORY]: async (job, signal) => {
      await sleep(150, signal);
      // In a real system: decrement stock counts in the inventory DB here.
      return { inventoryUpdated: true };
    },

    [JobType.UPDATE_ANALYTICS]: async (job, signal) => {
      await sleep(100, signal);
      const analyticsPath = join(config.dataDir, 'analytics.log');
      await appendFile(
        analyticsPath,
        JSON.stringify({ orderId: job.orderId, at: new Date().toISOString() }) + '\n'
      );
      return { tracked: true };
    },

    [JobType.NOTIFY_WAREHOUSE]: async (job, signal) => {
      await sleep(150, signal);
      // In a real system: publish a message / call the warehouse system API.
      return { notified: true };
    },
  };
}
