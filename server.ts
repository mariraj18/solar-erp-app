import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { initDatabase } from './src/server/db';
import { apiRouter } from './src/server/routes';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  // Initialize SQLite persistent database schema and initial administrator
  initDatabase();

  app.use(express.json());

  // Mount API router
  app.use('/api', apiRouter);

  if (!isProd && !hasDist) {
    // Development mode: Mount Vite dev server middlewares
    console.log('[ERP Server] Running in Vite JIT development mode');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true as const },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production / Optimized mode: Serve pre-built static files from dist
    console.log('[ERP Server] Serving optimized production bundle from dist/');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`[ERP Server] Labour Attendance & Weekly Payment ERP running at http://localhost:${PORT}`);
  });
}

process.on('uncaughtException', (err) => {
  console.error('[ERP Server] Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[ERP Server] Unhandled Rejection:', err);
});

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
