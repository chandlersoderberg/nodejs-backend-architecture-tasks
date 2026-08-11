export class JobController {
  #jobService;

  constructor(jobService) {
    this.#jobService = jobService;
  }

  getById = async (req, res) => {
    const job = await this.#jobService.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  };

  cancel = async (req, res) => {
    const result = await this.#jobService.cancelJob(req.params.id);
    if (!result.ok && result.reason === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (!result.ok) {
      return res.status(409).json({ error: 'Job is not cancellable', status: result.job.status });
    }
    res.json(result.job);
  };

  retry = async (req, res) => {
    const result = await this.#jobService.retryFailedJob(req.params.id);
    if (!result.ok) {
      return res.status(404).json({ error: 'Failed job not found' });
    }
    res.json(result.job);
  };
}
