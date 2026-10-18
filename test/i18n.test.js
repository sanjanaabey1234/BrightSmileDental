import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { QUESTIONS, OHAT_CATEGORIES, presentQuestion, computeResult, answerLabel, getQuestion, _i18nKeys } from '../src/assessment.js';
import { answerFromKnowledgeBase, _kbIds } from '../src/knowledge.js';
import { langPack, msg } from '../src/i18n/index.js';
import { DICT } from '../public/js/i18n.js';

const SINHALA = /[඀-෿]/;
const TAMIL = /[஀-௿]/;
const SCRIPT = { si: SINHALA, ta: TAMIL };

for (const lang of ['si', 'ta']) {
  const pack = langPack(lang);

  test(`${lang}: every question, option and section is translated`, () => {
    for (const q of QUESTIONS) {
      assert.ok(pack.questions[q.id]?.text, `${lang} question text missing: ${q.id}`);
      for (const o of q.options || []) assert.ok(pack.questions[q.id].options?.[o.value], `${lang} option missing: ${q.id}.${o.value}`);
      if (q.placeholder) assert.ok(pack.questions[q.id].placeholder, `${lang} placeholder missing: ${q.id}`);
    }
    for (const s of _i18nKeys.sections) assert.ok(pack.sections[s], `${lang} section missing: ${s}`);
  });

  test(`${lang}: every result text is translated`, () => {
    const r = pack.result;
    for (const lvl of ['emergency', 'urgent', 'attention', 'healthy']) assert.ok(r.levels[lvl]?.label && r.levels[lvl].action, `${lang} level ${lvl}`);
    for (const { key } of OHAT_CATEGORIES) assert.ok(r.categories[key], `${lang} category ${key}`);
    for (const id of _i18nKeys.conditions) assert.ok(r.conditions[id]?.name && r.conditions[id].about, `${lang} condition ${id}`);
    for (const tg of _i18nKeys.tags) assert.ok(r.tags[tg], `${lang} evidence tag ${tg}`);
    for (const id of _i18nKeys.tips) assert.ok(r.tips[id], `${lang} tip ${id}`);
    for (const k of ['High', 'Moderate', 'Low']) assert.ok(r.risk[k]);
    for (const k of ['likely', 'possible', 'less']) assert.ok(r.likelihood[k]);
    for (const k of ['redFlag', 'score2', 'pain', 'lesion', 'score1']) assert.ok(r.reasons[k]);
    assert.ok(r.disclaimer && r.noDentures && r.notAnswered);
  });

  test(`${lang}: chat messages and FAQ answers are translated`, () => {
    for (const k of ['alert', 'thanks', 'appointment', 'times', 'skipped', 'errors']) assert.ok(pack.messages[k], `${lang} message ${k}`);
    for (const id of _kbIds) assert.ok(pack.kb[id], `${lang} FAQ answer ${id}`);
    assert.ok(pack.kbFallback);
  });

  test(`${lang}: a full assessment reads in ${lang}`, () => {
    const answers = {
      name: 'Nimal', for_whom: 'self', age_group: 'middle', main_concern: 'gums', contact: '', red_flags: ['none'],
      lips: 'corners', tongue: 'coated', gums: 'bleed_brushing', saliva: 'dry', teeth: 'few', denture_use: 'full', dentures: 'minor',
      cleanliness: 'some', pain: 'mild', pain_level: 4, pain_type: ['sensitive'], symptoms: ['receding', 'bad_breath'], duration: 'weeks',
      risk_factors: ['diabetes', 'tobacco', 'sugar'], brushing: 'once', interdental: 'never', last_visit: 'gt2y', notes: '',
    };
    const r = computeResult(answers, lang);
    const texts = [r.label, r.timeframe, r.action, r.disclaimer, ...r.reasons, ...r.selfCare, r.risks.caries,
      ...r.categories.map((c) => c.label + c.answer), ...r.conditions.flatMap((c) => [c.name, c.about, c.likelihood, ...c.evidence])];
    for (const text of texts) assert.match(text, SCRIPT[lang], `not translated: "${text}"`);
    // Same scoring as English.
    const en = computeResult(answers, 'en');
    assert.equal(r.level, en.level);
    assert.deepEqual(r.conditions.map((c) => c.id), en.conditions.map((c) => c.id));
    // Step numbering in a function-based question text.
    assert.match(presentQuestion(getQuestion('cleanliness'), answers, lang).text, /^7\/8/);
    assert.match(answerLabel(getQuestion('symptoms'), ['receding', 'bad_breath'], lang), SCRIPT[lang]);
    assert.match(msg(lang, 'thanks', 'Nimal'), SCRIPT[lang]);
  });
}

test('FAQ understands questions typed in Sinhala and Tamil', () => {
  assert.match(answerFromKnowledgeBase('මට දත් කැක්කුමක් තියෙනවා', 'si'), SINHALA);
  assert.match(answerFromKnowledgeBase('மூச்சு விட முடியவில்லை, முகம் வீக்கம்', 'ta'), /1990/);
  assert.match(answerFromKnowledgeBase('விலை எவ்வளவு?', 'ta'), TAMIL);
  assert.match(answerFromKnowledgeBase('opening hours?', 'si'), /පේරාදෙණිය/);
});

test('website dictionary: every key exists in all three languages', () => {
  const enKeys = Object.keys(DICT.en);
  for (const lang of ['si', 'ta']) {
    const missing = enKeys.filter((k) => !DICT[lang][k]);
    assert.deepEqual(missing, [], `${lang} missing website keys`);
  }
});

test('website page: every data-i18n key is defined', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const keys = new Set();
  for (const m of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) keys.add(m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) keys.add(pair.split(':')[1].trim());
  const missing = [...keys].filter((k) => !DICT.en[k]);
  assert.deepEqual(missing, [], 'keys used in index.html but not defined');
  assert.ok(keys.size > 100, `expected the page to be fully tagged, found ${keys.size} keys`);
});
