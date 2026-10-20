// Checks that keep the Android and iPhone apps in step with each other and with the website.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ANDROID = 'android-app/app/src/main';
const IOS = 'ios-app/SELFDOC';
const LANGS = ['en', 'si', 'ta'];
const SCRIPT = { si: /[඀-෿]/, ta: /[஀-௿]/ };

/** "key" = "value"; lines of an iOS Localizable.strings file. */
function iosStrings(lang) {
  const text = fs.readFileSync(`${IOS}/${lang}.lproj/Localizable.strings`, 'utf8');
  const out = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('/*')) continue;
    const m = /^"([^"]+)"\s*=\s*"((?:[^"\\]|\\.)*)";$/.exec(t);
    assert.ok(m, `${lang}: unreadable line ${t}`);
    out[m[1]] = m[2];
  }
  return out;
}

/** <string name="...">...</string> entries of an Android strings.xml file. */
function androidStrings(lang) {
  const file = `${ANDROID}/res/values${lang === 'en' ? '' : `-${lang}`}/strings.xml`;
  const out = {};
  for (const [, k, v] of fs.readFileSync(file, 'utf8').matchAll(/<string name="([^"]+)"[^>]*>([^<]*)<\/string>/g)) out[k] = v.replace(/\\'/g, "'");
  return out;
}

test('both apps inject the same bridge script', () => {
  const android = fs.readFileSync(`${ANDROID}/assets/selfdoc-bridge.js`, 'utf8').replace(/\r\n/g, '\n');
  const ios = fs.readFileSync(`${IOS}/selfdoc-bridge.js`, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(ios, android, 'copy android-app/app/src/main/assets/selfdoc-bridge.js to ios-app/SELFDOC/');
  assert.match(android, /window\.webkit\.messageHandlers\.SelfDocApp/, 'the bridge must reach the iPhone app too');
});

test('iPhone app texts exist in English, Sinhala and Tamil', () => {
  const en = iosStrings('en');
  for (const lang of ['si', 'ta']) {
    const s = iosStrings(lang);
    assert.deepEqual(Object.keys(s).sort(), Object.keys(en).sort(), `${lang} has different keys`);
    for (const [k, v] of Object.entries(s)) {
      assert.ok(v.trim(), `${lang}: ${k} is empty`);
      if (!['ok'].includes(k) && !v.startsWith('SELF DOC')) assert.match(v, SCRIPT[lang], `${lang}: ${k} is not translated`);
    }
  }
});

test('iPhone bottom bar and offline screen say the same as the Android app', () => {
  const pairs = { 'nav.home': 'nav_home', 'nav.chat': 'nav_chat', 'nav.blog': 'nav_blog', 'nav.book': 'nav_book', 'offline.title': 'offline_title', 'offline.body': 'offline_body', retry: 'retry', 'save.failed': 'save_failed', 'no.app': 'no_app' };
  for (const lang of LANGS) {
    const ios = iosStrings(lang);
    const android = androidStrings(lang);
    for (const [i, a] of Object.entries(pairs)) assert.equal(ios[i], android[a], `${lang}: ${i} differs from Android ${a}`);
  }
});

test('the Xcode project lists every app file, and every listed file exists', () => {
  const pbx = fs.readFileSync('ios-app/SELFDOC.xcodeproj/project.pbxproj', 'utf8');
  const refs = [...pbx.matchAll(/isa = PBXFileReference;[^}]*?path = ("?)([^";]+)\1; sourceTree = "<group>";/g)].map((m) => m[2]);
  assert.ok(refs.length >= 10, 'file references not found');
  for (const ref of refs) {
    assert.ok(fs.existsSync(path.join(IOS, ref)) || fs.existsSync(path.join('ios-app/SELFDOCUITests', ref)), `listed in the project but missing: ${ref}`);
  }
  for (const f of fs.readdirSync('ios-app/SELFDOCUITests')) assert.ok(refs.includes(f), `${f} is not in the Xcode project`);
  for (const f of fs.readdirSync(IOS).filter((n) => n.endsWith('.swift'))) {
    assert.ok(refs.includes(f), `${f} is not in the Xcode project`);
    assert.equal((pbx.match(new RegExp(`/\\* ${f.replace('.', '\\.')} in Sources \\*/ = `, 'g')) || []).length, 2, `${f} must be built into both apps`);
  }
  for (const target of ['"SELF DOC"', '"SELF DOC Staff"']) assert.ok(pbx.includes(`name = ${target};`), `target ${target} missing`);
});

test('the iPhone app asks permission in words for the camera and for saving photos', () => {
  // Without these the app closes when a page offers "Take Photo" or someone saves a blog photo.
  const plist = fs.readFileSync(`${IOS}/Info.plist`, 'utf8');
  for (const key of ['NSCameraUsageDescription', 'NSPhotoLibraryAddUsageDescription']) {
    assert.match(plist, new RegExp(`<key>${key}</key>\\s*<string>[^<]{10,}</string>`), `${key} missing`);
  }
});

test('iPhone icons and images are all present', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const contents = walk(`${IOS}/Assets.xcassets`).filter((f) => f.endsWith('Contents.json'));
  assert.ok(contents.length >= 7);
  for (const file of contents) {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const img of json.images || []) if (img.filename) assert.ok(fs.existsSync(path.join(path.dirname(file), img.filename)), `${file}: ${img.filename} missing`);
  }
  for (const icon of ['AppIcon/AppIcon.png', 'AppIconStaff/AppIconStaff.png']) {
    const [name, png] = icon.split('/');
    const buf = fs.readFileSync(`${IOS}/Assets.xcassets/${name}.appiconset/${png}`);
    assert.equal(buf.readUInt32BE(16), 1024, `${png} width`);
    assert.equal(buf.readUInt32BE(20), 1024, `${png} height`);
    assert.equal(buf[25], 2, `${png} must have no transparency (the App Store rejects it)`); // PNG colour type 2 = RGB
  }
});

test('every page has its home screen icon for iPhone', () => {
  for (const page of ['index', 'book', 'blog', 'guide', 'admin']) {
    const html = fs.readFileSync(`public/${page}.html`, 'utf8');
    const m = /<link rel="apple-touch-icon" href="\/([^"]+)">/.exec(html);
    assert.ok(m, `${page}.html has no apple-touch-icon`);
    assert.equal(m[1], page === 'admin' ? 'apple-touch-icon-staff.png' : 'apple-touch-icon.png');
    const buf = fs.readFileSync(`public/${m[1]}`);
    assert.equal(buf.readUInt32BE(16), 180, `${m[1]} must be 180 pixels wide`);
  }
});
