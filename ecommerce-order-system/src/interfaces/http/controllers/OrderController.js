export class OrderController {
  #createOrder;
  #orderRepository;

  constructor(createOrder, orderRepository) {
    this.#createOrder = createOrder;
    this.#orderRepository = orderRepository;
  }

  create = async (req, res) => {
    const result = await this.#createOrder.execute(req.body);

    if (!result.ok) {
      return res.status(400).json({ error: 'Validation failed', details: result.errors });
    }

    res.status(201).json({
      order: result.order,
      jobs: result.jobs.map((j) => ({ id: j.id, type: j.type, status: j.status })),
    });
  };

  getById = async (req, res) => {
    const order = await this.#orderRepository.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  };
}
