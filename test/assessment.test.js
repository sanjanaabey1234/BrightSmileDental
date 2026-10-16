import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, nextQuestion, validateAnswer, computeResult, getQuestion, prunedAnswers } from '../src/assessment.js';

const healthy = {
  name: 'Ann', for_whom: 'self', age_group: 'adult', main_concern: 'routine', contact: '',
  red_flags: ['none'], lips: 'healthy', tongue: 'healthy', gums: 'healthy', saliva: 'healthy', teeth: 'none',
  denture_use: 'no', cleanliness: 'clean', pain: 'none', symptoms: ['none'], risk_factors: ['none'],
  brushing: 'twice', interdental: 'daily', last_visit: 'lt6m', notes: '',
};

// Walks the question flow with the given answers, returning only the questions that were asked.
function walk(answers) {
  const given = {};
  const asked = [];
  for (let q = nextQuestion(given); q; q = nextQuestion(given)) {
    assert.ok(q.id in answers, `no test answer for question "${q.id}"`);
    asked.push(q.id);
    given[q.id] = validateAnswer(q, answers[q.id]).value;
  }
  return { asked, given };
}

const ids = (r) => r.conditions.map((c) => c.id);

test('healthy mouth -> healthy, score 0, standard care', () => {
  const { given, asked } = walk(healthy);
  assert.ok(!asked.includes('dentures'), 'denture condition question skipped without dentures');
  assert.ok(!asked.includes('pain_level'), 'pain detail skipped without pain');
  assert.ok(!asked.includes('duration'), 'duration skipped without symptoms');
  const r = computeResult(given);
  assert.equal(r.level, 'healthy');
  assert.equal(r.ohatTotal, 0);
  assert.equal(r.maxScore, 14); // 7 categories - dentures not applicable
  assert.deepEqual(r.conditions, []);
  assert.match(r.selfCare[0], /fluoride/);
});

test('bleeding gums with plaque -> attention + gingivitis', () => {
  const { given } = walk({ ...healthy, gums: 'bleed_brushing', cleanliness: 'some', interdental: 'never', symptoms: ['none'], duration: 'weeks' });
  const r = computeResult(given);
  assert.equal(r.level, 'attention');
  assert.equal(r.conditions[0].id, 'gingivitis');
  assert.ok(r.conditions[0].confidence >= 75);
});

test('throbbing pain with pus -> urgent + abscess/pulpitis', () => {
  const { given, asked } = walk({
    ...healthy, main_concern: 'pain', pain: 'severe', pain_level: 8, pain_type: ['throbbing', 'lingering'],
    symptoms: ['pus_taste', 'hole'], duration: 'days', teeth: 'few',
  });
  assert.ok(asked.includes('pain_level') && asked.includes('pain_type'));
  const r = computeResult(given);
  assert.equal(r.level, 'urgent');
  assert.equal(r.conditions[0].id, 'infection');
  assert.ok(ids(r).includes('caries'));
});

test('red flag -> emergency regardless of other answers', () => {
  const { given } = walk({ ...healthy, red_flags: ['breathing'] });
  const r = computeResult(given);
  assert.equal(r.level, 'emergency');
  assert.equal(r.status, 'critical');
  assert.ok(r.redFlags.length === 1);
});

test('"none" is dropped when combined with other choices', () => {
  const v = validateAnswer(getQuestion('red_flags'), ['none', 'fever']);
  assert.deepEqual(v.value, ['fever']);
});

test('ulcer lasting > 6 weeks in a smoker -> lesion review, urgent', () => {
  const { given } = walk({ ...healthy, symptoms: ['ulcer'], duration: 'long', risk_factors: ['tobacco'], age_group: 'middle' });
  const r = computeResult(given);
  assert.equal(r.level, 'urgent');
  assert.equal(r.conditions[0].id, 'lesion_review');
  assert.ok(!ids(r).includes('ulcer'), 'long-lasting ulcer not labelled as a minor ulcer');
});

test('recent ulcer -> minor ulcer, no lesion review', () => {
  const { given } = walk({ ...healthy, symptoms: ['ulcer'], duration: 'days' });
  const r = computeResult(given);
  assert.ok(ids(r).includes('ulcer'));
  assert.ok(!ids(r).includes('lesion_review'));
});

test('dry mouth on medication -> xerostomia', () => {
  const { given } = walk({ ...healthy, saliva: 'very_dry', risk_factors: ['dry_meds'], age_group: 'senior' });
  const r = computeResult(given);
  assert.equal(r.conditions[0].id, 'xerostomia');
  assert.equal(r.level, 'urgent'); // saliva scored 2
});

test('loose dentures with sore corners -> denture problem + angular cheilitis', () => {
  const { given, asked } = walk({ ...healthy, denture_use: 'full', dentures: 'minor', lips: 'corners', teeth: 'no_teeth', age_group: 'senior' });
  assert.ok(asked.includes('dentures'));
  const r = computeResult(given);
  assert.equal(r.maxScore, 16);
  assert.ok(ids(r).includes('denture_problem'));
  assert.ok(ids(r).includes('angular_cheilitis'));
  assert.equal(r.level, 'attention');
});

test('loose teeth, receding gums, diabetes -> periodontitis', () => {
  const { given } = walk({
    ...healthy, gums: 'red_swollen', symptoms: ['loose', 'receding'], duration: 'long', risk_factors: ['diabetes', 'tobacco'], age_group: 'middle',
  });
  const r = computeResult(given);
  assert.equal(r.conditions[0].id, 'periodontitis');
  assert.equal(r.risks.gum, 'High');
});

test('changing an answer prunes follow-ups that no longer apply', () => {
  const answers = { ...healthy, pain: 'mild', pain_level: 3, pain_type: ['sensitive'] };
  const kept = prunedAnswers({ ...answers, pain: 'none' });
  assert.ok(!('pain_level' in kept) && !('pain_type' in kept));
});

test('every question has a valid definition', () => {
  for (const q of QUESTIONS) {
    assert.ok(q.text, q.id);
    if (q.type === 'single' || q.type === 'multi') assert.ok(q.options.length >= 2, q.id);
  }
});
