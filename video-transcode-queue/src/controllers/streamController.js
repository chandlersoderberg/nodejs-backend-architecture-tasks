const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const videoRepository = require('../repositories/videoRepository');

/**
 * The actual .m3u8/.ts files are served as static files (see app.js,
 * mounted at /stream). This endpoint just tells the client the URL to
 * play once the video is ready — nicer for a frontend player than
 * hardcoding the static path convention.
 */
const getStreamInfo = asyncHandler(async (req, res) => {
  const video = videoRepository.findById(req.params.id);
  if (!video) throw new ApiError(404, 'Video not found.');

  if (video.status !== 'COMPLETED' || !video.hls_master_path) {
    throw new ApiError(409, `Video is not ready to stream yet (status: ${video.status}).`);
  }

  res.status(200).json({
    success: true,
    data: {
      videoId: video.id,
      playbackUrl: `/stream/${video.hls_master_path.replace(/\\/g, '/')}`,
    },
  });
});

module.exports = { getStreamInfo };
