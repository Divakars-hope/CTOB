import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb, seed } from './db.js';
import { createApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');
fs.mkdirSync(dataDir, { recursive: true });
const file = path.join(dataDir, 'ctob.sqlite');
if (process.argv.includes('--reset') && fs.existsSync(file)) for (const f of [file, file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });
const db = openDb(file);
if (!db.prepare("SELECT name FROM sqlite_master WHERE name='users'").get() || !db.prepare('SELECT 1 FROM users LIMIT 1').get()) seed(db);
const port = Number(process.env.PORT) || 3001;
createApp(db, { clientDir: path.resolve(here, '../../client/dist') }).listen(port, '0.0.0.0', () => console.log(`CTOB running on http://localhost:${port}`));
