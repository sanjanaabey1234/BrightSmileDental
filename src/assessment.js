// Oral health self-assessment: question flow, OHAT scoring, triage and condition prediction.
//
// The eight scored categories follow the Oral Health Assessment Tool (OHAT, Chalmers et al. 2005,
// adapted from the BOHSE): lips, tongue, gums & tissues, saliva, natural teeth, dentures,
// oral cleanliness and dental pain - each scored 0 (healthy), 1 (changes) or 2 (unhealthy).
// Questions are reworded in plain language so a patient or carer can answer them.
//
// Action thresholds (from the OHAT protocol):
//   all 0          -> continue standard daily oral hygiene
//   any 1          -> enhanced self-care measures
//   any 2          -> prompt dental referral / medical evaluation
// On top of OHAT we add red-flag triage (emergencies) and a transparent, rule-based
// condition predictor. It is a screening aid, not a diagnosis.

import { langPack, msg, errorText } from './i18n/index.js';

export const OHAT_CATEGORIES = [
  { key: 'lips', label: 'Lips' },
  { key: 'tongue', label: 'Tongue' },
  { key: 'gums', label: 'Gums & oral tissues' },
  { key: 'saliva', label: 'Saliva' },
  { key: 'teeth', label: 'Natural teeth' },
  { key: 'dentures', label: 'Dentures' },
  { key: 'cleanliness', label: 'Oral cleanliness' },
  { key: 'pain', label: 'Dental pain' },
];

// "your" or "their" depending on who the assessment is for.
const isOther = (a) => a.for_whom === 'other';
const t = (self, other) => (a) => (isOther(a) ? other : self);
const has = (a, qid, value) => Array.isArray(a[qid]) && a[qid].includes(value);
const wearsDentures = (a) => a.denture_use === 'partial' || a.denture_use === 'full';

export const QUESTIONS = [
  // ---- About the patient ----
  {
    id: 'name', section: 'About you', type: 'text', maxLength: 80,
    text: "Hi! I'm SELF DOC, the clinic's oral health assistant. I'll ask a few quick questions (about 3 minutes) based on the standard Oral Health Assessment Tool, then show you what might be going on and what to do next.\n\nFirst, what's your name?",
    placeholder: 'Your first name',
  },
  {
    id: 'for_whom', section: 'About you', type: 'single',
    text: (a) => `Thanks, ${a.name}. Who is this assessment for?`,
    options: [
      { value: 'self', label: 'Myself' },
      { value: 'other', label: 'Someone I care for (child, parent, resident)' },
    ],
  },
  {
    id: 'age_group', section: 'About you', type: 'single',
    text: t('What is your age group?', 'What is their age group?'),
    options: [
      { value: 'child', label: 'Under 12', tags: ['age:child'] },
      { value: 'teen', label: '12-17', tags: ['age:teen'] },
      { value: 'adult', label: '18-39', tags: ['age:adult'] },
      { value: 'middle', label: '40-64', tags: ['age:40plus'] },
      { value: 'senior', label: '65 or older', tags: ['age:40plus', 'age:65plus'] },
    ],
  },
  {
    id: 'main_concern', section: 'About you', type: 'single',
    text: t('What is the main reason for checking today?', 'What is the main concern for them today?'),
    options: [
      { value: 'pain', label: 'Toothache or pain' },
      { value: 'gums', label: 'Bleeding or sore gums' },
      { value: 'dry_mouth', label: 'Dry mouth' },
      { value: 'breath', label: 'Bad breath' },
      { value: 'denture', label: 'Denture problem' },
      { value: 'sore', label: 'Mouth sore, patch or lump' },
      { value: 'tooth', label: 'Broken or decayed tooth' },
      { value: 'routine', label: 'Just a routine check' },
    ],
  },
  {
    id: 'contact', section: 'About you', type: 'text', optional: true, maxLength: 120,
    text: 'What is the best phone number or email for our team to follow up? (Optional - type "skip" to leave it out.)',
    placeholder: 'Phone or email',
  },

  // ---- Red flags (triage first) ----
  {
    id: 'red_flags', section: 'Safety check', type: 'multi', exclusive: 'none',
    text: t('Before we start: do you have any of these RIGHT NOW?', 'Before we start: do they have any of these RIGHT NOW?'),
    options: [
      { value: 'spreading_swelling', label: 'Face or jaw swelling spreading toward the eye or neck', tags: ['rf:swelling', 'rf:emergency'] },
      { value: 'breathing', label: 'Difficulty breathing or swallowing', tags: ['rf:airway', 'rf:emergency'] },
      { value: 'fever', label: 'Fever together with tooth or gum swelling', tags: ['rf:fever', 'rf:emergency'] },
      { value: 'bleeding', label: "Bleeding that won't stop after 15 minutes of pressure", tags: ['rf:bleeding', 'rf:emergency'] },
      { value: 'trauma', label: 'Injury, or a knocked-out / badly broken tooth', tags: ['rf:trauma', 'rf:emergency'] },
      { value: 'none', label: 'None of these' },
    ],
  },

  // ---- OHAT 8 categories ----
  {
    id: 'lips', section: 'Oral health check', type: 'single', ohat: 'lips',
    text: t('1/8 - Lips. How do your lips look and feel?', '1/8 - Lips. How do their lips look?'),
    options: [
      { value: 'healthy', label: 'Smooth, pink and moist', score: 0 },
      { value: 'dry', label: 'Dry or chapped', score: 1, tags: ['lips:dry'] },
      { value: 'corners', label: 'Cracked, red or sore at the corners', score: 1, tags: ['lips:corners'] },
      { value: 'severe', label: 'Swollen, ulcer/sore, or bleeding', score: 2, tags: ['lips:severe', 'lesion'] },
    ],
  },
  {
    id: 'tongue', section: 'Oral health check', type: 'single', ohat: 'tongue',
    text: '2/8 - Tongue. Look in a mirror: how does the tongue look?',
    options: [
      { value: 'healthy', label: 'Pink, moist, normal', score: 0 },
      { value: 'coated', label: 'Lightly coated (white/yellow film)', score: 1, tags: ['tongue:coated'] },
      { value: 'patchy', label: 'Patchy, or with deep grooves/cracks', score: 1, tags: ['tongue:patchy'] },
      { value: 'red_white', label: 'Bright red, or white patches', score: 2, tags: ['tongue:red_white', 'patch'] },
      { value: 'ulcer', label: 'Ulcers, or swollen', score: 2, tags: ['tongue:ulcer', 'lesion'] },
    ],
  },
  {
    id: 'gums', section: 'Oral health check', type: 'single', ohat: 'gums',
    text: '3/8 - Gums and inside of the mouth. Which best describes them?',
    options: [
      { value: 'healthy', label: 'Pink, firm, no bleeding', score: 0 },
      { value: 'bleed_brushing', label: 'Bleed when brushing or flossing', score: 1, tags: ['gums:bleed_brush', 'gums:inflamed'] },
      { value: 'red_swollen', label: 'Red, puffy or swollen in places', score: 1, tags: ['gums:inflamed'] },
      { value: 'sore_spot', label: 'One or two sore spots', score: 1, tags: ['gums:sore_spot'] },
      { value: 'severe', label: 'Bleed on their own, pus, deep sores or widespread redness', score: 2, tags: ['gums:severe', 'gums:inflamed'] },
    ],
  },
  {
    id: 'saliva', section: 'Oral health check', type: 'single', ohat: 'saliva',
    text: t('4/8 - Saliva. How does your mouth feel most of the time?', '4/8 - Saliva. How does their mouth look and feel?'),
    options: [
      { value: 'healthy', label: 'Moist, saliva flows normally', score: 0 },
      { value: 'dry', label: 'Dry or sticky', score: 1, tags: ['dry_mouth'] },
      { value: 'very_dry', label: 'Very dry, thick/stringy saliva, hard to swallow dry food', score: 2, tags: ['dry_mouth', 'dry_mouth:severe'] },
    ],
  },
  {
    id: 'teeth', section: 'Oral health check', type: 'single', ohat: 'teeth',
    text: t('5/8 - Natural teeth. How many teeth are decayed, broken or very worn?', '5/8 - Natural teeth. How many of their teeth are decayed, broken or very worn?'),
    options: [
      { value: 'none', label: 'None that I know of', score: 0 },
      { value: 'few', label: '1 to 3 teeth', score: 1, tags: ['teeth:damaged'] },
      { value: 'many', label: '4 or more teeth', score: 2, tags: ['teeth:damaged', 'teeth:many'] },
      { value: 'few_left', label: 'Fewer than 4 natural teeth left', score: 2, tags: ['teeth:few_left'] },
      { value: 'no_teeth', label: 'No natural teeth', score: 0, tags: ['teeth:edentulous'] },
    ],
  },
  {
    id: 'denture_use', section: 'Oral health check', type: 'single',
    text: t('Do you wear dentures (false teeth)?', 'Do they wear dentures (false teeth)?'),
    options: [
      { value: 'no', label: 'No' },
      { value: 'partial', label: 'Yes, a partial denture', tags: ['dentures'] },
      { value: 'full', label: 'Yes, full dentures', tags: ['dentures'] },
    ],
  },
  {
    id: 'dentures', section: 'Oral health check', type: 'single', ohat: 'dentures', when: wearsDentures,
    text: '6/8 - Dentures. How are they?',
    options: [
      { value: 'good', label: 'Intact, fit well, worn comfortably', score: 0 },
      { value: 'minor', label: 'Loose, a small chip, or only worn a few hours', score: 1, tags: ['denture:issue'] },
      { value: 'major', label: 'Broken, missing teeth, or not worn because they hurt', score: 2, tags: ['denture:issue', 'denture:major'] },
    ],
  },
  {
    id: 'cleanliness', section: 'Oral health check', type: 'single', ohat: 'cleanliness',
    text: (a) => `${wearsDentures(a) ? '7/8' : '6/7'} - Cleanliness. After a normal brush, how clean is the mouth?`,
    options: [
      { value: 'clean', label: 'Clean, no food or build-up', score: 0 },
      { value: 'some', label: 'Some food/plaque in a few places, or mild bad breath', score: 1, tags: ['plaque', 'breath'] },
      { value: 'heavy', label: 'Lots of food, plaque or tartar, or strong bad breath', score: 2, tags: ['plaque', 'plaque:heavy', 'breath', 'breath:strong'] },
    ],
  },
  {
    id: 'pain', section: 'Oral health check', type: 'single', ohat: 'pain',
    text: (a) => `${wearsDentures(a) ? '8/8' : '7/7'} - Pain. Is there any dental or mouth pain?`,
    options: [
      { value: 'none', label: 'No pain', score: 0 },
      { value: 'mild', label: 'Mild or comes and goes / avoid chewing on one side', score: 1, tags: ['pain'] },
      { value: 'severe', label: 'Severe or constant / hard to eat or sleep', score: 2, tags: ['pain', 'pain:severe'] },
    ],
  },
  {
    id: 'pain_level', section: 'Pain details', type: 'scale', min: 0, max: 10,
    when: (a) => a.pain && a.pain !== 'none',
    text: 'On a scale of 0 (none) to 10 (worst imaginable), how bad is the pain at its worst?',
  },
  {
    id: 'pain_type', section: 'Pain details', type: 'multi',
    when: (a) => a.pain && a.pain !== 'none',
    text: 'What is the pain like? Choose all that apply.',
    options: [
      { value: 'sensitive', label: 'Short sharp twinge with cold or sweet', tags: ['pain:sensitive'] },
      { value: 'lingering', label: 'Pain that lingers after hot or cold', tags: ['pain:lingering'] },
      { value: 'throbbing', label: 'Throbbing, keeps me awake', tags: ['pain:throbbing'] },
      { value: 'biting', label: 'Sharp pain when biting down', tags: ['pain:biting'] },
      { value: 'gum', label: 'Pain in the gum, not the tooth', tags: ['pain:gum'] },
      { value: 'jaw', label: 'Jaw/ear pain or clicking', tags: ['pain:jaw'] },
    ],
  },

  // ---- Other symptoms ----
  {
    id: 'symptoms', section: 'Other symptoms', type: 'multi', exclusive: 'none',
    text: t('Have you noticed any of these? Choose all that apply.', 'Have you noticed any of these in them? Choose all that apply.'),
    options: [
      { value: 'receding', label: 'Gums pulling back / teeth look longer', tags: ['gums:receding'] },
      { value: 'loose', label: 'Loose or shifting teeth', tags: ['teeth:loose'] },
      { value: 'pus_taste', label: 'Bad taste or pus near a tooth', tags: ['pus'] },
      { value: 'bad_breath', label: 'Bad breath most days', tags: ['breath'] },
      { value: 'hole', label: 'Visible hole, dark spot or chipped tooth', tags: ['teeth:cavity'] },
      { value: 'ulcer', label: 'Mouth ulcer or sore', tags: ['lesion', 'ulcer'] },
      { value: 'patch', label: 'White or red patch', tags: ['patch'] },
      { value: 'lump', label: 'Lump or thickened area', tags: ['lump'] },
      { value: 'grinding', label: 'Grinding or clenching teeth', tags: ['grinding'] },
      { value: 'burning', label: 'Burning feeling in the mouth', tags: ['burning'] },
      { value: 'none', label: 'None of these' },
    ],
  },
  {
    id: 'duration', section: 'Other symptoms', type: 'single',
    when: (a) => (a.symptoms && a.symptoms.some((s) => s !== 'none')) || (a.pain && a.pain !== 'none') || a.gums !== 'healthy',
    text: 'How long has the main problem been going on?',
    options: [
      { value: 'days', label: 'Less than 3 days', tags: ['dur:short'] },
      { value: 'weeks', label: '3 days to 2 weeks', tags: ['dur:short'] },
      { value: 'month', label: '2 to 6 weeks', tags: ['dur:2w_plus'] },
      { value: 'long', label: 'More than 6 weeks', tags: ['dur:2w_plus', 'dur:6w_plus'] },
    ],
  },

  // ---- Risk factors & habits ----
  {
    id: 'risk_factors', section: 'Health & habits', type: 'multi', exclusive: 'none',
    text: t('Do any of these apply to you?', 'Do any of these apply to them?'),
    options: [
      { value: 'tobacco', label: 'Smoke, vape, or chew tobacco/betel', tags: ['risk:tobacco'] },
      { value: 'diabetes', label: 'Diabetes', tags: ['risk:diabetes'] },
      { value: 'dry_meds', label: 'Medicines that dry the mouth (blood pressure, antidepressants, allergy)', tags: ['risk:dry_meds'] },
      { value: 'cancer_tx', label: 'Recent radiotherapy or chemotherapy', tags: ['risk:cancer_tx'] },
      { value: 'pregnant', label: 'Pregnant', tags: ['risk:pregnant'] },
      { value: 'sugar', label: 'Sugary snacks or drinks 3+ times a day', tags: ['risk:sugar'] },
      { value: 'blood_thinner', label: 'Heart condition or blood thinners', tags: ['risk:blood_thinner'] },
      { value: 'none', label: 'None of these' },
    ],
  },
  {
    id: 'brushing', section: 'Health & habits', type: 'single',
    text: 'How often are the teeth (or dentures) brushed?',
    options: [
      { value: 'twice', label: 'Twice a day or more' },
      { value: 'once', label: 'Once a day', tags: ['hyg:brush_once'] },
      { value: 'less', label: 'Less than once a day', tags: ['hyg:brush_rare'] },
    ],
  },
  {
    id: 'interdental', section: 'Health & habits', type: 'single',
    text: 'How often is flossing or interdental brushing done?',
    options: [
      { value: 'daily', label: 'Daily' },
      { value: 'sometimes', label: 'Sometimes' },
      { value: 'never', label: 'Never', tags: ['hyg:no_floss'] },
    ],
  },
  {
    id: 'last_visit', section: 'Health & habits', type: 'single',
    text: 'When was the last dental check-up?',
    options: [
      { value: 'lt6m', label: 'Within 6 months' },
      { value: '6to12m', label: '6-12 months ago' },
      { value: '1to2y', label: '1-2 years ago', tags: ['visit:overdue'] },
      { value: 'gt2y', label: 'More than 2 years / never', tags: ['visit:overdue', 'visit:long'] },
    ],
  },
  {
    id: 'notes', section: 'Anything else', type: 'text', optional: true, maxLength: 600,
    text: 'Last one: anything else you want the dentist to know? (Optional - type "skip" if nothing.)',
    placeholder: 'e.g. lower left molar hurts when I drink cold water',
  },
];

const byId = new Map(QUESTIONS.map((q) => [q.id, q]));
export const getQuestion = (id) => byId.get(id);

const resolveText = (q, answers) => (typeof q.text === 'function' ? q.text(answers) : q.text);

// "6/7" or "7/8" style step numbers for questions whose position depends on wearing dentures.
const stepOf = (a, id) => ({ cleanliness: wearsDentures(a) ? '7/8' : '6/7', pain: wearsDentures(a) ? '8/8' : '7/7' }[id]);

// Translated question text: a string, { self, other }, or a function of (answers, step).
function resolvePackText(text, q, a) {
  if (typeof text === 'function') return text(a, stepOf(a, q.id));
  if (text && typeof text === 'object') return isOther(a) ? text.other : text.self;
  return text;
}

export function questionText(q, answers, lang = 'en') {
  const packed = langPack(lang)?.questions?.[q.id]?.text;
  return packed ? resolvePackText(packed, q, answers) : resolveText(q, answers);
}

export function optionLabel(q, value, lang = 'en') {
  const opt = q.options?.find((o) => o.value === value);
  if (!opt) return String(value);
  return langPack(lang)?.questions?.[q.id]?.options?.[value] || opt.label;
}

// How a stored answer reads in a given language (used for the patient's chat bubbles).
export function answerLabel(q, value, lang = 'en') {
  if (q.type === 'single') return optionLabel(q, value, lang);
  if (q.type === 'multi') return (Array.isArray(value) ? value : [value]).map((v) => optionLabel(q, v, lang)).join('; ');
  if (q.type === 'scale') return `${value}/10`;
  return value === '' ? msg(lang, 'skipped') : String(value);
}

// Public, serialisable view of a question for the client, in the requested language.
export function presentQuestion(q, answers, lang = 'en') {
  const pack = langPack(lang);
  const visible = QUESTIONS.filter((x) => !x.when || x.when(answers));
  return {
    id: q.id,
    section: pack?.sections?.[q.section] || q.section,
    type: q.type,
    text: questionText(q, answers, lang),
    options: q.options?.map(({ value }) => ({ value, label: optionLabel(q, value, lang) })),
    exclusive: q.exclusive,
    optional: Boolean(q.optional),
    placeholder: pack?.questions?.[q.id]?.placeholder || q.placeholder,
    min: q.min,
    max: q.max,
    progress: { index: visible.indexOf(q) + 1, total: visible.length },
  };
}

export function nextQuestion(answers) {
  return QUESTIONS.find((q) => !(q.id in answers) && (!q.when || q.when(answers))) || null;
}

const SKIP_WORDS = new Set(['skip', 'no', 'none', 'nothing', 'n/a', 'na', '-', 'මඟ හරින්න', 'මඟහරින්න', 'නැත', 'නෑ', 'தவிர்', 'இல்லை']);

/**
 * Validates a raw answer. Returns { value, label, score } where `label` is the English
 * (canonical) wording stored for the dental team. Throws with a message in `lang`.
 */
export function validateAnswer(q, raw, lang = 'en') {
  if (q.type === 'text') {
    const text = String(raw ?? '').trim().slice(0, q.maxLength || 500);
    if (!text) {
      if (q.optional) return { value: '', label: '(skipped)', score: null };
      throw new Error(errorText(lang, 'typeAnswer'));
    }
    if (q.optional && SKIP_WORDS.has(text.toLowerCase())) return { value: '', label: '(skipped)', score: null };
    return { value: text, label: text, score: null };
  }
  if (q.type === 'scale') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < q.min || n > q.max) throw new Error(errorText(lang, 'range', q.min, q.max));
    return { value: n, label: `${n}/10`, score: null };
  }
  if (q.type === 'single') {
    const opt = q.options.find((o) => o.value === raw);
    if (!opt) throw new Error(errorText(lang, 'chooseOne'));
    return { value: opt.value, label: opt.label, score: opt.score ?? null };
  }
  if (q.type === 'multi') {
    const values = [...new Set(Array.isArray(raw) ? raw : [raw])];
    const opts = values.map((v) => q.options.find((o) => o.value === v));
    if (!values.length || opts.some((o) => !o)) throw new Error(errorText(lang, 'chooseSome'));
    let chosen = opts;
    if (q.exclusive && values.includes(q.exclusive) && values.length > 1) {
      chosen = opts.filter((o) => o.value !== q.exclusive);
    }
    return { value: chosen.map((o) => o.value), label: chosen.map((o) => o.label).join('; '), score: null };
  }
  throw new Error(errorText(lang, 'unknown'));
}

// When an earlier answer changes, later conditional answers that are no longer applicable are pruned.
export function prunedAnswers(answers) {
  const kept = {};
  for (const q of QUESTIONS) {
    if (!(q.id in answers)) continue;
    if (q.when && !q.when(kept)) continue;
    kept[q.id] = answers[q.id];
  }
  return kept;
}

// ---------- Scoring & prediction ----------

function collectTags(answers) {
  const tags = new Set();
  for (const q of QUESTIONS) {
    const v = answers[q.id];
    if (v === undefined || !q.options) continue;
    for (const val of Array.isArray(v) ? v : [v]) {
      const opt = q.options.find((o) => o.value === val);
      opt?.tags?.forEach((tg) => tags.add(tg));
    }
  }
  const pl = Number(answers.pain_level);
  if (pl >= 7) tags.add('pain:high');
  else if (pl >= 4) tags.add('pain:moderate');
  if (wearsDentures(answers)) tags.add('dentures');
  if (tags.has('lesion') || tags.has('patch') || tags.has('lump')) tags.add('lesion:any');
  return tags;
}

// Each condition: weighted evidence tags -> confidence. `requires` gates a condition on at least one tag.
// Names and descriptions are in EN_RESULT.conditions (and the language packs).
const CONDITIONS = [
  {
    id: 'gingivitis', urgency: 'routine',
    requires: ['gums:inflamed', 'gums:bleed_brush'],
    weights: { 'gums:bleed_brush': 40, 'gums:inflamed': 25, plaque: 15, 'hyg:no_floss': 10, 'hyg:brush_once': 5, 'hyg:brush_rare': 10, 'risk:pregnant': 10, 'risk:diabetes': 5 },
    penalties: { 'teeth:loose': 15, 'gums:receding': 10 },
  },
  {
    id: 'periodontitis', urgency: 'soon',
    // Plain bleeding/redness alone points to gingivitis; bone-loss signs are needed here.
    requires: ['gums:receding', 'teeth:loose', 'gums:severe'],
    weights: { 'teeth:loose': 35, 'gums:receding': 25, 'gums:severe': 25, pus: 15, 'gums:inflamed': 10, 'risk:tobacco': 12, 'risk:diabetes': 12, 'age:40plus': 5, 'visit:long': 5, 'plaque:heavy': 10, breath: 5 },
  },
  {
    id: 'caries', urgency: 'soon',
    requires: ['teeth:damaged', 'teeth:cavity', 'pain:sensitive', 'pain:lingering'],
    weights: { 'teeth:cavity': 40, 'teeth:damaged': 30, 'teeth:many': 10, 'pain:sensitive': 15, 'pain:lingering': 10, 'risk:sugar': 15, dry_mouth: 8, 'hyg:brush_rare': 10, 'hyg:brush_once': 5, 'visit:overdue': 5 },
  },
  {
    id: 'infection', urgency: 'urgent',
    requires: ['pain:throbbing', 'pain:lingering', 'pus', 'rf:swelling', 'rf:fever', 'pain:severe'],
    weights: { 'pain:throbbing': 35, 'pain:lingering': 25, pus: 25, 'rf:swelling': 35, 'rf:fever': 30, 'pain:severe': 20, 'pain:high': 15, 'pain:biting': 10, 'teeth:cavity': 10 },
  },
  {
    id: 'sensitivity', urgency: 'routine',
    requires: ['pain:sensitive'],
    weights: { 'pain:sensitive': 45, 'gums:receding': 15, grinding: 15, 'teeth:damaged': 5 },
    penalties: { 'pain:throbbing': 20, 'pain:lingering': 15 },
  },
  {
    id: 'cracked', urgency: 'soon',
    requires: ['pain:biting'],
    weights: { 'pain:biting': 45, grinding: 15, 'teeth:cavity': 5, 'pain:sensitive': 5 },
  },
  {
    id: 'xerostomia', urgency: 'routine',
    requires: ['dry_mouth'],
    weights: { dry_mouth: 45, 'dry_mouth:severe': 20, 'risk:dry_meds': 20, 'risk:cancer_tx': 20, 'age:65plus': 5, 'lips:dry': 5, burning: 10 },
  },
  {
    id: 'candidiasis', urgency: 'soon',
    requires: ['tongue:red_white', 'patch', 'burning'],
    weights: { 'tongue:red_white': 30, patch: 20, dentures: 15, dry_mouth: 10, 'risk:diabetes': 10, 'risk:cancer_tx': 10, 'risk:tobacco': 5, burning: 15, 'lips:corners': 10 },
  },
  {
    id: 'angular_cheilitis', urgency: 'routine',
    requires: ['lips:corners'],
    weights: { 'lips:corners': 50, dentures: 15, dry_mouth: 8, 'risk:diabetes': 5, 'age:65plus': 5 },
  },
  {
    id: 'denture_problem', urgency: 'soon',
    requires: ['denture:issue'],
    weights: { 'denture:issue': 45, 'denture:major': 20, 'gums:sore_spot': 15, 'lips:corners': 5 },
  },
  {
    id: 'halitosis', urgency: 'routine',
    requires: ['breath'],
    weights: { breath: 35, 'breath:strong': 10, 'tongue:coated': 15, plaque: 10, dry_mouth: 10, 'gums:inflamed': 10, 'risk:tobacco': 10, 'hyg:no_floss': 5 },
  },
  {
    id: 'ulcer', urgency: 'routine',
    requires: ['ulcer', 'tongue:ulcer', 'lips:severe'],
    weights: { ulcer: 40, 'tongue:ulcer': 20, 'lips:severe': 10, 'dur:short': 15 },
    penalties: { 'dur:2w_plus': 30 },
  },
  {
    id: 'lesion_review', urgency: 'urgent',
    requires: ['lesion:any'],
    gate: (tags) => tags.has('dur:2w_plus') || tags.has('lump'),
    weights: { 'lesion:any': 30, 'dur:2w_plus': 30, 'dur:6w_plus': 10, lump: 20, patch: 10, 'risk:tobacco': 15, 'age:40plus': 5 },
  },
  {
    id: 'tmd', urgency: 'routine',
    requires: ['pain:jaw', 'grinding'],
    weights: { 'pain:jaw': 45, grinding: 30 },
  },
];

const URGENCY_RANK = { urgent: 3, soon: 2, routine: 1 };

// Returns language-neutral predictions (ids and evidence tags); text is added in computeResult.
function predictConditions(tags) {
  const results = [];
  for (const c of CONDITIONS) {
    if (!c.requires.some((tg) => tags.has(tg))) continue;
    if (c.gate && !c.gate(tags)) continue;
    let sum = 0;
    const evidence = [];
    for (const [tg, w] of Object.entries(c.weights)) {
      if (tags.has(tg)) { sum += w; evidence.push(tg); }
    }
    for (const [tg, w] of Object.entries(c.penalties || {})) if (tags.has(tg)) sum -= w;
    if (sum <= 0) continue;
    // Saturating map from evidence weight to a 0-95% likelihood.
    const confidence = Math.min(95, Math.round(100 * (1 - Math.exp(-sum / 45))));
    if (confidence < 35) continue;
    results.push({
      id: c.id,
      urgency: c.urgency,
      confidence,
      likelihoodKey: confidence >= 75 ? 'likely' : confidence >= 55 ? 'possible' : 'less',
      evidenceTags: evidence,
    });
  }
  return results.sort((a, b) => b.confidence - a.confidence || URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency]).slice(0, 5);
}

// English result wording; the si/ta packs mirror these keys under `result`.
const EN_RESULT = {
  levels: {
    emergency: {
      label: 'Emergency', timeframe: 'Now',
      action: 'Seek emergency care immediately. Go to the nearest emergency department or call emergency services - especially for breathing or swallowing difficulty or spreading swelling.',
    },
    urgent: {
      label: 'See a dentist promptly', timeframe: 'Within 24-72 hours',
      action: 'One or more areas scored "unhealthy" (2). The OHAT protocol recommends a prompt dental referral or medical evaluation.',
    },
    attention: {
      label: 'Enhanced self-care + check-up', timeframe: 'Check-up within 2-4 weeks',
      action: 'Some changes were found (score 1). Start the enhanced self-care steps below and book a routine check-up.',
    },
    healthy: {
      label: 'Healthy', timeframe: 'Routine check-up every 6-12 months',
      action: 'All areas look healthy. Continue standard daily oral hygiene.',
    },
  },
  categories: Object.fromEntries(OHAT_CATEGORIES.map(({ key, label }) => [key, label])),
  noDentures: 'No dentures',
  notAnswered: 'Not answered',
  conditions: {
    gingivitis: { name: 'Gingivitis (gum inflammation)', about: 'Early, reversible gum inflammation caused by plaque build-up along the gumline.' },
    periodontitis: { name: 'Periodontitis (gum disease affecting bone)', about: 'Advanced gum disease where the gum and bone supporting the teeth are being lost.' },
    caries: { name: 'Tooth decay (dental caries)', about: 'Cavities caused by acid from bacteria feeding on sugars, which slowly destroy tooth structure.' },
    infection: { name: 'Tooth nerve inflammation or dental abscess', about: 'Decay or a crack reaching the nerve (pulpitis) or an infection at the root tip or gum (abscess). Does not heal by itself.' },
    sensitivity: { name: 'Tooth sensitivity / tooth wear', about: 'Exposed dentine (from gum recession, worn enamel or grinding) reacting to cold, sweet or touch.' },
    cracked: { name: 'Cracked tooth', about: 'A crack in the tooth that hurts sharply when biting and releasing.' },
    xerostomia: { name: 'Dry mouth (xerostomia)', about: 'Reduced saliva, often from medicines, dehydration or medical treatment. It raises the risk of decay and infection.' },
    candidiasis: { name: 'Oral thrush (candidiasis) / denture stomatitis', about: 'A yeast (Candida) overgrowth causing white or red patches, soreness or burning, more common with dentures, dry mouth or diabetes.' },
    angular_cheilitis: { name: 'Angular cheilitis (sore mouth corners)', about: 'Cracked, inflamed corners of the mouth, often from yeast, saliva pooling, or ill-fitting dentures.' },
    denture_problem: { name: 'Denture fit or damage problem', about: 'Loose, damaged or painful dentures, which can cause sores, eating problems and infection.' },
    halitosis: { name: 'Persistent bad breath (halitosis)', about: 'Usually from bacteria on the tongue and between teeth, gum disease, or dry mouth.' },
    ulcer: { name: 'Mouth ulcer (likely minor / aphthous)', about: 'Common, painful round sores that usually heal by themselves within 1-2 weeks.' },
    lesion_review: { name: 'Mouth lesion needing professional examination', about: 'An ulcer, patch or lump lasting more than 2 weeks must be checked by a dentist or doctor to rule out serious causes, including oral cancer.' },
    tmd: { name: 'Jaw joint / muscle problem (TMD) or teeth grinding', about: 'Pain or clicking in the jaw joint or chewing muscles, often linked to clenching or grinding.' },
  },
  likelihood: { likely: 'Likely', possible: 'Possible', less: 'Less likely' },
  tags: {
    'gums:bleed_brush': 'gums bleed when brushing', 'gums:inflamed': 'red or swollen gums', 'gums:severe': 'spontaneous bleeding or pus from gums',
    'gums:receding': 'receding gums', 'gums:sore_spot': 'sore spot on the gums', 'teeth:loose': 'loose teeth', 'teeth:damaged': 'decayed or broken teeth',
    'teeth:many': '4 or more damaged teeth', 'teeth:cavity': 'visible hole or dark spot', plaque: 'plaque or food build-up', 'plaque:heavy': 'heavy plaque or tartar',
    breath: 'bad breath', 'breath:strong': 'strong bad breath', pus: 'bad taste or pus', dry_mouth: 'dry mouth', 'dry_mouth:severe': 'very dry mouth',
    'pain:sensitive': 'twinge with cold or sweet', 'pain:lingering': 'pain lingers after hot/cold', 'pain:throbbing': 'throbbing pain', 'pain:biting': 'pain when biting',
    'pain:jaw': 'jaw pain or clicking', 'pain:severe': 'severe pain', 'pain:high': 'pain 7/10 or more', 'rf:swelling': 'spreading facial swelling', 'rf:fever': 'fever with swelling',
    'tongue:coated': 'coated tongue', 'tongue:red_white': 'red or white patches on tongue', 'tongue:ulcer': 'tongue ulcer or swelling', 'lips:corners': 'sore cracked mouth corners',
    'lips:dry': 'dry lips', 'lips:severe': 'lip swelling or ulcer', patch: 'white or red patch', lump: 'lump or thickened area', ulcer: 'mouth ulcer', 'lesion:any': 'mouth sore, patch or lump',
    'dur:short': 'started recently', 'dur:2w_plus': 'present for more than 2 weeks', 'dur:6w_plus': 'present for more than 6 weeks', grinding: 'grinding or clenching', burning: 'burning mouth',
    dentures: 'wears dentures', 'denture:issue': 'denture fit/damage problem', 'denture:major': 'broken or painful dentures',
    'risk:tobacco': 'tobacco or betel use', 'risk:diabetes': 'diabetes', 'risk:dry_meds': 'medicines that dry the mouth', 'risk:cancer_tx': 'radiotherapy or chemotherapy',
    'risk:pregnant': 'pregnancy', 'risk:sugar': 'frequent sugar', 'hyg:no_floss': 'no interdental cleaning', 'hyg:brush_once': 'brushing once a day', 'hyg:brush_rare': 'brushing less than daily',
    'visit:overdue': 'check-up overdue', 'visit:long': 'no check-up in 2+ years', 'age:40plus': 'age 40+', 'age:65plus': 'age 65+',
  },
  reasons: {
    redFlag: (list) => `Red flag: ${list}`,
    score2: (label, answer) => `${label} scored 2 (unhealthy): ${answer}`,
    pain: (n) => `Pain rated ${n}/10`,
    lesion: 'Mouth sore, patch or lump lasting more than 2 weeks',
    score1: (label, answer) => `${label} shows changes (1): ${answer}`,
  },
  tips: {
    lips_balm: 'Apply a lip balm or moisturiser several times a day and drink water regularly.',
    tongue_clean: 'Gently brush or scrape the tongue once a day and keep the mouth moist.',
    gums_brush: 'Brush twice daily for 2 minutes with a soft brush angled at the gumline - keep brushing even if the gums bleed.',
    gums_floss: 'Clean between teeth every day with floss or interdental brushes.',
    gums_rinse: 'Use an alcohol-free antimicrobial mouthwash (e.g. cetylpyridinium chloride) for 2 weeks.',
    saliva_sip: 'Sip water often; chew sugar-free (xylitol) gum to stimulate saliva.',
    saliva_gel: 'Try a saliva substitute gel or spray, and avoid alcohol-based mouthwash, alcohol and excess caffeine.',
    saliva_meds: 'Ask your doctor whether any of your medicines cause dry mouth.',
    teeth_fluoride: 'Use a fluoride toothpaste (1450 ppm); spit after brushing but do not rinse.',
    teeth_sugar: 'Reduce how often you have sugary snacks and drinks - keep them to mealtimes.',
    teeth_checkup: 'Book a dental check-up to have the damaged teeth assessed.',
    dentures_clean: 'Clean dentures daily with a denture brush and non-abrasive cleaner; take them out overnight and soak them.',
    dentures_fit: 'Have the fit adjusted by a dentist - do not try to fix dentures yourself.',
    clean_brush: 'Brush twice a day (an electric toothbrush helps) and clean between teeth daily.',
    clean_tongue: 'Clean the tongue daily to reduce bad breath.',
    pain_sensitive: 'Use a sensitive toothpaste (potassium nitrate or stannous fluoride) and avoid very hot or cold food.',
    pain_relief: 'Over-the-counter pain relief may help - follow the label. Never put aspirin on the gum.',
    pain_dentist: 'If the pain lasts more than a few days, see a dentist.',
    std_brush: 'Brush twice a day with fluoride toothpaste for 2 minutes.',
    std_floss: 'Clean between your teeth once a day.',
    std_sugar: 'Limit sugary food and drinks to mealtimes.',
    std_checkup: 'Have a dental check-up every 6-12 months.',
    corners: 'For sore mouth corners: keep them clean and dry, and check denture fit. See a dentist or GP if not better in 2 weeks.',
    tobacco: 'Stopping tobacco and betel use greatly lowers your risk of gum disease and mouth cancer - ask us about quit support.',
    diabetes: 'Keeping blood sugar well controlled helps your gums heal - gum disease and diabetes affect each other.',
    sugar: 'Cut down on sugary snacks and drinks between meals.',
  },
  risk: { High: 'High', Moderate: 'Moderate', Low: 'Low' },
  disclaimer: 'This is a screening tool based on the Oral Health Assessment Tool (OHAT). It is not a diagnosis. Only a dentist can diagnose after an examination.',
};

// Self-care tip ids per OHAT category that shows changes.
const SELF_CARE = {
  lips: ['lips_balm'],
  tongue: ['tongue_clean'],
  gums: ['gums_brush', 'gums_floss', 'gums_rinse'],
  saliva: ['saliva_sip', 'saliva_gel', 'saliva_meds'],
  teeth: ['teeth_fluoride', 'teeth_sugar', 'teeth_checkup'],
  dentures: ['dentures_clean', 'dentures_fit'],
  cleanliness: ['clean_brush', 'clean_tongue'],
  pain: ['pain_sensitive', 'pain_relief', 'pain_dentist'],
};
const STANDARD_CARE = ['std_brush', 'std_floss', 'std_sugar', 'std_checkup'];

const LEVEL_STATUS = { emergency: 'critical', urgent: 'serious', attention: 'warning', healthy: 'good' };

/** Computes the result. Text is in `lang`; the dental team's stored copy uses English. */
export function computeResult(answers, lang = 'en') {
  const P = langPack(lang)?.result;
  const get = (group, key) => P?.[group]?.[key] ?? EN_RESULT[group][key];
  const str = (key) => P?.[key] ?? EN_RESULT[key];

  const tags = collectTags(answers);
  const categories = OHAT_CATEGORIES.map(({ key }) => {
    const q = QUESTIONS.find((x) => x.ohat === key);
    const val = answers[key];
    const label = get('categories', key);
    if (val === undefined) return { key, label, score: null, answer: key === 'dentures' ? str('noDentures') : str('notAnswered') };
    const opt = q.options.find((o) => o.value === val);
    return { key, label, score: opt.score, answer: optionLabel(q, val, lang) };
  });
  const scored = categories.filter((c) => c.score !== null);
  const ohatTotal = scored.reduce((s, c) => s + c.score, 0);
  const maxScore = scored.length * 2;

  const conditions = predictConditions(tags).map((c) => ({
    id: c.id,
    name: get('conditions', c.id).name,
    about: get('conditions', c.id).about,
    urgency: c.urgency,
    confidence: c.confidence,
    likelihood: get('likelihood', c.likelihoodKey),
    evidence: c.evidenceTags.map((tg) => get('tags', tg) ?? tg),
  }));
  const redFlagQ = getQuestion('red_flags');
  const redFlags = (answers.red_flags || []).filter((v) => v !== 'none').map((v) => optionLabel(redFlagQ, v, lang));

  let level = 'healthy';
  if (scored.some((c) => c.score === 1)) level = 'attention';
  if (scored.some((c) => c.score === 2) || tags.has('pain:high') || conditions.some((c) => c.urgency === 'urgent' && c.confidence >= 55)) level = 'urgent';
  if (tags.has('rf:emergency')) level = 'emergency';

  const reason = (key) => P?.reasons?.[key] ?? EN_RESULT.reasons[key];
  const reasons = [];
  if (redFlags.length) reasons.push(reason('redFlag')(redFlags.join('; ')));
  scored.filter((c) => c.score === 2).forEach((c) => reasons.push(reason('score2')(c.label, c.answer)));
  if (tags.has('pain:high')) reasons.push(reason('pain')(answers.pain_level));
  if (conditions.some((c) => c.id === 'lesion_review')) reasons.push(reason('lesion'));
  scored.filter((c) => c.score === 1).forEach((c) => reasons.push(reason('score1')(c.label, c.answer)));

  const tipIds = [];
  const flagged = scored.filter((c) => c.score >= 1);
  if (!flagged.length) tipIds.push(...STANDARD_CARE);
  for (const c of flagged) for (const id of SELF_CARE[c.key] || []) if (!tipIds.includes(id)) tipIds.push(id);
  if (tags.has('lips:corners')) tipIds.push('corners');
  if (tags.has('risk:tobacco')) tipIds.push('tobacco');
  if (tags.has('risk:diabetes')) tipIds.push('diabetes');
  if (tags.has('risk:sugar') && !tipIds.includes('teeth_sugar')) tipIds.push('sugar');

  // Rough risk bands to help staff prioritise follow-up.
  const cariesRisk = bandRisk([tags.has('teeth:damaged'), tags.has('teeth:cavity'), tags.has('risk:sugar'), tags.has('dry_mouth'), tags.has('hyg:brush_rare') || tags.has('hyg:brush_once'), tags.has('visit:overdue')]);
  const perioRisk = bandRisk([tags.has('gums:inflamed'), tags.has('gums:receding'), tags.has('teeth:loose'), tags.has('risk:tobacco'), tags.has('risk:diabetes'), tags.has('plaque:heavy') || tags.has('hyg:no_floss')]);

  return {
    level,
    status: LEVEL_STATUS[level],
    ...get('levels', level),
    ohatTotal,
    maxScore,
    categories,
    conditions,
    redFlags,
    reasons,
    selfCare: tipIds.map((id) => get('tips', id)),
    risks: { caries: get('risk', cariesRisk), gum: get('risk', perioRisk) },
    lang,
    generatedAt: new Date().toISOString(),
    disclaimer: str('disclaimer'),
  };
}

function bandRisk(flags) {
  const n = flags.filter(Boolean).length;
  return n >= 4 ? 'High' : n >= 2 ? 'Moderate' : 'Low';
}

// Plain-text clinician note (English), used when the AI summary is unavailable.
export function ruleBasedSummary(answers, result) {
  const lines = [];
  const who = answers.for_whom === 'other' ? 'Carer-reported' : 'Self-reported';
  lines.push(`${who} assessment. Age group: ${getQuestion('age_group').options.find((o) => o.value === answers.age_group)?.label || '-'}. Main concern: ${getQuestion('main_concern').options.find((o) => o.value === answers.main_concern)?.label || '-'}.`);
  lines.push(`Triage: ${result.label.toUpperCase()} (${result.timeframe}). OHAT total ${result.ohatTotal}/${result.maxScore}.`);
  if (result.reasons.length) lines.push(`Key findings: ${result.reasons.slice(0, 4).join('. ')}.`);
  if (result.conditions.length) lines.push(`Possible conditions: ${result.conditions.map((c) => `${c.name} (${c.confidence}%)`).join(', ')}.`);
  lines.push(`Caries risk ${result.risks.caries}, gum disease risk ${result.risks.gum}.`);
  if (answers.notes) lines.push(`Patient note: "${answers.notes}"`);
  return lines.join(' ');
}

// Exposed for the translation completeness tests.
export const _i18nKeys = {
  tags: Object.keys(EN_RESULT.tags),
  tips: Object.keys(EN_RESULT.tips),
  conditions: CONDITIONS.map((c) => c.id),
  sections: [...new Set(QUESTIONS.map((q) => q.section))],
};
