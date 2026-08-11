const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const env = require('./config/env');
const { errorHandler, notFoundHandler } = require('./middlewares/errorMiddleware');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.status(200).json({ success: true, message: 'OK' }));

app.use('/api', routes);

// Serves generated HLS output directly: /stream/<videoId>/index.m3u8,
// /stream/<videoId>/720p/playlist.m3u8, segment .ts files, etc.
app.use('/stream', express.static(env.hlsOutputDir));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
