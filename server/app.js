// Express application (separate from index.js so tests can mount it without listening).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import routes from './routes.js';
import { ValidationError } from './service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', routes);
  app.use('/api', (req, res) => res.status(404).json({ error: `Unknown API endpoint ${req.method} ${req.originalUrl}` }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    if (err instanceof mongoose.Error.CastError) return res.status(400).json({ error: `Invalid value for ${err.path}.` });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
    console.error(err);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  });
  if (fs.existsSync(path.join(DIST, 'index.html'))) {
    app.use(express.static(DIST));
    app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
  } else {
    app.get('/', (req, res) => res.type('html').send(
      '<h2>Frontend not built yet</h2><p>Run <code>npm run build</code> then restart with <code>npm start</code>.</p>'));
  }
  return app;
}
