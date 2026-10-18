// Language support: English (default), Sinhala and Tamil.
// English text lives next to the logic it belongs to; the si/ta packs mirror it by key.
import si from './si.js';
import ta from './ta.js';

export const LANGS = ['en', 'si', 'ta'];
export const LANG_NAMES = { en: 'English', si: 'Sinhala', ta: 'Tamil' };
const PACKS = { si, ta };

export const normalizeLang = (lang) => (LANGS.includes(lang) ? lang : 'en');
export const langPack = (lang) => PACKS[lang] || null;

const EN_MESSAGES = {
  alert: 'IMPORTANT: what you selected can be a dental or medical emergency. Please seek emergency care now - go to the nearest emergency department or call emergency services. You can finish this check afterwards; our team has been alerted.',
  thanks: (name) => `Thanks${name ? `, ${name}` : ''}! Your assessment is complete. Here are your results.`,
  appointment: ({ date, time, contact }) => `Appointment request received for ${date || 'the earliest available date'}${time ? ` (${time})` : ''}. Our team will contact you on ${contact} to confirm.`,
  times: { Morning: 'Morning', Afternoon: 'Afternoon', Evening: 'Evening' },
  skipped: '(skipped)',
  errors: {
    typeAnswer: 'Please type an answer.',
    range: (min, max) => `Please choose a number from ${min} to ${max}.`,
    chooseOne: 'Please choose one of the options.',
    chooseSome: 'Please choose at least one option.',
    current: 'Please answer the current question first.',
    notApply: 'That question does not apply.',
    complete: 'This assessment is already complete. Start a new one to answer again.',
    notFound: 'Session not found.',
    unknown: 'Unknown question.',
  },
};

/** A chatbot message in the given language; function entries are called with `args`. */
export function msg(lang, key, ...args) {
  const value = langPack(lang)?.messages?.[key] ?? EN_MESSAGES[key];
  return typeof value === 'function' ? value(...args) : value;
}

export function errorText(lang, key, ...args) {
  const value = langPack(lang)?.messages?.errors?.[key] ?? EN_MESSAGES.errors[key];
  return typeof value === 'function' ? value(...args) : value;
}

/** Appointment time slot (stored in English) shown in the patient's language. */
export const timeLabel = (lang, time) => (time ? msg(lang, 'times')?.[time] || time : time);
