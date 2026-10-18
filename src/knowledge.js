// Built-in dental FAQ used to answer free-text questions when no Claude API key is configured.
import { config } from './config.js';

const c = config.clinic;

// Contact sentences adapt when the phone or email is left blank.
const orCall = c.phone ? ` or call us on ${c.phone}` : '';
const contactLine = [c.phone && `Phone ${c.phone}`, c.email && `email ${c.email}`].filter(Boolean).join(' or ');

const ENTRIES = [
  {
    keys: ['emergency', 'swelling', 'swollen face', 'cant breathe', "can't breathe", 'breathing', 'swallow', 'knocked out', 'accident', 'trauma'],
    answer: `If there is facial swelling spreading toward the eye or neck, difficulty breathing or swallowing, fever with swelling, or heavy bleeding, go to the nearest emergency department now or call ${c.emergencyNumber}. For a knocked-out adult tooth: hold it by the crown, rinse briefly, put it back in the socket or keep it in milk, and get to a dentist within 30-60 minutes.`,
  },
  {
    keys: ['toothache', 'tooth ache', 'tooth pain', 'tooth hurts', 'pain'],
    answer: 'For toothache: rinse with warm salt water, floss gently around the tooth to remove trapped food, and take over-the-counter pain relief as directed on the label. Never put aspirin directly on the gum. Pain that throbs, keeps you awake or lingers after hot/cold usually means the nerve is involved and needs a dentist soon.',
  },
  {
    keys: ['bleed', 'bleeding gums', 'gums bleed'],
    answer: 'Bleeding gums are most often gingivitis - inflammation from plaque. Keep brushing twice a day with a soft brush angled at the gumline, clean between teeth daily, and use an alcohol-free antimicrobial mouthwash. If bleeding continues past 2 weeks, or gums recede or teeth feel loose, book a check-up.',
  },
  {
    keys: ['dry mouth', 'xerostomia', 'no saliva', 'mouth dry'],
    answer: 'For dry mouth: sip water often, chew sugar-free xylitol gum, use a saliva substitute gel, and avoid alcohol-based mouthwash, alcohol and too much caffeine. Many medicines cause dry mouth - ask your doctor. Dry mouth raises the risk of decay, so use fluoride toothpaste and see your dentist regularly.',
  },
  {
    keys: ['bad breath', 'halitosis', 'breath smell', 'mouth smell'],
    answer: 'Bad breath usually comes from bacteria on the tongue and between the teeth. Brush twice daily, clean the tongue, clean between teeth every day, and stay hydrated. If it persists, gum disease, dry mouth or decay may be the cause - a dental check-up will find out.',
  },
  {
    keys: ['denture', 'false teeth', 'dentures'],
    answer: 'Clean dentures every day with a denture brush and non-abrasive cleaner, take them out at night and keep them in water or a soaking solution. Loose or painful dentures can cause sores - have the fit adjusted by a dentist rather than using lots of adhesive or trying to fix them yourself.',
  },
  {
    keys: ['ulcer', 'mouth sore', 'canker', 'sore in mouth', 'white patch', 'red patch', 'lump'],
    answer: 'Most mouth ulcers heal by themselves in 1-2 weeks. A salt-water rinse or an over-the-counter ulcer gel can ease them. Any ulcer, white or red patch, or lump that has not healed in 2 weeks must be checked by a dentist or doctor.',
  },
  {
    keys: ['sensitive', 'sensitivity', 'cold water', 'cold drink'],
    answer: 'Short, sharp twinges with cold or sweet foods are usually sensitivity from exposed dentine. Use a sensitive toothpaste (potassium nitrate or stannous fluoride) twice daily and rub a little on the area at night. If the pain lingers for more than a few seconds, or you notice a hole, see a dentist.',
  },
  {
    keys: ['wisdom'],
    answer: 'Wisdom tooth pain often comes from gum inflammation around a partly erupted tooth. Rinse with warm salt water and keep the area clean. Swelling, a bad taste, difficulty opening the mouth or fever need a dentist promptly.',
  },
  {
    keys: ['brush', 'how to brush', 'toothpaste', 'floss', 'fluoride'],
    answer: 'Brush twice a day for 2 minutes with a fluoride toothpaste (1450 ppm for adults; a pea-sized smear for children 3-6). Spit after brushing but do not rinse, so the fluoride keeps working. Clean between your teeth once a day with floss or interdental brushes.',
  },
  {
    keys: ['child', 'kid', 'baby', 'teething'],
    answer: 'Start brushing as soon as the first tooth appears with a smear of fluoride toothpaste, twice a day. Avoid sugary drinks in bottles, especially at night. Children should have their first dental visit by their first birthday.',
  },
  {
    keys: ['pregnan'],
    answer: 'Pregnancy hormones make gums more prone to bleeding (pregnancy gingivitis). Keep up brushing and cleaning between teeth; dental check-ups and most treatment are safe during pregnancy - just tell the dentist you are pregnant.',
  },
  {
    keys: ['whiten', 'whitening'],
    answer: 'Professional whitening is safe when supervised by a dentist. We check your teeth and gums first, because whitening does not work on fillings or crowns and can increase sensitivity for a short time.',
  },
  {
    keys: ['implant', 'bridge', 'crown', 'root canal', 'filling', 'braces', 'aligner', 'scaling', 'cleaning'],
    answer: `We provide check-ups and cleaning, fillings, root canal treatment, crowns and bridges, dentures, implants, whitening and orthodontics. Book through the chat${orCall} and the dentist will explain which option suits you.`,
  },
  {
    keys: ['price', 'cost', 'fee', 'charge', 'how much'],
    answer: `Fees depend on what treatment you need. A check-up comes first and the dentist gives you a written estimate before any treatment. ${c.phone ? `Call ${c.phone} for current consultation fees.` : 'Ask our team about current consultation fees when you visit.'}`,
  },
  {
    keys: ['opening', 'open on', 'hours', 'when are you', 'location', 'address', 'where are you', 'contact', 'phone number', 'call you'],
    answer: `${c.name} is at ${c.address}. Opening hours: ${c.hours}.${contactLine ? ` ${contactLine}.` : ''}`,
  },
  {
    keys: ['book', 'appointment', 'schedule', 'visit'],
    answer: `You can request an appointment at the end of this assessment or through the "Book appointment" section on the website${c.phone ? `, or call us on ${c.phone}` : ''}.`,
  },
  {
    keys: ['ohat', 'assessment', 'score', 'how does this work', 'what is this'],
    answer: 'This check uses the Oral Health Assessment Tool (OHAT), a standard screening tool that scores 8 areas - lips, tongue, gums, saliva, natural teeth, dentures, cleanliness and pain - from 0 (healthy) to 2 (unhealthy). Any score of 1 means enhanced self-care; any 2 means you should see a dentist promptly. It is a screening aid, not a diagnosis.',
  },
];

export function answerFromKnowledgeBase(question) {
  const q = question.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const entry of ENTRIES) {
    const score = entry.keys.reduce((s, k) => (q.includes(k) ? s + k.length : s), 0);
    if (score > bestScore) { best = entry; bestScore = score; }
  }
  if (best) return best.answer;
  return `I can help with questions about tooth pain, gums, dry mouth, bad breath, dentures, mouth sores, brushing, treatments and booking. For anything else, please ${c.phone ? `call our team on ${c.phone}` : 'ask our team when you visit'}.`;
}
