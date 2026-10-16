// Optional Claude integration: free-text answers in the chat and clinician summaries.
// Falls back to the built-in knowledge base / rule-based summary when no API key is set
// or the API call fails, so the chatbot always works.
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { answerFromKnowledgeBase } from './knowledge.js';

const MODEL = 'claude-opus-5-5';
const client = config.anthropicEnabled ? new Anthropic() : null;

const c = config.clinic;
const CHAT_SYSTEM = `You are Brighty, the virtual oral health assistant on the website of ${c.name}, a dental clinic.
Clinic details: address ${c.address}; hours ${c.hours}; phone ${c.phone}; email ${c.email}; local emergency number ${c.emergencyNumber}.

Patients chat with you while completing an oral health self-assessment based on the Oral Health Assessment Tool (OHAT).
Answer their questions about oral health, symptoms, self-care, dental treatments and the clinic.

Rules:
- Keep answers short: 2-5 sentences of plain, friendly language. No markdown headings or tables.
- You are not a dentist and cannot diagnose. Explain likely causes in general terms and say when to see a dentist.
- If the person describes facial swelling spreading to the eye or neck, difficulty breathing or swallowing, fever with dental swelling, uncontrolled bleeding, or a serious injury, tell them to seek emergency care now (${c.emergencyNumber} or the nearest emergency department) before anything else.
- Any ulcer, white or red patch, or lump lasting more than 2 weeks needs a professional examination.
- Medication advice is limited to over-the-counter pain relief "as directed on the label"; never give doses for prescription drugs or antibiotics.
- If a question is unrelated to dental or oral health, or the clinic, politely steer back.
- Do not ask for or repeat sensitive personal details beyond what is needed.`;

const SUMMARY_SYSTEM = `You write concise clinical triage notes for dentists from a patient's self-reported OHAT-based oral health questionnaire.
Write 4-6 sentences in professional clinical language: presenting concern, positive findings by OHAT category, relevant medical/risk history, the most likely differential diagnoses with the main supporting evidence, and a recommended triage priority and next step.
Plain text only. Do not invent findings that are not in the data.`;

function textOf(response) {
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

async function callClaude({ system, messages, maxTokens }) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    output_config: { effort: 'low' },
    // On a safety decline, let the API retry on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  if (response.stop_reason === 'refusal') return null;
  return textOf(response) || null;
}

function logApiError(where, err) {
  if (err instanceof Anthropic.AuthenticationError) console.error(`[ai] ${where}: invalid API key`);
  else if (err instanceof Anthropic.RateLimitError) console.error(`[ai] ${where}: rate limited`);
  else if (err instanceof Anthropic.APIError) console.error(`[ai] ${where}: API error ${err.status}: ${err.message}`);
  else console.error(`[ai] ${where}:`, err.message);
}

/**
 * Answers a free-text question. `history` is the prior free-text Q&A in this session
 * ([{role:'user'|'assistant', content}]); `context` is a short summary of answers so far.
 * Returns { text, source: 'ai' | 'kb' }.
 */
export async function answerQuestion(question, history = [], context = '') {
  if (client) {
    try {
      const messages = [];
      for (const m of history.slice(-8)) {
        // The API requires alternating roles, starting with a user turn.
        if (!messages.length && m.role !== 'user') continue;
        if (messages.length && messages.at(-1).role === m.role) messages.at(-1).content += `\n${m.content}`;
        else messages.push({ role: m.role, content: m.content });
      }
      const userContent = context
        ? `Assessment answers so far (for context):\n${context}\n\nMy question: ${question}`
        : question;
      if (messages.length && messages.at(-1).role === 'user') messages.at(-1).content += `\n${userContent}`;
      else messages.push({ role: 'user', content: userContent });

      const text = await callClaude({ system: CHAT_SYSTEM, messages, maxTokens: 1024 });
      if (text) return { text, source: 'ai' };
    } catch (err) {
      logApiError('chat', err);
    }
  }
  return { text: answerFromKnowledgeBase(question), source: 'kb' };
}

/** Returns an AI-written clinician summary, or null if unavailable. */
export async function clinicianSummary(answerLines, result) {
  if (!client) return null;
  try {
    const data = [
      'Questionnaire answers:',
      ...answerLines,
      '',
      `Computed triage level: ${result.label} (${result.timeframe}); OHAT total ${result.ohatTotal}/${result.maxScore}.`,
      `Rule-based condition predictions: ${result.conditions.map((x) => `${x.name} ${x.confidence}%`).join('; ') || 'none'}.`,
      `Risk bands: caries ${result.risks.caries}, gum disease ${result.risks.gum}.`,
    ].join('\n');
    return await callClaude({ system: SUMMARY_SYSTEM, messages: [{ role: 'user', content: data }], maxTokens: 2048 });
  } catch (err) {
    logApiError('summary', err);
    return null;
  }
}
