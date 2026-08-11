import { Order } from '../../domain/entities/Order.js';
import { JobType } from '../../domain/enums/JobType.js';
import { validateOrderRequest } from './validateOrderRequest.js';
import { logger, LogEvent } from '../../infrastructure/logger/logger.js';

const BACKGROUND_JOB_TYPES = [
  JobType.SEND_ORDER_EMAIL,
  JobType.GENERATE_INVOICE,
  JobType.REDUCE_INVENTORY,
  JobType.UPDATE_ANALYTICS,
  JobType.NOTIFY_WAREHOUSE,
];

export class CreateOrder {
  #orderRepository;
  #jobService;

  constructor(orderRepository, jobService) {
    this.#orderRepository = orderRepository;
    this.#jobService = jobService;
  }

  /**
   * The ENTIRE synchronous HTTP flow lives in this one method:
   *   validate -> create order -> create jobs -> queue jobs -> return
   * Nothing here awaits a job actually running - createJob() only
   * validates + persists + enqueues in memory, which is fast (no network
   * calls, no external services). Workers pick the jobs up independently.
   */
  async execute(requestBody) {
    const errors = validateOrderRequest(requestBody);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const total = Order.calculateTotal(requestBody.items);
    const order = new Order({
      customer: requestBody.customer,
      items: requestBody.items,
      total,
    });
    await this.#orderRepository.save(order);

    logger.info(LogEvent.ORDER_CREATED, { orderId: order.id, total: order.total });

    // Create + queue all background jobs. dedupeKey is orderId+type, so if
    // this exact order somehow triggers job creation twice (e.g. a client
    // retry after a slow response) we never get duplicate emails/invoices/etc.
    const jobs = await Promise.all(
      BACKGROUND_JOB_TYPES.map((type) =>
        this.#jobService.createJob({
          type,
          orderId: order.id,
          dedupeKey: `${order.id}:${type}`,
        })
      )
    );

    return { ok: true, order, jobs };
  }
}
