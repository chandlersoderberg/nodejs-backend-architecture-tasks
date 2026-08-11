const express = require('express');
const upload = require('../middlewares/uploadMiddleware');
const videoController = require('../controllers/videoController');
const streamController = require('../controllers/streamController');

const router = express.Router();

router.post('/', upload.single('video'), videoController.uploadVideo);
router.get('/', videoController.listVideos);
router.get('/:id', videoController.getVideoStatus);
router.get('/:id/stream-info', streamController.getStreamInfo);

module.exports = router;
