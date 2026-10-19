// Blog posts written by staff in the dashboard, with their photos. Both live in MongoDB:
//   posts  - { _id, slug, title, summary, excerpt, minutes, body, category, status, imageIds, coverId,
//              createdAt, updatedAt, publishedAt }
//   images - { _id (random id), mime, data, bytes, width, height, postId, createdAt }
// Photos are stored in the database because serverless hosts (Vercel) have no lasting disk.
import crypto from 'node:crypto';
import { Binary, ObjectId } from 'mongodb';
import { col } from './db.js';

export const LIMITS = { title: 140, summary: 300, body: 20000, category: 40, images: 20 };
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const STATUSES = new Set(['draft', 'published']);
const ORPHAN_IMAGE_MS = 24 * 60 * 60 * 1000;

export class BlogError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

// ---------- pure helpers ----------

/** URL name for a post: Latin letters and digits from the title plus a short random tail (always unique). */
export function slugify(title) {
  const base = String(title || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/, '');
  return `${base || 'post'}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Reading time at about 200 words a minute (at least 1). */
export function readMinutes(body) {
  const words = String(body || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** A short plain-text teaser: the summary if given, otherwise the start of the article. */
export function makeExcerpt(summary, body, max = 220) {
  // Headings end with a colon and list items with a full stop, so the excerpt reads as sentences.
  const ends = (line, mark) => (/[.!?:;,…]$/.test(line) ? line : line + mark);
  const plain = () => String(body || '').split(/\r?\n/).map((line) => {
    const s = line.trim();
    if (/^#{1,3}\s+/.test(s)) return ends(s.replace(/^#{1,3}\s+/, ''), ':');
    if (/^[-*•]\s+/.test(s)) return ends(s.replace(/^[-*•]\s+/, ''), '.');
    return s;
  }).join(' ');
  const text = (summary || plain()).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/** Image type from the file's own bytes (JPEG, PNG or WebP); null for anything else. */
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const text = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

/** Checks a post sent from the dashboard. Throws BlogError with a message staff can act on. */
export function validatePost(input) {
  const b = input || {};
  const post = {
    title: text(b.title, LIMITS.title).replace(/\s+/g, ' '),
    summary: text(b.summary, LIMITS.summary).replace(/\s+/g, ' '),
    body: text(b.body, LIMITS.body),
    category: text(b.category, LIMITS.category).replace(/\s+/g, ' '),
    status: STATUSES.has(b.status) ? b.status : 'draft',
    imageIds: [...new Set((Array.isArray(b.imageIds) ? b.imageIds : []).map(String))],
    coverId: b.coverId ? String(b.coverId) : null,
  };
  if (!post.title) throw new BlogError('Please add a title.');
  if (!post.body) throw new BlogError('Please write the article text.');
  if (post.imageIds.length > LIMITS.images) throw new BlogError(`A post can have up to ${LIMITS.images} photos.`);
  if (post.imageIds.some((id) => !/^[0-9a-f-]{36}$/.test(id))) throw new BlogError('One of the photos is not valid. Please upload it again.');
  if (!post.imageIds.includes(post.coverId)) post.coverId = post.imageIds[0] || null;
  return post;
}

export const imageUrl = (id) => (id ? `/api/images/${id}` : null);

/** What visitors see. `full` adds the article text and every photo. */
export function publicPost(doc, { full = false, images = [] } = {}) {
  const out = {
    slug: doc.slug, title: doc.title, excerpt: doc.excerpt, category: doc.category || null,
    publishedAt: doc.publishedAt, updatedAt: doc.updatedAt, readMinutes: doc.minutes ?? readMinutes(doc.body),
    cover: imageUrl(doc.coverId), imageCount: (doc.imageIds || []).length,
  };
  if (full) {
    out.summary = doc.summary || null;
    out.body = doc.body;
    const byId = new Map(images.map((i) => [i._id, i]));
    out.images = (doc.imageIds || []).filter((id) => byId.has(id))
      .map((id) => ({ id, url: imageUrl(id), width: byId.get(id).width || null, height: byId.get(id).height || null }));
  }
  return out;
}

/** What staff see in the dashboard list (and, with the text, in the editor). */
export function staffPost(doc, { full = false } = {}) {
  const out = {
    id: doc._id.toString(), slug: doc.slug, title: doc.title, excerpt: doc.excerpt, category: doc.category || null,
    status: doc.status, createdAt: doc.createdAt, updatedAt: doc.updatedAt, publishedAt: doc.publishedAt || null,
    cover: imageUrl(doc.coverId), imageCount: (doc.imageIds || []).length, readMinutes: doc.minutes ?? readMinutes(doc.body),
  };
  if (full) Object.assign(out, { summary: doc.summary, body: doc.body, imageIds: doc.imageIds || [], coverId: doc.coverId });
  return out;
}

// ---------- database ----------

const postId = (id) => {
  if (!ObjectId.isValid(String(id))) throw new BlogError('Post not found.', 404);
  return new ObjectId(String(id));
};

/** Saves an uploaded photo; it belongs to no post until a post that uses it is saved. */
export async function saveImage(buf, { width, height } = {}) {
  if (!buf?.length) throw new BlogError('The photo is empty.');
  if (buf.length > MAX_IMAGE_BYTES) throw new BlogError('The photo is too large (4 MB at most).', 413);
  const mime = sniffImage(buf);
  if (!mime) throw new BlogError('Please upload a JPG, PNG or WebP photo.', 415);
  const dim = (v) => { const n = Math.round(Number(v)); return n > 0 && n < 20000 ? n : null; };
  const doc = {
    _id: crypto.randomUUID(), mime, data: new Binary(buf), bytes: buf.length,
    width: dim(width), height: dim(height), postId: null, createdAt: new Date(),
  };
  await col.images.insertOne(doc);
  return { id: doc._id, url: imageUrl(doc._id), width: doc.width, height: doc.height };
}

export async function getImage(id) {
  return col.images.findOne({ _id: String(id) });
}

/** Links the post's photos to it; removes photos the post no longer uses and day-old unused uploads. */
async function syncImages(id, imageIds, previousIds = []) {
  if (imageIds.length) {
    const found = await col.images.countDocuments({ _id: { $in: imageIds } });
    if (found !== imageIds.length) throw new BlogError('Some photos were not found. Please upload them again.');
    await col.images.updateMany({ _id: { $in: imageIds } }, { $set: { postId: id.toString() } });
  }
  const dropped = previousIds.filter((x) => !imageIds.includes(x));
  await Promise.all([
    dropped.length ? col.images.deleteMany({ _id: { $in: dropped } }) : null,
    col.images.deleteMany({ postId: null, createdAt: { $lt: new Date(Date.now() - ORPHAN_IMAGE_MS) } }),
  ]);
}

export async function createPost(input) {
  const post = validatePost(input);
  const now = new Date();
  const doc = {
    _id: new ObjectId(), slug: slugify(post.title), ...post, excerpt: makeExcerpt(post.summary, post.body), minutes: readMinutes(post.body),
    createdAt: now, updatedAt: now, publishedAt: post.status === 'published' ? now : null,
  };
  await syncImages(doc._id, post.imageIds);
  await col.posts.insertOne(doc);
  return staffPost(doc, { full: true });
}

export async function updatePost(id, input) {
  const _id = postId(id);
  const existing = await col.posts.findOne({ _id });
  if (!existing) throw new BlogError('Post not found.', 404);
  const post = validatePost(input);
  const now = new Date();
  const $set = {
    ...post, excerpt: makeExcerpt(post.summary, post.body), minutes: readMinutes(post.body), updatedAt: now,
    // First publication keeps its date; going back to draft clears it.
    publishedAt: post.status === 'published' ? existing.publishedAt || now : null,
  };
  await syncImages(_id, post.imageIds, existing.imageIds || []);
  await col.posts.updateOne({ _id }, { $set });
  return staffPost({ ...existing, ...$set }, { full: true });
}

export async function deletePost(id) {
  const _id = postId(id);
  const existing = await col.posts.findOneAndDelete({ _id });
  if (!existing) throw new BlogError('Post not found.', 404);
  await col.images.deleteMany({ $or: [{ postId: _id.toString() }, { _id: { $in: existing.imageIds || [] } }] });
}

export async function staffPosts() {
  const docs = await col.posts.find({}, { projection: { body: 0 } }).sort({ updatedAt: -1 }).limit(500).toArray();
  return docs.map((d) => staffPost(d));
}

export async function staffPostDetail(id) {
  const doc = await col.posts.findOne({ _id: postId(id) });
  if (!doc) throw new BlogError('Post not found.', 404);
  return staffPost(doc, { full: true });
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Published posts, newest first, optionally by category or search words. */
export async function publishedPosts({ category, q, limit = 60 } = {}) {
  const filter = { status: 'published' };
  if (category) filter.category = String(category).slice(0, LIMITS.category);
  if (q) {
    const re = { $regex: escapeRegex(String(q).trim().slice(0, 60)), $options: 'i' };
    filter.$or = [{ title: re }, { excerpt: re }, { category: re }];
  }
  const docs = await col.posts.find(filter).sort({ publishedAt: -1 }).limit(Math.min(Number(limit) || 60, 100)).toArray();
  const categories = await col.posts.distinct('category', { status: 'published', category: { $nin: [null, ''] } });
  return { posts: docs.map((d) => publicPost(d)), categories: categories.sort() };
}

/** One published post with its photos, plus up to three others to read next. */
export async function publishedPost(slug) {
  const doc = await col.posts.findOne({ slug: String(slug), status: 'published' });
  if (!doc) throw new BlogError('Article not found.', 404);
  const [images, sameCategory, latest] = await Promise.all([
    col.images.find({ _id: { $in: doc.imageIds || [] } }, { projection: { data: 0 } }).toArray(),
    doc.category ? col.posts.find({ status: 'published', category: doc.category, _id: { $ne: doc._id } }).sort({ publishedAt: -1 }).limit(3).toArray() : [],
    col.posts.find({ status: 'published', _id: { $ne: doc._id } }).sort({ publishedAt: -1 }).limit(4).toArray(),
  ]);
  const more = [...sameCategory, ...latest.filter((p) => !sameCategory.some((s) => s._id.equals(p._id)))].slice(0, 3);
  return { post: publicPost(doc, { full: true, images }), more: more.map((d) => publicPost(d)) };
}
