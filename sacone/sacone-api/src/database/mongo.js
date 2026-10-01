/**
 * Centralized MongoDB connection for SACONE Atlas / local Mongo.
 * Application runtime remains SQLite unless DATABASE_DRIVER=mongodb and repos are implemented.
 * All modules must use this helper — do not open separate MongoClient instances.
 */

import { MongoClient } from 'mongodb';
import { config } from '../config/index.js';
import { AppError } from '../core/http.js';

let client = null;
let db = null;
let shutdownHooked = false;

export function isMongoConfigured() {
  return Boolean(config.mongodbUri);
}

export function getMongoConfigStatus() {
  return {
    configured: isMongoConfigured(),
    uriSet: Boolean(config.mongodbUri),
    database: config.mongodbDatabase || null,
    writeEnabled: Boolean(config.mongodbWriteEnabled),
    driverSetting: config.databaseDriver,
    appEnv: config.appEnv,
  };
}

function assertUri() {
  if (!config.mongodbUri) {
    throw new AppError(
      'MONGODB_URI is not configured. Set it in .env (Atlas or local Mongo) before connecting.',
      400,
      'MONGODB_URI_MISSING'
    );
  }
  if (!config.mongodbDatabase) {
    throw new AppError('MONGODB_DATABASE is required', 400, 'MONGODB_DATABASE_MISSING');
  }
}

export async function connectMongo({ force = false } = {}) {
  assertUri();
  if (client && db && !force) return { client, db };

  if (client && force) {
    await closeMongo();
  }

  client = new MongoClient(config.mongodbUri, {
    maxPoolSize: config.mongodbMaxPoolSize || 10,
    serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '8000', 10),
  });
  await client.connect();
  db = client.db(config.mongodbDatabase);
  hookShutdown();
  return { client, db };
}

export async function getMongoDb() {
  const conn = await connectMongo();
  return conn.db;
}

export async function pingMongo() {
  if (!isMongoConfigured()) {
    return { ok: false, configured: false, message: 'MONGODB_URI not set', appEnv: config.appEnv };
  }
  try {
    const { db: database } = await connectMongo();
    await database.command({ ping: 1 });
    return {
      ok: true,
      configured: true,
      database: config.mongodbDatabase,
      writeEnabled: Boolean(config.mongodbWriteEnabled),
      appEnv: config.appEnv,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      message: err.message,
      appEnv: config.appEnv,
    };
  }
}

export async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

function hookShutdown() {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const shutdown = async () => {
    try { await closeMongo(); } catch { /* ignore */ }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

/** Startup-safe status (never throws). */
export async function getDatabaseHealth() {
  const sqlite = {
    driver: 'sqlite',
    pathConfigured: Boolean(config.databasePath),
    active: config.databaseDriver === 'sqlite',
  };
  let sqliteOk = false;
  if (config.databaseDriver === 'sqlite') {
    try {
      const { getDatabase } = await import('./connection.js');
      getDatabase().prepare('SELECT 1 as ok').get();
      sqliteOk = true;
    } catch (err) {
      sqlite.error = err.message;
    }
  }
  sqlite.connected = sqliteOk;

  const mongo = getMongoConfigStatus();
  if (mongo.configured) {
    const ping = await pingMongo();
    mongo.connected = ping.ok;
    if (!ping.ok) mongo.error = ping.message;
  } else {
    mongo.connected = false;
  }

  const primaryOk = config.databaseDriver === 'sqlite' ? sqliteOk : Boolean(mongo.connected);
  return {
    ok: primaryOk,
    environment: config.appEnv,
    primaryDriver: config.databaseDriver,
    sqlite,
    mongodb: mongo,
  };
}
