export class WorkerController {
  #workerManager;

  constructor(workerManager) {
    this.#workerManager = workerManager;
  }

  getStatus = async (req, res) => {
    res.json(this.#workerManager.getStatus());
  };
}
