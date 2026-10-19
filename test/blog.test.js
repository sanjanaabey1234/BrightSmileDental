import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, readMinutes, makeExcerpt, sniffImage, validatePost, publicPost, LIMITS, BlogError } from '../src/blog.js';

test('slugify: readable Latin part plus a unique tail; non-Latin titles still get a slug', () => {
  assert.match(slugify('5 Tips for Healthier Gums!'), /^5-tips-for-healthier-gums-[0-9a-f]{6}$/);
  assert.match(slugify('දත් සෞඛ්‍යය'), /^post-[0-9a-f]{6}$/);
  assert.match(slugify('பல் பராமரிப்பு'), /^post-[0-9a-f]{6}$/);
  assert.notEqual(slugify('Same title'), slugify('Same title'));
});

test('readMinutes: about 200 words a minute, at least 1', () => {
  assert.equal(readMinutes(''), 1);
  assert.equal(readMinutes('word '.repeat(200)), 1);
  assert.equal(readMinutes('word '.repeat(1000)), 5);
});

test('makeExcerpt: prefers the summary, otherwise the start of the text without formatting marks', () => {
  assert.equal(makeExcerpt('Short summary', 'Long body'), 'Short summary');
  assert.equal(makeExcerpt('', '## Heading\n- First point\nMore text'), 'Heading: First point. More text');
  assert.equal(makeExcerpt('', '## Ready?\n* Done!\n• Third\nA line\nwrapped'), 'Ready? Done! Third. A line wrapped');
  const long = makeExcerpt('', 'word '.repeat(100), 50);
  assert.ok(long.length <= 51 && long.endsWith('…'));
});

test('sniffImage: recognises JPEG, PNG and WebP by their bytes, rejects anything else', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
  assert.equal(sniffImage(jpeg), 'image/jpeg');
  assert.equal(sniffImage(png), 'image/png');
  assert.equal(sniffImage(webp), 'image/webp');
  assert.equal(sniffImage(Buffer.from('<svg onload=alert(1)>')), null); // no SVG (it can carry scripts)
  assert.equal(sniffImage(Buffer.from('GIF89a......')), null);
});

test('validatePost: needs a title and text; tidies input; keeps the cover among the photos', () => {
  assert.throws(() => validatePost({ body: 'x' }), BlogError);
  assert.throws(() => validatePost({ title: 'x' }), BlogError);
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const p = validatePost({ title: '  Gum   care  ', body: 'Text\r\nMore', status: 'weird', imageIds: [...ids, ids[0]], coverId: 'not-in-list' });
  assert.equal(p.title, 'Gum care');
  assert.equal(p.body, 'Text\nMore');
  assert.equal(p.status, 'draft');
  assert.deepEqual(p.imageIds, ids);
  assert.equal(p.coverId, ids[0]);
  assert.equal(validatePost({ title: 'a', body: 'b', imageIds: ids, coverId: ids[1], status: 'published' }).coverId, ids[1]);
  assert.throws(() => validatePost({ title: 'a', body: 'b', imageIds: ['../etc/passwd'] }), BlogError);
  const many = Array.from({ length: LIMITS.images + 1 }, (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`);
  assert.throws(() => validatePost({ title: 'a', body: 'b', imageIds: many }), BlogError);
});

test('publicPost: visitors never see drafts fields or staff-only data', () => {
  const doc = { slug: 's', title: 't', excerpt: 'e', category: 'Tips', status: 'published', body: 'b', minutes: 2, imageIds: ['a', 'b'], coverId: 'b', publishedAt: new Date(), updatedAt: new Date() };
  const card = publicPost(doc);
  assert.equal(card.cover, '/api/images/b');
  assert.equal(card.imageCount, 2);
  assert.equal(card.body, undefined);
  assert.equal(card.status, undefined);
  const full = publicPost(doc, { full: true, images: [{ _id: 'a', width: 800, height: 600 }, { _id: 'b' }] });
  assert.deepEqual(full.images.map((i) => i.url), ['/api/images/a', '/api/images/b']);
  assert.equal(full.body, 'b');
});
