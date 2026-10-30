// MongoDB connection.
// 1. MONGO_URI if set (local MongoDB, Docker or Atlas).
// 2. Otherwise try a local MongoDB at mongodb://127.0.0.1:27017.
// 3. If none is running, start an embedded MongoDB (mongodb-memory-server) that stores
//    its data on disk in ./data/db, so records persist between runs with zero setup.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_NAME = process.env.DB_NAME || 'smart_healthcare_spms';
let embedded = null;
let persistent = false;

async function tryConnect(uri, timeoutMS) {
  await mongoose.connect(uri, { dbName: DB_NAME, serverSelectionTimeoutMS: timeoutMS });
  return uri;
}

export async function connectDB({ quiet = false, ephemeral = false } = {}) {
  const log = (...a) => !quiet && console.log(...a);
  mongoose.set('strictQuery', true);
  if (process.env.MONGO_URI) {
    await tryConnect(process.env.MONGO_URI, 10000);
    log(`MongoDB connected: ${process.env.MONGO_URI} (db: ${DB_NAME})`);
    return { mode: 'uri', uri: process.env.MONGO_URI };
  }
  const local = 'mongodb://127.0.0.1:27017';
  try {
    await tryConnect(local, 2500);
    log(`MongoDB connected: ${local} (db: ${DB_NAME})`);
    return { mode: 'local', uri: local };
  } catch {
    await mongoose.disconnect().catch(() => {});
  }
  log('No MongoDB server found on 127.0.0.1:27017 - starting embedded MongoDB (first run downloads it once)...');
  const { MongoMemoryServer } = await import('mongodb-memory-server-core');
  if (ephemeral) {
    embedded = await MongoMemoryServer.create({ instance: { dbName: DB_NAME } }); // tests: throw-away instance
  } else {
    const dbPath = path.join(ROOT, 'data', 'db');
    fs.mkdirSync(dbPath, { recursive: true });
    embedded = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger', dbName: DB_NAME } });
    persistent = true;
  }
  const uri = embedded.getUri();
  await tryConnect(uri, 15000);
  log(`Embedded MongoDB running at ${uri}${ephemeral ? '' : ` (data persisted in ${path.join(ROOT, 'data', 'db')})`}`);
  return { mode: 'embedded', uri };
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (embedded) await embedded.stop({ doCleanup: !persistent });
  embedded = null;
}

export async function syncIndexes() {
  const { ALL_MODELS } = await import('./models.js');
  for (const m of ALL_MODELS) await m.syncIndexes();
}
