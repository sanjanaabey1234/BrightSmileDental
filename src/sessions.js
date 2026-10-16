// Assessment session service: persistence of sessions, answers, messages and results.
import crypto from 'node:crypto';
import { db, now, tx, plain, plainAll } from './db.js';
import {
  QUESTIONS, getQuestion, nextQuestion, presentQuestion, validateAnswer, prunedAnswers,
  computeResult, ruleBasedSummary,
} from './assessment.js';
import { clinicianSummary } from './ai.js';
import { events } from './events.js';

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRefCode() {
  const bytes = crypto.randomBytes(6);
  return 'DC-' + [...bytes].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}

const stmts = {
  insertSession: db.prepare(`INSERT INTO sessions (id, ref_code, created_at, updated_at, last_seen_at, user_agent)
                             VALUES (?, ?, ?, ?, ?, ?)`),
  getSession: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  touch: db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?'),
  answers: db.prepare('SELECT * FROM answers WHERE session_id = ? ORDER BY id'),
  upsertAnswer: db.prepare(`INSERT INTO answers (session_id, question_id, section, question_text, value_json, label, score, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT (session_id, question_id) DO UPDATE SET
                              question_text = excluded.question_text, value_json = excluded.value_json,
                              label = excluded.label, score = excluded.score, created_at = excluded.created_at`),
  deleteAnswer: db.prepare('DELETE FROM answers WHERE session_id = ? AND question_id = ?'),
  insertMessage: db.prepare('INSERT INTO messages (session_id, sender, text, meta_json, created_at) VALUES (?, ?, ?, ?, ?)'),
  messages: db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id'),
  getMessage: db.prepare('SELECT * FROM messages WHERE id = ?'),
  appointmentsFor: db.prepare('SELECT * FROM appointments WHERE session_id = ? ORDER BY id DESC'),
};

const PROFILE_FIELDS = { name: 'name', contact: 'contact', for_whom: 'for_whom', age_group: 'age_group', main_concern: 'main_concern' };

export function getSessionRow(id) {
  return plain(stmts.getSession.get(id));
}

export function touchSession(id) {
  stmts.touch.run(now(), id);
}

export function getAnswerMap(sessionId) {
  const map = {};
  for (const row of stmts.answers.all(sessionId)) map[row.question_id] = JSON.parse(row.value_json);
  return map;
}

export function getAnswerRows(sessionId) {
  return plainAll(stmts.answers.all(sessionId)).map((r) => ({ ...r, value: JSON.parse(r.value_json) }));
}

export function getMessages(sessionId) {
  return plainAll(stmts.messages.all(sessionId)).map(formatMessage);
}

function formatMessage(row) {
  return { id: row.id, sender: row.sender, text: row.text, meta: row.meta_json ? JSON.parse(row.meta_json) : null, createdAt: row.created_at };
}

export function addMessage(sessionId, sender, text, meta = null) {
  const info = stmts.insertMessage.run(sessionId, sender, text, meta ? JSON.stringify(meta) : null, now());
  const msg = formatMessage(plain(stmts.getMessage.get(Number(info.lastInsertRowid))));
  events.emit('message', { sessionId, message: msg });
  return msg;
}

// Public view of a session for the patient's browser.
export function patientView(sessionId) {
  const row = getSessionRow(sessionId);
  if (!row) return null;
  const answers = getAnswerMap(sessionId);
  const q = row.status === 'completed' ? null : nextQuestion(answers);
  return {
    session: { id: row.id, refCode: row.ref_code, status: row.status, name: row.name },
    messages: getMessages(sessionId),
    question: q ? presentQuestion(q, answers) : null,
    result: row.result_json ? JSON.parse(row.result_json) : null,
  };
}

export function createSession(userAgent = '') {
  const id = crypto.randomUUID();
  const ts = now();
  let ref;
  for (let i = 0; i < 5; i++) {
    ref = newRefCode();
    try {
      stmts.insertSession.run(id, ref, ts, ts, ts, String(userAgent).slice(0, 300));
      break;
    } catch (err) {
      if (i === 4 || !String(err.message).includes('UNIQUE')) throw err;
    }
  }
  const first = QUESTIONS[0];
  addMessage(id, 'bot', presentQuestion(first, {}).text, { questionId: first.id });
  events.emit('session', { type: 'created', sessionId: id });
  return patientView(id);
}

export class AnswerError extends Error {}

/**
 * Records an answer to the current question (or re-answers an earlier one, pruning
 * answers that no longer apply). Returns the new bot messages, next question and result.
 */
export async function submitAnswer(sessionId, questionId, rawValue) {
  const row = getSessionRow(sessionId);
  if (!row) throw new AnswerError('Session not found.');
  if (row.status === 'completed') throw new AnswerError('This assessment is already complete. Start a new one to answer again.');

  const q = getQuestion(questionId);
  if (!q) throw new AnswerError('Unknown question.');
  const answers = getAnswerMap(sessionId);
  const current = nextQuestion(answers);
  if (!(questionId in answers) && current?.id !== questionId) throw new AnswerError('Please answer the current question first.');
  if (q.when && !q.when(answers)) throw new AnswerError('That question does not apply.');

  let parsed;
  try {
    parsed = validateAnswer(q, rawValue);
  } catch (err) {
    throw new AnswerError(err.message);
  }

  const botMessages = [];
  const ts = now();
  const questionText = presentQuestion(q, answers).text;

  tx(() => {
    stmts.upsertAnswer.run(sessionId, q.id, q.section, questionText, JSON.stringify(parsed.value), parsed.label, parsed.score, ts);
    // Drop later answers that no longer apply after a change.
    const updated = { ...answers, [q.id]: parsed.value };
    const kept = prunedAnswers(updated);
    for (const id of Object.keys(updated)) if (!(id in kept)) stmts.deleteAnswer.run(sessionId, id);

    const sets = ['updated_at = ?', 'last_seen_at = ?'];
    const params = [ts, ts];
    if (PROFILE_FIELDS[q.id]) {
      sets.push(`${PROFILE_FIELDS[q.id]} = ?`);
      params.push(parsed.value === '' ? null : parsed.value);
    }
    db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).run(...params, sessionId);
  });

  addMessage(sessionId, 'user', parsed.label, { questionId: q.id });

  if (q.id === 'red_flags' && Array.isArray(parsed.value) && !parsed.value.includes('none')) {
    botMessages.push(addMessage(sessionId, 'bot',
      'IMPORTANT: what you selected can be a dental or medical emergency. Please seek emergency care now - go to the nearest emergency department or call emergency services. You can finish this check afterwards; our team has been alerted.',
      { kind: 'alert' }));
    events.emit('session', { type: 'red_flag', sessionId });
  }

  const latest = getAnswerMap(sessionId);
  const next = nextQuestion(latest);
  events.emit('session', { type: 'answered', sessionId, questionId: q.id });

  if (next) {
    const presented = presentQuestion(next, latest);
    botMessages.push(addMessage(sessionId, 'bot', presented.text, { questionId: next.id }));
    return { botMessages, question: presented, result: null };
  }

  const result = await completeSession(sessionId, latest);
  botMessages.push(addMessage(sessionId, 'bot', `Thanks${latest.name ? `, ${latest.name}` : ''}! Your assessment is complete. Here are your results.`, { kind: 'result' }));
  return { botMessages, question: null, result };
}

async function completeSession(sessionId, answers) {
  const result = computeResult(answers);
  const ts = now();
  const summary = ruleBasedSummary(answers, result);
  db.prepare(`UPDATE sessions SET status = 'completed', completed_at = ?, updated_at = ?, ohat_total = ?, triage_level = ?,
              top_condition = ?, result_json = ?, summary = ?, summary_source = 'rules' WHERE id = ?`)
    .run(ts, ts, result.ohatTotal, result.level, result.conditions[0]?.name || null, JSON.stringify(result), summary, sessionId);
  events.emit('session', { type: 'completed', sessionId });

  // The AI summary is written in the background so the patient sees results immediately.
  const lines = getAnswerRows(sessionId).map((a) => `- ${a.question_id}: ${a.label}`);
  clinicianSummary(lines, result).then((text) => {
    if (!text) return;
    db.prepare("UPDATE sessions SET summary = ?, summary_source = 'ai' WHERE id = ?").run(text, sessionId);
    events.emit('session', { type: 'summary', sessionId });
  });
  return result;
}

// Short plain-text context of answers so far, for the AI chat.
export function answerContext(sessionId) {
  return getAnswerRows(sessionId)
    .filter((a) => !['name', 'contact'].includes(a.question_id))
    .map((a) => `${a.question_id}: ${a.label}`)
    .join('\n');
}

export function chatHistory(sessionId) {
  return getMessages(sessionId)
    .filter((m) => m.meta?.kind === 'question' || m.sender === 'ai')
    .map((m) => ({ role: m.sender === 'ai' ? 'assistant' : 'user', content: m.text }));
}

export function sessionDetail(sessionId) {
  const row = getSessionRow(sessionId);
  if (!row) return null;
  return {
    ...row,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    result_json: undefined,
    answers: getAnswerRows(sessionId),
    messages: getMessages(sessionId),
    appointments: plainAll(stmts.appointmentsFor.all(sessionId)),
  };
}
