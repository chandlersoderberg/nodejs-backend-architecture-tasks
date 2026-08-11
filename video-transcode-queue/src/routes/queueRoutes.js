const express = require('express');
const queueController = require('../controllers/queueController');

const router = express.Router();

router.get('/workers', queueController.getWorkerHealth);
router.get('/metrics', queueController.getMetrics);

module.exports = router;
