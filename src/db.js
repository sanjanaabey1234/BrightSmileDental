// MongoDB (Atlas) connection and collections.
//
// Collections:
//   sessions     - one document per assessment; answers are embedded as { [questionId]: answer }
//   messages     - chat transcript lines (bot, patient, assistant answers, staff)
//   appointments - appointment requests from the chat or the booking page
//   posts        - blog posts written by staff (see blog.js)
//   images       - photos for blog posts, stored in the database (see blog.js)
import { MongoClient } from 'mongodb';
import { config } from './config.js';

let client = null;

export const col = {
  /** @type {import('mongodb').Collection} */ sessions: null,
  /** @type {import('mongodb').Collection} */ messages: null,
  /** @type {import('mongodb').Collection} */ appointments: null,
  /** @type {import('mongodb').Collection} */ posts: null,
  /** @type {import('mongodb').Collection} */ images: null,
};

export async function connectDb(uri = config.mongoUri, dbName = config.mongoDb) {
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add your MongoDB Atlas connection string to .env (see .env.example).');
  }
  client = new MongoClient(uri, {
    appName: 'brightsmile-dental',
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 20,
  });
  await client.connect();
  const db = client.db(dbName);
  await db.command({ ping: 1 });

  col.sessions = db.collection('sessions');
  col.messages = db.collection('messages');
  col.appointments = db.collection('appointments');
  col.posts = db.collection('posts');
  col.images = db.collection('images');

  await Promise.all([
    col.sessions.createIndex({ refCode: 1 }, { unique: true }),
    col.sessions.createIndex({ updatedAt: -1 }),
    col.sessions.createIndex({ createdAt: -1 }),
    col.sessions.createIndex({ status: 1, triageLevel: 1, staffStatus: 1 }),
    col.messages.createIndex({ sessionId: 1, createdAt: 1 }),
    col.appointments.createIndex({ createdAt: -1 }),
    col.appointments.createIndex({ sessionId: 1 }),
    col.appointments.createIndex({ status: 1 }),
    col.posts.createIndex({ slug: 1 }, { unique: true }),
    col.posts.createIndex({ status: 1, publishedAt: -1 }),
    col.posts.createIndex({ updatedAt: -1 }),
    col.images.createIndex({ postId: 1, createdAt: 1 }),
  ]);
  return db;
}

// Connects once and reuses the connection; on serverless hosts each warm function instance
// keeps its client between requests. A failed attempt is forgotten so the next request retries.
let ready = null;
export function dbReady() {
  ready ||= connectDb().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

export async function closeDb() {
  await client?.close();
  client = null;
  ready = null;
}

export const isDuplicateKey = (err) => err?.code === 11000;
