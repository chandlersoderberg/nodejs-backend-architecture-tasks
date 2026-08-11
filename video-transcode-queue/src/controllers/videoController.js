const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const videoService = require('../services/videoService');

const uploadVideo = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'No video file was uploaded (field name: "video").');
  const video = videoService.registerUploadedVideo(req.file);
  res.status(201).json({ success: true, data: video });
});

const getVideoStatus = asyncHandler(async (req, res) => {
  const video = videoService.getVideoWithStatus(req.params.id);
  res.status(200).json({ success: true, data: video });
});

const listVideos = asyncHandler(async (req, res) => {
  const videos = videoService.listVideos();
  res.status(200).json({ success: true, data: videos });
});

module.exports = { uploadVideo, getVideoStatus, listVideos };
