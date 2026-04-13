import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { env } from './config/env.js';
import adminRoutes from './routes/adminRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import authRoutes from './routes/authRoutes.js';
import practiceRoutes from './routes/practiceRoutes.js';
import userRoutes from './routes/userRoutes.js';

export const app = express();

const privateNetworkHostPattern =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

const renderHostPattern = /\.onrender\.com$/i;

const configuredOrigins = [env.appUrl].map((item) => item.trim()).filter(Boolean);

const isAllowedOrigin = (origin?: string) => {
  if (!origin) {
    return true;
  }

  if (configuredOrigins.includes(origin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    return privateNetworkHostPattern.test(parsed.hostname) || renderHostPattern.test(parsed.hostname);
  } catch {
    return false;
  }
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDistPath = path.resolve(currentDir, '..', '..', 'frontend', 'dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin ?? undefined)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by SpeakAI CORS.'));
    },
    credentials: true
  })
);
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'SpeakAI API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath));

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }

    res.sendFile(frontendIndexPath);
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({
    message: error instanceof Error ? error.message : 'Da xay ra loi tren server.'
  });
});
