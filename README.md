# Dental AI Bot - OHAT oral health self-check

This project is a dental clinic website with a chatbot. The chatbot walks a patient (or their carer) through the standard **Oral Health Assessment Tool (OHAT)**. It stores every answer, predicts the likely conditions, and shows the patient a result with a self-care plan. Clinic staff watch every conversation live on a dashboard.

## Run it

Requires **Node.js 22.9+** and a **MongoDB Atlas** database (the free M0 cluster is enough).

### 1. Set up MongoDB Atlas
1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Go to **Database Access** and add a database user with a username and password. Give it "Read and write to any database".
3. Go to **Network Access** and allow your IP address.
   - Choose **Add Current IP Address** for your computer.
   - When the app is hosted on Render, Railway or a similar platform, choose **Allow access from anywhere** (`0.0.0.0/0`), because those hosts don't have a fixed IP.
4. Go to your cluster, then **Connect → Drivers**, and copy the connection string (`mongodb+srv://...`).

### 2. Configure and start

```bash
npm install
copy .env.example .env      # paste MONGODB_URI, then set ADMIN_PASSWORD and the clinic details
npm start
```

- Website and chatbot: http://localhost:3000
- Staff dashboard: http://localhost:3000/admin (password from `ADMIN_PASSWORD`; the default is `admin123`)
- Tests: `npm test`

The collections and indexes are created automatically the first time the app starts.

| Collection | Contents |
|---|---|
| `sessions` | One document per assessment. Holds the answers, the result, the predictions, the summary and the staff follow-up. |
| `messages` | The full chat transcript: bot, patient, assistant answers and staff replies. |
| `appointments` | Appointment requests from the chat and from the booking page (`/book`). |
| `posts` | Blog articles written in the staff dashboard, as drafts or published. |
| `images` | The photos for blog articles, stored in the database (the site has no file storage on Vercel). |

If your password contains special characters such as `@ : / ? #`, URL-encode them in `MONGODB_URI`. For example, `@` becomes `%40`.

## What the patient gets

1. **Safety triage first.** Spreading swelling, difficulty breathing or swallowing, fever with swelling, uncontrolled bleeding, or trauma triggers an immediate emergency message and alerts the staff dashboard.
2. **The 8 OHAT categories**, reworded in plain language. The categories are lips, tongue, gums and tissues, saliva, natural teeth, dentures (asked only if the patient wears them), cleanliness and pain. Each is scored 0 (healthy), 1 (changes) or 2 (unhealthy).
3. **Follow-up questions** about pain type and level, other symptoms, how long the problem has lasted, risk factors (tobacco or betel, diabetes, medicines that dry the mouth, sugar, pregnancy, and others) and hygiene habits.
4. **Results:**
   - The priority level, using the OHAT action thresholds:
     - all scores 0: routine care
     - any score of 1: enhanced self-care and a check-up
     - any score of 2: prompt dental referral
     - any red flag: emergency
   - The OHAT score and a breakdown by category.
   - The **predicted conditions**, each with a confidence percentage and the answers behind it.
   - A personal self-care plan, risk bands for tooth decay and gum disease, and a reference code.
   - Buttons to request an appointment or to print or save the result as a PDF.
5. **Free-text questions at any point.** If the patient types a question instead of an answer, the bot answers it and then returns to the check.
6. **Resume and live replies.** The conversation survives a page reload, and messages from staff appear in the patient's chat in real time.

### Conditions the predictor can flag

Gingivitis, periodontitis, tooth decay, pulpitis or dental abscess, tooth sensitivity or wear, cracked tooth, dry mouth (xerostomia), oral thrush or denture stomatitis, angular cheilitis, denture problems, halitosis, minor mouth ulcers, a **mouth lesion that needs examination** (an ulcer, patch or lump lasting more than 2 weeks), and jaw problems (TMD) or teeth grinding.

The predictor is rule-based and transparent, so a clinician can audit it. Each answer adds evidence tags, and each condition weighs those tags to produce a confidence score. The rules are in [src/assessment.js](src/assessment.js), and the test cases are in [test/assessment.test.js](test/assessment.test.js).

## What the staff dashboard shows

- **Live updates over Server-Sent Events:**
  - new patients and each answer as it arrives
  - completed checks
  - emergency red flags (as red toasts)
  - questions typed by patients
  - appointment requests
  - which patients are online right now
- **Key figures:** total checks, checks today, patients live now, urgent cases still open, cases needing follow-up, pending appointments and the average OHAT score.
- **Charts:** the mix of priority levels, the most common predicted conditions, and the main concerns.
- **Search and filters** by progress, priority and follow-up status.
- **The patient detail panel:**
  - a clinician summary
  - the OHAT categories and predicted conditions
  - every answer and the full conversation
  - a box to **message the patient directly**
  - follow-up status and internal notes
  - deleting the record
- **Appointments tab:** set each request to confirmed, done or cancelled. Confirming an appointment marks the patient as "booked".
- **CSV export** of every assessment and answer.
- **Blog tab:** write articles, add up to 20 photos to each, choose the cover photo and the photo order, and save as a draft or publish. Published articles appear on the website's Blog page.

## Blog

Staff write articles in the dashboard's **Blog** tab. Customers read them at `/blog`, and the app's **Blog** icon opens the same page.

- **Writing:** leave an empty line between paragraphs. Start a line with `## ` for a heading or `- ` for a list item. Any HTML typed in is shown as text, never run.
- **Photos:** JPG, PNG or WebP. The browser shrinks each photo to at most 1600 pixels on the longest side before uploading, so phone photos upload quickly. The server checks each file really is a photo.
- **The cover** is the first photo unless you choose another. It shows on the blog list and at the top of the article.
- **Drafts** are only visible in the dashboard. Publishing keeps the original publish date when you edit later.
- **Deleting** a post, or removing a photo from it, also deletes those photos from the database.
- **On the website:** search, category filters, the newest article featured at the top, a photo grid with a full-screen viewer (swipe, arrow keys, Esc), sharing, and "More articles". It works in English, Sinhala and Tamil and in light and dark themes. Article text appears in the language the staff wrote it in.

## Guide videos

- **Patient guide** (2:43) on the website's **Guide** page (`/guide`), also in the app's menu. It covers the free check, booking, the blog and the Android app. Chapter buttons jump to each part, and four written steps (in English, Sinhala and Tamil) each have a "Watch this part" button.
- **Staff guide** (1:22) in the staff dashboard: **Staff guide** in the sidebar (▶ on phones). It covers sign-in, the overview, patients, appointments and writing blog posts.
- The videos are in English with on-screen captions. The files are in [public/media](public/media). All data shown in them is made-up demo data.

## Languages: English, Sinhala and Tamil

Visitors switch language with the 🌐 menu in the top bar, or with the buttons in the chatbot's welcome card. The choice is remembered in their browser.

- **What's translated:** the website, the whole chatbot (questions, answer options and messages), the results (priority, predicted conditions, evidence and self-care plan) and the built-in FAQ answers.
- **Switching mid-chat:** the whole conversation is re-shown in the new language.
- **Staff side:** stored answers, the result and the clinician summary stay **in English**. The dashboard shows which language the patient used.
- **Where the text lives:**
  - website text: [public/js/i18n.js](public/js/i18n.js)
  - chatbot and result text: [src/i18n/si.js](src/i18n/si.js) and [src/i18n/ta.js](src/i18n/ta.js)
  - English originals: [src/assessment.js](src/assessment.js)
- **Completeness tests:** `npm test` fails if any text is missing a Sinhala or Tamil version.
- **Clinic address and hours:**
  - for the default address and hours, Sinhala and Tamil versions are built in
  - if you change them, set `CLINIC_ADDRESS_SI`, `CLINIC_ADDRESS_TA`, `CLINIC_HOURS_SI` and `CLINIC_HOURS_TA` as well

Have a Sinhala- and a Tamil-speaking dental professional review the medical wording before going live.

## Deploy to Vercel

The app runs on Vercel as a serverless Express function, with the database on MongoDB Atlas. On Vercel, live updates use **polling every 3–4 seconds**, because serverless functions can't keep a live connection open. When run with `npm start` on a normal server, updates stay instant.

1. In **Atlas → Network Access**, add `0.0.0.0/0` (**Allow access from anywhere**). Vercel's servers don't have fixed IP addresses.
2. In Vercel, choose **Add New → Project** and import this GitHub repository. Keep the default settings; no build command is needed.
3. Under **Settings → Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | your Atlas connection string |
   | `MONGODB_DB` | `brightsmile_dental` |
   | `ADMIN_PASSWORD` | the staff dashboard password |
   | `ADMIN_SECRET` | a long random string |
   | `CLINIC_NAME`, `CLINIC_PHONE`, ... | optional clinic details |
   | `ANTHROPIC_API_KEY` | optional |

4. Click **Deploy**. Every push to `main` deploys again automatically.

Vercel's free Hobby plan is for personal, non-commercial use only. A live clinic website needs the Pro plan.

## Optional: Claude AI

If you set `ANTHROPIC_API_KEY` in `.env`, two things change:

- Free-text questions are answered by Claude (`claude-opus-5-5`, with safety rules in the system prompt).
- Each completed check gets a clinician summary written by Claude.

Without a key, the bot answers from the built-in dental FAQ in [src/knowledge.js](src/knowledge.js) and writes a rule-based summary instead. If an API call fails, it falls back the same way automatically.

## Project layout

```
server.js            Express app: patient API, staff API, real-time streams
src/assessment.js    OHAT questions, scoring, triage, condition prediction, self-care plan
src/sessions.js      Storing sessions, answers, messages and results in MongoDB
src/ai.js            Optional Claude integration with fallback
src/knowledge.js     Built-in dental FAQ
src/blog.js          Blog posts and their photos
src/db.js            MongoDB Atlas connection, collections and indexes
public/              Website, chatbot widget, staff dashboard
test/                Tests for the prediction engine, translations and blog
```

## Before going live

- Set a strong `ADMIN_PASSWORD` and a random `ADMIN_SECRET`.
- Serve the site over HTTPS behind a reverse proxy such as nginx or Caddy. The app stores health information.
- Add a privacy notice and consent wording that meet your local data-protection law, and agree a data retention period. Staff can delete individual records from the dashboard.
- Turn on backups in Atlas (paid clusters include continuous backups; on the free tier, export regularly with `mongodump` or the dashboard's CSV export).
- On a normal server, run a single app instance. Instant updates pass through the server's memory, so a second copy wouldn't see the first one's events. This doesn't apply on Vercel, where the browser polls the database instead.
- Have a dentist review the wording and the prediction rules in `src/assessment.js` for your clinic.

> The self-check is a screening aid based on OHAT. It is not a diagnosis.
