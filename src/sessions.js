// Assessment session service: persistence of sessions, answers, messages and results in MongoDB.
import crypto from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { col, isDuplicateKey } from './db.js';
import {
  QUESTIONS, getQuestion, nextQuestion, presentQuestion, validateAnswer, prunedAnswers,
  computeResult, ruleBasedSummary, answerLabel,
} from './assessment.js';
import { clinicianSummary } from './ai.js';
import { events } from './events.js';
import { msg, errorText, timeLabel } from './i18n/index.js';

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRefCode() {
  const bytes = crypto.randomBytes(6);
  return 'DC-' + [...bytes].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}

const QUESTION_ORDER = new Map(QUESTIONS.map((q, i) => [q.id, i]));
const PROFILE_FIELDS = { name: 'name', contact: 'contact', for_whom: 'forWhom', age_group: 'ageGroup', main_concern: 'mainConcern' };

export async function getSessionDoc(id) {
  return col.sessions.findOne({ _id: String(id) });
}

export async function touchSession(id) {
  await col.sessions.updateOne({ _id: String(id) }, { $set: { lastSeenAt: new Date() } });
}

// { questionId: value } from a session document.
export function answerMap(doc) {
  return Object.fromEntries(Object.entries(doc?.answers || {}).map(([id, a]) => [id, a.value]));
}

// Answers in question order, in the shape the staff dashboard expects.
export function answerRows(doc) {
  return Object.entries(doc?.answers || {})
    .sort(([a], [b]) => (QUESTION_ORDER.get(a) ?? 999) - (QUESTION_ORDER.get(b) ?? 999))
    .map(([id, a]) => ({
      question_id: id, section: a.section, question_text: a.questionText, value: a.value,
      label: a.label, score: a.score ?? null, created_at: a.createdAt,
    }));
}

function formatMessage(doc) {
  return { id: doc._id.toString(), sender: doc.sender, text: doc.text, meta: doc.meta || null, createdAt: doc.createdAt };
}

// Staff messages for a patient newer than `after` (polling mode).
export async function staffMessagesAfter(sessionId, after) {
  const docs = await col.messages.find({ sessionId, sender: 'staff', createdAt: { $gt: after } }).sort({ createdAt: 1, _id: 1 }).toArray();
  return docs.map(formatMessage);
}

// Everything that changed since `since`, for the staff dashboard in polling mode.
export async function changesSince(since) {
  const [sessions, messages, appointments] = await Promise.all([
    col.sessions.find({ updatedAt: { $gt: since } }, { projection: { name: 1, status: 1, triageLevel: 1, topCondition: 1, createdAt: 1, completedAt: 1 } }).limit(200).toArray(),
    col.messages.find({ createdAt: { $gt: since } }).sort({ createdAt: 1, _id: 1 }).limit(300).toArray(),
    col.appointments.find({ $or: [{ createdAt: { $gt: since } }, { updatedAt: { $gt: since } }] }).limit(100).toArray(),
  ]);
  return {
    sessions: sessions.map((s) => ({
      id: s._id, name: s.name, status: s.status, triageLevel: s.triageLevel, topCondition: s.topCondition,
      created: s.createdAt > since, completed: Boolean(s.completedAt && s.completedAt > since),
    })),
    messages: messages.map((m) => ({ sessionId: m.sessionId, message: formatMessage(m) })),
    appointments: appointments.map((a) => ({ id: a._id.toString(), sessionId: a.sessionId, isNew: a.createdAt > since })),
  };
}

export async function getMessages(sessionId) {
  const docs = await col.messages.find({ sessionId }).sort({ createdAt: 1, _id: 1 }).toArray();
  return docs.map(formatMessage);
}

export async function addMessage(sessionId, sender, text, meta = null) {
  const doc = { sessionId, sender, text, meta, createdAt: new Date() };
  const { insertedId } = await col.messages.insertOne(doc);
  const msg = formatMessage({ ...doc, _id: insertedId });
  events.emit('message', { sessionId, message: msg });
  return msg;
}

// Re-renders a stored chat line in another language. Questions, the patient's own answers and
// standard bot messages are rebuilt from the stored answers; free text (questions typed by the
// patient, assistant answers, staff messages) is shown as written.
function localizeMessage(m, answers, lang) {
  const meta = m.meta || {};
  const q = meta.questionId ? getQuestion(meta.questionId) : null;
  if (m.sender === 'bot' && q) return { ...m, text: presentQuestion(q, answers, lang).text };
  if (m.sender === 'user' && q && meta.questionId in answers && q.type !== 'text') {
    return { ...m, text: answerLabel(q, answers[meta.questionId], lang) };
  }
  if (m.sender === 'user' && q?.type === 'text' && answers[meta.questionId] === '') return { ...m, text: msg(lang, 'skipped') };
  if (m.sender === 'bot' && meta.kind === 'alert') return { ...m, text: msg(lang, 'alert') };
  if (m.sender === 'bot' && meta.kind === 'result') return { ...m, text: msg(lang, 'thanks', answers.name) };
  if (m.sender === 'bot' && meta.kind === 'appointment' && meta.contact) {
    return { ...m, text: msg(lang, 'appointment', { date: meta.date, time: timeLabel(lang, meta.time), contact: meta.contact }) };
  }
  return m;
}

// Public view of a session for the patient's browser, in the patient's language.
export async function patientView(sessionId, lang = 'en') {
  const doc = await getSessionDoc(sessionId);
  if (!doc) return null;
  const answers = answerMap(doc);
  const q = doc.status === 'completed' ? null : nextQuestion(answers);
  const messages = await getMessages(doc._id);
  return {
    session: { id: doc._id, refCode: doc.refCode, status: doc.status, name: doc.name || null },
    messages: messages.map((m) => localizeMessage(m, answers, lang)),
    question: q ? presentQuestion(q, answers, lang) : null,
    // The stored result is the staff's English copy; the patient gets theirs rebuilt in their language.
    result: doc.result ? computeResult(answers, lang) : null,
  };
}

export async function setSessionLang(id, lang) {
  await col.sessions.updateOne({ _id: String(id), lang: { $ne: lang } }, { $set: { lang } });
}

export async function createSession(userAgent = '', lang = 'en') {
  const id = crypto.randomUUID();
  const ts = new Date();
  for (let attempt = 0; ; attempt++) {
    try {
      await col.sessions.insertOne({
        _id: id, refCode: newRefCode(), createdAt: ts, updatedAt: ts, lastSeenAt: ts, completedAt: null,
        status: 'in_progress', name: null, contact: null, forWhom: null, ageGroup: null, mainConcern: null,
        ohatTotal: null, triageLevel: null, topCondition: null, result: null, summary: null, summarySource: null,
        staffStatus: 'new', staffNotes: '', userAgent: String(userAgent).slice(0, 300), lang, answers: {},
      });
      break;
    } catch (err) {
      // Retry only on a reference-code collision.
      if (!isDuplicateKey(err) || attempt >= 4) throw err;
    }
  }
  const first = QUESTIONS[0];
  await addMessage(id, 'bot', presentQuestion(first, {}, lang).text, { questionId: first.id });
  events.emit('session', { type: 'created', sessionId: id });
  return patientView(id, lang);
}

export class AnswerError extends Error {}

/**
 * Records an answer to the current question (or re-answers an earlier one, pruning
 * answers that no longer apply). Returns the new bot messages, next question and result.
 */
export async function submitAnswer(sessionId, questionId, rawValue, lang = 'en') {
  const fail = (key) => new AnswerError(errorText(lang, key));
  const doc = await getSessionDoc(sessionId);
  if (!doc) throw fail('notFound');
  if (doc.status === 'completed') throw fail('complete');

  const q = getQuestion(questionId);
  if (!q) throw fail('unknown');
  const answers = answerMap(doc);
  const current = nextQuestion(answers);
  if (!(questionId in answers) && current?.id !== questionId) throw fail('current');
  if (q.when && !q.when(answers)) throw fail('notApply');

  let parsed;
  try {
    parsed = validateAnswer(q, rawValue, lang);
  } catch (err) {
    throw new AnswerError(err.message);
  }

  const ts = new Date();
  const updated = { ...answers, [q.id]: parsed.value };
  const kept = prunedAnswers(updated);

  // One atomic update: store the answer, drop answers that no longer apply, update profile fields.
  const $set = {
    [`answers.${q.id}`]: {
      section: q.section, questionText: presentQuestion(q, answers).text,
      value: parsed.value, label: parsed.label, score: parsed.score, createdAt: ts,
    },
    updatedAt: ts,
    lastSeenAt: ts,
    lang,
  };
  if (PROFILE_FIELDS[q.id]) $set[PROFILE_FIELDS[q.id]] = parsed.value === '' ? null : parsed.value;
  const $unset = {};
  for (const id of Object.keys(updated)) if (!(id in kept)) $unset[`answers.${id}`] = '';

  const res = await col.sessions.updateOne(
    { _id: doc._id, status: 'in_progress' },
    Object.keys($unset).length ? { $set, $unset } : { $set },
  );
  if (!res.matchedCount) throw fail('complete');

  // The transcript keeps the answer as the patient saw it; the answers store keeps English.
  await addMessage(doc._id, 'user', answerLabel(q, parsed.value, lang), { questionId: q.id });

  const botMessages = [];
  if (q.id === 'red_flags' && Array.isArray(parsed.value) && !parsed.value.includes('none')) {
    botMessages.push(await addMessage(doc._id, 'bot', msg(lang, 'alert'), { kind: 'alert' }));
    events.emit('session', { type: 'red_flag', sessionId: doc._id });
  }

  const next = nextQuestion(kept);
  events.emit('session', { type: 'answered', sessionId: doc._id, questionId: q.id });

  if (next) {
    const presented = presentQuestion(next, kept, lang);
    botMessages.push(await addMessage(doc._id, 'bot', presented.text, { questionId: next.id }));
    return { botMessages, question: presented, result: null };
  }

  if (!(await completeSession(doc._id, kept))) throw fail('complete');
  botMessages.push(await addMessage(doc._id, 'bot', msg(lang, 'thanks', kept.name), { kind: 'result' }));
  return { botMessages, question: null, result: computeResult(kept, lang) };
}

// Stores the English result and summary for the dental team.
async function completeSession(sessionId, answers) {
  const result = computeResult(answers, 'en');
  const ts = new Date();
  // The status filter makes completion happen exactly once, even with duplicate submissions.
  const res = await col.sessions.updateOne({ _id: sessionId, status: 'in_progress' }, {
    $set: {
      status: 'completed', completedAt: ts, updatedAt: ts, ohatTotal: result.ohatTotal, triageLevel: result.level,
      topCondition: result.conditions[0]?.name || null, result,
      summary: ruleBasedSummary(answers, result), summarySource: 'rules',
    },
  });
  if (!res.modifiedCount) return null;
  events.emit('session', { type: 'completed', sessionId });

  // The AI summary is written in the background so the patient sees results immediately.
  // waitUntil keeps a serverless function alive until it finishes (a plain promise elsewhere).
  const doc = await getSessionDoc(sessionId);
  const lines = answerRows(doc).map((a) => `- ${a.question_id}: ${a.label}`);
  waitUntil(clinicianSummary(lines, result).then(async (text) => {
    if (!text) return;
    await col.sessions.updateOne({ _id: sessionId }, { $set: { summary: text, summarySource: 'ai', updatedAt: new Date() } });
    events.emit('session', { type: 'summary', sessionId });
  }).catch((err) => console.error('[summary]', err.message)));
  return result;
}

// Short plain-text context of answers so far, for the AI chat.
export function answerContext(doc) {
  return answerRows(doc)
    .filter((a) => !['name', 'contact'].includes(a.question_id))
    .map((a) => `${a.question_id}: ${a.label}`)
    .join('\n');
}

export async function chatHistory(sessionId) {
  const docs = await col.messages
    .find({ sessionId, $or: [{ 'meta.kind': 'question' }, { sender: 'ai' }] })
    .sort({ createdAt: 1, _id: 1 }).toArray();
  return docs.map((m) => ({ role: m.sender === 'ai' ? 'assistant' : 'user', content: m.text }));
}

// ---------- staff (admin) views ----------

export function formatAppointment(a, session = null) {
  return {
    id: a._id.toString(), session_id: a.sessionId || null, name: a.name, contact: a.contact,
    preferred_date: a.preferredDate || null, preferred_time: a.preferredTime || null, notes: a.notes || null,
    status: a.status, created_at: a.createdAt,
    ref_code: session?.refCode || null, triage_level: session?.triageLevel || null,
  };
}

export async function sessionDetail(sessionId) {
  const doc = await getSessionDoc(sessionId);
  if (!doc) return null;
  const [messages, appts] = await Promise.all([
    getMessages(doc._id),
    col.appointments.find({ sessionId: doc._id }).sort({ createdAt: -1 }).toArray(),
  ]);
  return {
    id: doc._id, ref_code: doc.refCode, created_at: doc.createdAt, updated_at: doc.updatedAt,
    completed_at: doc.completedAt, status: doc.status, name: doc.name, contact: doc.contact, lang: doc.lang || 'en',
    for_whom: doc.forWhom, age_group: doc.ageGroup, main_concern: doc.mainConcern, ohat_total: doc.ohatTotal,
    triage_level: doc.triageLevel, top_condition: doc.topCondition, result: doc.result, summary: doc.summary,
    summary_source: doc.summarySource, staff_status: doc.staffStatus, staff_notes: doc.staffNotes,
    answers: answerRows(doc), messages, appointments: appts.map((a) => formatAppointment(a)),
  };
}
