const express = require('express');
const videoRoutes = require('./videoRoutes');
const queueRoutes = require('./queueRoutes');

const router = express.Router();

router.use('/videos', videoRoutes);
router.use('/', queueRoutes); // exposes /api/workers and /api/metrics

module.exports = router;
