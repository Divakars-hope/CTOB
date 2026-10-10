import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb, seed } from './db.js';
import { createApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(here, '../data');
fs.mkdirSync(dataDir, { recursive: true });
const file = path.join(dataDir, 'ctob.sqlite');
if (process.argv.includes('--reset')) for (const f of [file, file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });

const db = openDb(file); // opened exactly once for the life of the process
if (!db.prepare("SELECT name FROM sqlite_master WHERE name='users'").get() || !db.prepare('SELECT 1 FROM users LIMIT 1').get()) seed(db);

const port = Number(process.env.PORT) || 3001;
const server = createApp(db, { clientDir: path.resolve(here, '../../client/dist') }).listen(port, '0.0.0.0', () => console.log(`CTOB running on http://localhost:${port}`));

// Stop accepting requests, then close SQLite *before* the process exits so no prepared statement
// is destroyed during Node's environment teardown (the native abort seen on Render).
let closing = false;
function shutdown(signal) {
  if (closing) return; closing = true;
  console.log(`${signal} received, shutting down`);
  const done = () => { try { db.close(); } catch (e) { console.error('db close failed', e.message); } process.exit(0); };
  server.close(done); server.closeAllConnections?.();
  setTimeout(done, 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
process.on('uncaughtException', (e) => { console.error('uncaughtException', e); shutdown('uncaughtException'); });
