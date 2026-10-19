import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectId } from 'mongodb';
import { config, usingDefaultAdminPassword } from './src/config.js';
import { col, dbReady, closeDb } from './src/db.js';
import { events, openStream } from './src/events.js';
import { answerQuestion } from './src/ai.js';
import { normalizeLang, msg, timeLabel } from './src/i18n/index.js';
import {
  createSession, patientView, submitAnswer, AnswerError, addMessage, getSessionDoc, touchSession,
  answerContext, chatHistory, sessionDetail, formatAppointment, staffMessagesAfter, changesSince, setSessionLang,
} from './src/sessions.js';
import {
  createPost, updatePost, deletePost, staffPosts, staffPostDetail, publishedPosts, publishedPost,
  saveImage, getImage, MAX_IMAGE_BYTES,
} from './src/blog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
// Behind a hosting proxy (Render, Railway, nginx), trust the first hop so req.ip is the visitor's IP.
app.set('trust proxy', 1);
const smallJson = express.json({ limit: '32kb' });
// Blog articles are longer (Sinhala and Tamil letters take 3 bytes each).
const postJson = express.json({ limit: '512kb' });
app.use((req, res, next) => (req.path.startsWith('/api/admin/posts') ? postJson : smallJson)(req, res, next));

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'",
  });
  next();
});

app.use(express.static(path.join(here, 'public'), { extensions: ['html'] }));
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Health check for hosting platforms.
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- helpers ----------

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// The patient's language (en, si or ta) comes with every request as ?lang= or body.lang.
app.use('/api', (req, res, next) => {
  req.lang = normalizeLang(String(req.query.lang || req.body?.lang || 'en'));
  next();
});

// Every API request waits for the (cached) MongoDB connection.
app.use('/api', asyncRoute(async (req, res, next) => {
  try {
    await dbReady();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    return res.status(503).json({ error: 'The service is temporarily unavailable. Please try again shortly.' });
  }
  next();
}));

// Simple fixed-window rate limiter keyed by IP.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const key = req.ip;
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    if (n > max) return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    next();
  };
}

const loadSession = asyncRoute(async (req, res, next) => {
  const doc = await getSessionDoc(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Session not found.' });
  req.sessionDoc = doc;
  next();
});

const clip = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isObjectId = (s) => /^[a-f0-9]{24}$/i.test(String(s));

// Patients currently connected (live) via their SSE stream: sessionId -> connection count.
const liveSessions = new Map();

// In polling mode a patient counts as online if their page checked in recently.
const ONLINE_WINDOW_MS = 20000;
const isOnline = (doc) => liveSessions.has(doc._id)
  || (config.realtime === 'poll' && doc.lastSeenAt && Date.now() - new Date(doc.lastSeenAt) < ONLINE_WINDOW_MS);

// Parses a ?since / ?after timestamp, defaulting to "now" so a bad value never dumps everything.
function parseTime(v) {
  const d = new Date(String(v || ''));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
// Overlap so writes committed just before a poll are not missed; clients ignore duplicates.
const POLL_OVERLAP_MS = 3000;

// ---------- public API ----------

app.get('/api/config', (req, res) => {
  res.json({ clinic: config.clinic, aiEnabled: config.anthropicEnabled, realtime: config.realtime });
});

app.post('/api/sessions', rateLimit({ windowMs: 60 * 60 * 1000, max: 30 }), asyncRoute(async (req, res) => {
  res.status(201).json(await createSession(req.get('user-agent'), req.lang));
}));

app.get('/api/sessions/:id', loadSession, asyncRoute(async (req, res) => {
  await touchSession(req.sessionDoc._id);
  await setSessionLang(req.sessionDoc._id, req.lang);
  res.json(await patientView(req.sessionDoc._id, req.lang));
}));

app.post('/api/sessions/:id/answer', loadSession, asyncRoute(async (req, res) => {
  const { questionId, value } = req.body || {};
  try {
    res.json(await submitAnswer(req.sessionDoc._id, String(questionId || ''), value, req.lang));
  } catch (err) {
    if (err instanceof AnswerError) return res.status(400).json({ error: err.message });
    throw err;
  }
}));

app.post('/api/sessions/:id/chat', loadSession, rateLimit({ windowMs: 60 * 1000, max: 15 }), asyncRoute(async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'Please type a question.' });
  const id = req.sessionDoc._id;
  const history = await chatHistory(id);
  await addMessage(id, 'user', text, { kind: 'question' });
  const reply = await answerQuestion(text, history, answerContext(req.sessionDoc), req.lang);
  const message = await addMessage(id, 'ai', reply.text, { source: reply.source });
  await touchSession(id);
  res.json({ message });
}));

// Polling alternative to the stream below: staff messages newer than ?after.
app.get('/api/sessions/:id/updates', loadSession, asyncRoute(async (req, res) => {
  const now = new Date();
  const after = new Date(parseTime(req.query.after).getTime() - POLL_OVERLAP_MS);
  const [messages] = await Promise.all([staffMessagesAfter(req.sessionDoc._id, after), touchSession(req.sessionDoc._id)]);
  res.json({ now, messages });
}));

// Real-time stream for the patient: receives messages from clinic staff.
app.get('/api/sessions/:id/events', loadSession, (req, res) => {
  const id = req.sessionDoc._id;
  liveSessions.set(id, (liveSessions.get(id) || 0) + 1);
  events.emit('presence', { sessionId: id, online: true });
  const onMessage = ({ sessionId, message }) => {
    if (sessionId === id && message.sender === 'staff') send('staff_message', message);
  };
  const send = openStream(req, res, () => {
    events.off('message', onMessage);
    const n = (liveSessions.get(id) || 1) - 1;
    if (n <= 0) liveSessions.delete(id); else liveSessions.set(id, n);
    events.emit('presence', { sessionId: id, online: liveSessions.has(id) });
  });
  events.on('message', onMessage);
});

app.post('/api/appointments', rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), asyncRoute(async (req, res) => {
  const b = req.body || {};
  const name = clip(b.name, 80);
  const contact = clip(b.contact, 120);
  if (!name || !contact) return res.status(400).json({ error: 'Name and phone/email are required.' });
  const date = clip(b.preferredDate, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date.' });
  const session = b.sessionId ? await getSessionDoc(b.sessionId) : null;
  const sessionId = session?._id || null;
  const time = clip(b.preferredTime, 20);

  const { insertedId } = await col.appointments.insertOne({
    sessionId, name, contact, preferredDate: date, preferredTime: time, notes: clip(b.notes, 600),
    status: 'requested', createdAt: new Date(),
  });
  let message = null;
  if (sessionId) {
    await col.sessions.updateOne({ _id: sessionId, contact: null }, { $set: { contact } });
    await col.sessions.updateOne({ _id: sessionId }, { $set: { updatedAt: new Date() } });
    message = await addMessage(sessionId, 'bot', msg(req.lang, 'appointment', { date, time: timeLabel(req.lang, time), contact }),
      { kind: 'appointment', date, time, contact });
  }
  events.emit('appointment', { id: insertedId.toString(), sessionId });
  res.status(201).json({ id: insertedId.toString(), message });
}));

// ---------- blog (public) ----------

app.get('/api/posts', asyncRoute(async (req, res) => {
  res.json(await publishedPosts({ category: req.query.category, q: req.query.q, limit: req.query.limit }));
}));

app.get('/api/posts/:slug', asyncRoute(async (req, res) => {
  res.json(await publishedPost(req.params.slug));
}));

// Photos never change once uploaded (a new photo gets a new id), so browsers and the CDN may keep them.
app.get('/api/images/:id', asyncRoute(async (req, res) => {
  const img = await getImage(req.params.id);
  if (!img) return res.status(404).json({ error: 'Not found.' });
  const data = Buffer.from(img.data.buffer.subarray(0, img.data.position));
  res.set({
    'Content-Type': img.mime,
    'Content-Length': data.length,
    'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
  });
  res.end(data);
}));

// ---------- staff (admin) API ----------

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const sign = (payload) => crypto.createHmac('sha256', config.adminSecret).update(payload).digest('base64url');

function issueToken() {
  const payload = String(Date.now() + TOKEN_TTL_MS);
  return `${payload}.${sign(payload)}`;
}

function validToken(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Number(payload) > Date.now();
}

function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!validToken(token)) return res.status(401).json({ error: 'Please log in.' });
  next();
}

app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), (req, res) => {
  const given = Buffer.from(String(req.body?.password || ''));
  const expected = Buffer.from(config.adminPassword);
  const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!ok) return res.status(401).json({ error: 'Incorrect password.' });
  res.json({ token: issueToken(), defaultPassword: usingDefaultAdminPassword });
});

const admin = express.Router();
admin.use(requireAdmin);

function sessionSummaryRow(d) {
  return {
    id: d._id, refCode: d.refCode, createdAt: d.createdAt, updatedAt: d.updatedAt, completedAt: d.completedAt,
    status: d.status, name: d.name, contact: d.contact, forWhom: d.forWhom, ageGroup: d.ageGroup,
    mainConcern: d.mainConcern, ohatTotal: d.ohatTotal, triageLevel: d.triageLevel, topCondition: d.topCondition,
    staffStatus: d.staffStatus, answered: Object.keys(d.answers || {}).length, online: Boolean(isOnline(d)),
  };
}

// Polling alternative to /stream: everything that changed since ?since.
admin.get('/changes', asyncRoute(async (req, res) => {
  const now = new Date();
  const since = new Date(parseTime(req.query.since).getTime() - POLL_OVERLAP_MS);
  res.json({ now, ...(await changesSince(since)) });
}));

admin.get('/sessions', asyncRoute(async (req, res) => {
  const filter = {};
  const { status, level, staffStatus, q } = req.query;
  if (status) filter.status = String(status);
  if (level) filter.triageLevel = String(level);
  if (staffStatus) filter.staffStatus = String(staffStatus);
  if (q) {
    const re = { $regex: escapeRegex(String(q).slice(0, 60)), $options: 'i' };
    filter.$or = [{ name: re }, { contact: re }, { refCode: re }, { topCondition: re }];
  }
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const docs = await col.sessions.find(filter, { projection: { result: 0, summary: 0, userAgent: 0 } })
    .sort({ updatedAt: -1 }).limit(limit).toArray();
  res.json({ sessions: docs.map(sessionSummaryRow) });
}));

admin.get('/sessions/:id', asyncRoute(async (req, res) => {
  const detail = await sessionDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'Not found.' });
  const doc = await getSessionDoc(detail.id);
  res.json({ session: { ...detail, online: Boolean(doc && isOnline(doc)) } });
}));

const STAFF_STATUSES = new Set(['new', 'contacted', 'booked', 'resolved']);

admin.patch('/sessions/:id', asyncRoute(async (req, res) => {
  const { staffStatus, staffNotes } = req.body || {};
  if (staffStatus !== undefined && !STAFF_STATUSES.has(staffStatus)) return res.status(400).json({ error: 'Invalid status.' });
  const $set = { updatedAt: new Date() };
  if (staffStatus !== undefined) $set.staffStatus = staffStatus;
  if (staffNotes !== undefined) $set.staffNotes = String(staffNotes).slice(0, 4000);
  const r = await col.sessions.updateOne({ _id: String(req.params.id) }, { $set });
  if (!r.matchedCount) return res.status(404).json({ error: 'Not found.' });
  events.emit('session', { type: 'staff_update', sessionId: String(req.params.id) });
  res.json({ ok: true });
}));

admin.delete('/sessions/:id', asyncRoute(async (req, res) => {
  const id = String(req.params.id);
  const r = await col.sessions.deleteOne({ _id: id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Not found.' });
  await Promise.all([
    col.messages.deleteMany({ sessionId: id }),
    col.appointments.updateMany({ sessionId: id }, { $set: { sessionId: null } }),
  ]);
  events.emit('session', { type: 'deleted', sessionId: id });
  res.json({ ok: true });
}));

admin.post('/sessions/:id/message', asyncRoute(async (req, res) => {
  const doc = await getSessionDoc(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found.' });
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'Message is empty.' });
  const message = await addMessage(doc._id, 'staff', text);
  await col.sessions.updateOne({ _id: doc._id, staffStatus: 'new' }, { $set: { staffStatus: 'contacted' } });
  events.emit('session', { type: 'staff_update', sessionId: doc._id });
  res.json({ message, delivered: Boolean(isOnline(doc)) });
}));

const countBy = (field) => [{ $group: { _id: `$${field}`, n: { $sum: 1 } } }, { $sort: { n: -1 } }];
const isCompleted = { $eq: ['$status', 'completed'] };

const TREND_DAYS = 14;

// "+05:30" style offset for MongoDB date grouping, from minutes east of UTC.
function utcOffsetString(minutes) {
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

admin.get('/stats', asyncRoute(async (req, res) => {
  // Days are counted in the staff member's local time (?tzOffset = minutes east of UTC).
  const offsetMin = Math.max(-840, Math.min(840, Math.round(Number(req.query.tzOffset) || 0)));
  const localDay = (ms) => new Date(ms + offsetMin * 60000).toISOString().slice(0, 10);
  const days = Array.from({ length: TREND_DAYS }, (_, i) => localDay(Date.now() - (TREND_DAYS - 1 - i) * 86400000));
  const startOf = (day) => new Date(Date.parse(day) - offsetMin * 60000);
  const since = startOf(days[TREND_DAYS - 1]);
  const [totalsRows, levels, concerns, conditions, pendingAppointments, polledOnline, dailyRows] = await Promise.all([
    col.sessions.aggregate([{
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: { $sum: { $cond: [isCompleted, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
        today: { $sum: { $cond: [{ $gte: ['$createdAt', since] }, 1, 0] } },
        avgOhat: { $avg: { $cond: [isCompleted, '$ohatTotal', null] } },
        urgentOpen: { $sum: { $cond: [{ $and: [isCompleted, { $in: ['$triageLevel', ['urgent', 'emergency']] }, { $in: ['$staffStatus', ['new', 'contacted']] }] }, 1, 0] } },
        needsFollowUp: { $sum: { $cond: [{ $and: [isCompleted, { $eq: ['$staffStatus', 'new'] }] }, 1, 0] } },
      },
    }]).toArray(),
    col.sessions.aggregate([{ $match: { status: 'completed' } }, ...countBy('triageLevel')]).toArray(),
    col.sessions.aggregate([{ $match: { mainConcern: { $ne: null } } }, ...countBy('mainConcern')]).toArray(),
    col.sessions.aggregate([
      { $match: { status: 'completed' } }, { $sort: { completedAt: -1 } }, { $limit: 2000 },
      { $unwind: '$result.conditions' }, ...countBy('result.conditions.name'), { $limit: 8 },
    ]).toArray(),
    col.appointments.countDocuments({ status: 'requested' }),
    config.realtime === 'poll' ? col.sessions.countDocuments({ lastSeenAt: { $gt: new Date(Date.now() - ONLINE_WINDOW_MS) } }) : 0,
    col.sessions.aggregate([
      { $match: { createdAt: { $gte: startOf(days[0]) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: utcOffsetString(offsetMin) } }, n: { $sum: 1 } } },
    ]).toArray(),
  ]);
  const t = totalsRows[0] || {};
  const perDay = new Map(dailyRows.map((r) => [r._id, r.n]));
  res.json({
    totals: {
      total: t.total || 0, completed: t.completed || 0, inProgress: t.inProgress || 0, today: t.today || 0,
      avgOhat: t.avgOhat == null ? null : Math.round(t.avgOhat * 10) / 10,
      urgentOpen: t.urgentOpen || 0, needsFollowUp: t.needsFollowUp || 0,
      live: Math.max(liveSessions.size, polledOnline), pendingAppointments,
    },
    levels: levels.map((r) => ({ level: r._id, n: r.n })),
    concerns: concerns.map((r) => ({ concern: r._id, n: r.n })),
    conditions: conditions.map((r) => ({ name: r._id, n: r.n })),
    daily: days.map((date) => ({ date, n: perDay.get(date) || 0 })),
  });
}));

admin.get('/appointments', asyncRoute(async (req, res) => {
  const rows = await col.appointments.aggregate([
    { $sort: { createdAt: -1 } },
    { $limit: 500 },
    { $lookup: { from: 'sessions', localField: 'sessionId', foreignField: '_id', as: 'session', pipeline: [{ $project: { refCode: 1, triageLevel: 1 } }] } },
  ]).toArray();
  res.json({ appointments: rows.map((a) => formatAppointment(a, a.session[0])) });
}));

const APPT_STATUSES = new Set(['requested', 'confirmed', 'cancelled', 'done']);
admin.patch('/appointments/:id', asyncRoute(async (req, res) => {
  const status = req.body?.status;
  if (!APPT_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid status.' });
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const appt = await col.appointments.findOneAndUpdate({ _id: new ObjectId(req.params.id) }, { $set: { status, updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!appt) return res.status(404).json({ error: 'Not found.' });
  if (appt.sessionId && status === 'confirmed') {
    await col.sessions.updateOne({ _id: appt.sessionId }, { $set: { staffStatus: 'booked', updatedAt: new Date() } });
    events.emit('session', { type: 'staff_update', sessionId: appt.sessionId });
  }
  events.emit('appointment', { id: appt._id.toString(), sessionId: appt.sessionId, status });
  res.json({ ok: true });
}));

const csvCell = (v) => {
  let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // prevent spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

admin.get('/export.csv', asyncRoute(async (req, res) => {
  const qIds = ['age_group', 'main_concern', 'red_flags', 'lips', 'tongue', 'gums', 'saliva', 'teeth', 'denture_use', 'dentures',
    'cleanliness', 'pain', 'pain_level', 'pain_type', 'symptoms', 'duration', 'risk_factors', 'brushing', 'interdental', 'last_visit', 'notes'];
  const header = ['ref_code', 'created_at', 'completed_at', 'status', 'name', 'contact', 'language', 'for_whom', 'triage_level', 'ohat_total',
    'predicted_conditions', 'staff_status', 'staff_notes', 'summary', ...qIds];
  const lines = [header.join(',')];
  for await (const d of col.sessions.find({}).sort({ createdAt: -1 })) {
    const conds = d.result ? d.result.conditions.map((c) => `${c.name} (${c.confidence}%)`).join('; ') : '';
    const a = d.answers || {};
    lines.push([d.refCode, d.createdAt, d.completedAt, d.status, d.name, d.contact, d.lang || 'en', d.forWhom, d.triageLevel, d.ohatTotal,
      conds, d.staffStatus, d.staffNotes, d.summary, ...qIds.map((id) => a[id]?.label)].map(csvCell).join(','));
  }
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="assessments-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.send('﻿' + lines.join('\r\n'));
}));

// Real-time feed for the staff dashboard.
admin.get('/stream', (req, res) => {
  const onSession = (e) => send('session', e);
  const onMessage = (e) => send('message', { sessionId: e.sessionId, message: e.message });
  const onAppointment = (e) => send('appointment', e);
  const onPresence = (e) => send('presence', e);
  const send = openStream(req, res, () => {
    events.off('session', onSession);
    events.off('message', onMessage);
    events.off('appointment', onAppointment);
    events.off('presence', onPresence);
  });
  events.on('session', onSession);
  events.on('message', onMessage);
  events.on('appointment', onAppointment);
  events.on('presence', onPresence);
  send('hello', { at: new Date() });
});

// ---------- blog (staff) ----------

admin.get('/posts', asyncRoute(async (req, res) => res.json({ posts: await staffPosts() })));
admin.get('/posts/:id', asyncRoute(async (req, res) => res.json({ post: await staffPostDetail(req.params.id) })));
admin.post('/posts', asyncRoute(async (req, res) => res.status(201).json({ post: await createPost(req.body) })));
admin.patch('/posts/:id', asyncRoute(async (req, res) => res.json({ post: await updatePost(req.params.id, req.body) })));
admin.delete('/posts/:id', asyncRoute(async (req, res) => {
  await deletePost(req.params.id);
  res.json({ ok: true });
}));
// One photo per request (the dashboard shrinks photos first, keeping each well under hosting upload limits).
admin.post('/images', express.raw({ type: 'image/*', limit: MAX_IMAGE_BYTES }), asyncRoute(async (req, res) => {
  const image = await saveImage(Buffer.isBuffer(req.body) ? req.body : null, { width: req.get('x-image-width'), height: req.get('x-image-height') });
  res.status(201).json({ image });
}));

app.use('/api/admin', admin);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Something went wrong. Please try again.' });
});

// ---------- start ----------

// On Vercel the exported app is invoked per request; elsewhere we run a normal long-lived server.
export default app;

async function start() {
  try {
    await dbReady();
  } catch (err) {
    console.error(`\n  Could not connect to MongoDB: ${err.message}`);
    console.error('  Check that MONGODB_URI in .env is correct, the database user/password are right,');
    console.error('  and that this machine\'s IP address is allowed under Atlas > Network Access.\n');
    process.exit(1);
  }
  const server = app.listen(config.port, () => {
    console.log(`\n  ${config.clinic.name} - website:  http://localhost:${config.port}`);
    console.log(`  Staff dashboard:                  http://localhost:${config.port}/admin`);
    console.log(`  Database: MongoDB connected (database "${config.mongoDb}")`);
    console.log(`  Live updates: ${config.realtime === 'poll' ? 'polling every few seconds' : 'instant (server-sent events)'}`);
    console.log(`  Claude AI answers: ${config.anthropicEnabled ? 'ON' : 'OFF (set ANTHROPIC_API_KEY in .env to enable)'}`);
    if (usingDefaultAdminPassword) console.log('  WARNING: using default admin password "admin123" - set ADMIN_PASSWORD in .env');
    console.log('');
  });

  const shutdown = () => {
    server.close();
    server.closeAllConnections?.();
    closeDb().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (!config.serverless) start();
