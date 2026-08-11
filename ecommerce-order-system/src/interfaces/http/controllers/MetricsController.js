export class MetricsController {
  #jobService;

  constructor(jobService) {
    this.#jobService = jobService;
  }

  getMetrics = async (req, res) => {
    res.json(await this.#jobService.getMetrics());
  };
}
