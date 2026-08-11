const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');

const ALLOWED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, env.uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Unsupported video format. Use mp4, mov, mkv, or webm.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB ceiling, adjust as needed
});

module.exports = upload;
