# Dental AI Bot - OHAT oral health self-check

This project is a dental clinic website with a chatbot. The chatbot walks a patient (or their carer) through the standard **Oral Health Assessment Tool (OHAT)**. It stores every answer, predicts the likely conditions, and shows the patient a result with a self-care plan. Clinic staff watch every conversation live on a dashboard.

## Run it

Requires **Node.js 22.5+** (it uses the built-in `node:sqlite`, so nothing needs to be compiled).

```bash
npm install
copy .env.example .env      # then edit ADMIN_PASSWORD and the clinic details
npm start
```

- Website and chatbot: http://localhost:3000
- Staff dashboard: http://localhost:3000/admin (password from `ADMIN_PASSWORD`; the default is `admin123`)
- Tests: `npm test`

The data is stored in `data/dental.db` (SQLite).

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

## Optional: Claude AI

If you set `ANTHROPIC_API_KEY` in `.env`, two things change:

- Free-text questions are answered by Claude (`claude-opus-5-5`, with safety rules in the system prompt).
- Each completed check gets a clinician summary written by Claude.

Without a key, the bot answers from the built-in dental FAQ in [src/knowledge.js](src/knowledge.js) and writes a rule-based summary instead. If an API call fails, it falls back the same way automatically.

## Project layout

```
server.js            Express app: patient API, staff API, real-time streams
src/assessment.js    OHAT questions, scoring, triage, condition prediction, self-care plan
src/sessions.js      Storing sessions, answers, messages and results
src/ai.js            Optional Claude integration with fallback
src/knowledge.js     Built-in dental FAQ
src/db.js            SQLite schema
public/              Website, chatbot widget, staff dashboard
test/                Tests for the prediction engine
```

## Before going live

- Set a strong `ADMIN_PASSWORD` and a random `ADMIN_SECRET`.
- Serve the site over HTTPS behind a reverse proxy such as nginx or Caddy. The app stores health information.
- Add a privacy notice and consent wording that meet your local data-protection law, and agree a data retention period. Staff can delete individual records from the dashboard.
- Back up `data/dental.db`.
- Have a dentist review the wording and the prediction rules in `src/assessment.js` for your clinic.

> The self-check is a screening aid based on OHAT. It is not a diagnosis.
