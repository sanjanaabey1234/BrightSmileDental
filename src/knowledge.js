// Built-in dental FAQ used to answer free-text questions when no Claude API key is configured.
// Keywords cover English, Sinhala and Tamil; answers come from the patient's language pack.
import { clinicFor } from './config.js';
import { langPack } from './i18n/index.js';

const ENTRIES = [
  {
    id: 'emergency',
    keys: ['emergency', 'swelling', 'swollen face', 'cant breathe', "can't breathe", 'breathing', 'swallow', 'knocked out', 'accident', 'trauma',
      'හදිසි', 'ඉදිමුම', 'ඉදිමී', 'හුස්ම', 'ගිලීම', 'අනතුර', 'அவசர', 'வீக்கம்', 'மூச்சு', 'விழுங்க', 'விபத்து'],
    answer: (c) => `If there is facial swelling spreading toward the eye or neck, difficulty breathing or swallowing, fever with swelling, or heavy bleeding, go to the nearest emergency department now or call ${c.emergencyNumber}. For a knocked-out adult tooth: hold it by the crown, rinse briefly, put it back in the socket or keep it in milk, and get to a dentist within 30-60 minutes.`,
  },
  {
    id: 'toothache',
    keys: ['toothache', 'tooth ache', 'tooth pain', 'tooth hurts', 'pain', 'දත් කැක්කුම', 'කැක්කුම', 'වේදනාව', 'රිදෙනවා', 'பல்வலி', 'பல் வலி', 'வலி'],
    answer: 'For toothache: rinse with warm salt water, floss gently around the tooth to remove trapped food, and take over-the-counter pain relief as directed on the label. Never put aspirin directly on the gum. Pain that throbs, keeps you awake or lingers after hot/cold usually means the nerve is involved and needs a dentist soon.',
  },
  {
    id: 'bleeding',
    keys: ['bleed', 'bleeding gums', 'gums bleed', 'ලේ ගල', 'ලේ', 'இரத்தம்', 'ரத்தம்'],
    answer: 'Bleeding gums are most often gingivitis - inflammation from plaque. Keep brushing twice a day with a soft brush angled at the gumline, clean between teeth daily, and use an alcohol-free antimicrobial mouthwash. If bleeding continues past 2 weeks, or gums recede or teeth feel loose, book a check-up.',
  },
  {
    id: 'dry_mouth',
    keys: ['dry mouth', 'xerostomia', 'no saliva', 'mouth dry', 'වියළි', 'වියළීම', 'කෙළ', 'வறட்சி', 'உமிழ்நீர்'],
    answer: 'For dry mouth: sip water often, chew sugar-free xylitol gum, use a saliva substitute gel, and avoid alcohol-based mouthwash, alcohol and too much caffeine. Many medicines cause dry mouth - ask your doctor. Dry mouth raises the risk of decay, so use fluoride toothpaste and see your dentist regularly.',
  },
  {
    id: 'bad_breath',
    keys: ['bad breath', 'halitosis', 'breath smell', 'mouth smell', 'දුර්ගන්ධ', 'ගඳ', 'துர்நாற்றம்', 'நாற்றம்'],
    answer: 'Bad breath usually comes from bacteria on the tongue and between the teeth. Brush twice daily, clean the tongue, clean between teeth every day, and stay hydrated. If it persists, gum disease, dry mouth or decay may be the cause - a dental check-up will find out.',
  },
  {
    id: 'dentures',
    keys: ['denture', 'false teeth', 'dentures', 'කෘත්‍රිම දත්', 'දත් කට්ටල', 'செயற்கைப் பல்', 'செயற்கை பல்', 'செயற்கைப் பற்கள்'],
    answer: 'Clean dentures every day with a denture brush and non-abrasive cleaner, take them out at night and keep them in water or a soaking solution. Loose or painful dentures can cause sores - have the fit adjusted by a dentist rather than using lots of adhesive or trying to fix them yourself.',
  },
  {
    id: 'ulcer',
    keys: ['ulcer', 'mouth sore', 'canker', 'sore in mouth', 'white patch', 'red patch', 'lump', 'වණ', 'තුවාල', 'පැල්ලම', 'ගැටිත්ත', 'புண்', 'திட்டு', 'கட்டி'],
    answer: 'Most mouth ulcers heal by themselves in 1-2 weeks. A salt-water rinse or an over-the-counter ulcer gel can ease them. Any ulcer, white or red patch, or lump that has not healed in 2 weeks must be checked by a dentist or doctor.',
  },
  {
    id: 'sensitivity',
    keys: ['sensitive', 'sensitivity', 'cold water', 'cold drink', 'සංවේදී', 'සීතල', 'கூச்சம்', 'குளிர்'],
    answer: 'Short, sharp twinges with cold or sweet foods are usually sensitivity from exposed dentine. Use a sensitive toothpaste (potassium nitrate or stannous fluoride) twice daily and rub a little on the area at night. If the pain lingers for more than a few seconds, or you notice a hole, see a dentist.',
  },
  {
    id: 'wisdom',
    keys: ['wisdom', 'ප්‍රඥා දත', 'ඥාන දත', 'ஞானப் பல்', 'ஞானப்பல்'],
    answer: 'Wisdom tooth pain often comes from gum inflammation around a partly erupted tooth. Rinse with warm salt water and keep the area clean. Swelling, a bad taste, difficulty opening the mouth or fever need a dentist promptly.',
  },
  {
    id: 'brushing',
    keys: ['brush', 'how to brush', 'toothpaste', 'floss', 'fluoride', 'දත් මැදීම', 'මදින', 'දන්තාලේප', 'ෆ්ලොස්', 'துலக்', 'பற்பசை', 'ஃப்ளாஸ்'],
    answer: 'Brush twice a day for 2 minutes with a fluoride toothpaste (1450 ppm for adults; a pea-sized smear for children 3-6). Spit after brushing but do not rinse, so the fluoride keeps working. Clean between your teeth once a day with floss or interdental brushes.',
  },
  {
    id: 'children',
    keys: ['child', 'kid', 'baby', 'teething', 'දරුව', 'ළමා', 'බබා', 'குழந்தை', 'சிறுவர்'],
    answer: 'Start brushing as soon as the first tooth appears with a smear of fluoride toothpaste, twice a day. Avoid sugary drinks in bottles, especially at night. Children should have their first dental visit by their first birthday.',
  },
  {
    id: 'pregnancy',
    keys: ['pregnan', 'ගැබිනි', 'ගර්භණී', 'கர்ப்ப'],
    answer: 'Pregnancy hormones make gums more prone to bleeding (pregnancy gingivitis). Keep up brushing and cleaning between teeth; dental check-ups and most treatment are safe during pregnancy - just tell the dentist you are pregnant.',
  },
  {
    id: 'whitening',
    keys: ['whiten', 'whitening', 'සුදු කිරීම', 'வெண்மை'],
    answer: 'Professional whitening is safe when supervised by a dentist. We check your teeth and gums first, because whitening does not work on fillings or crowns and can increase sensitivity for a short time.',
  },
  {
    id: 'treatments',
    keys: ['implant', 'bridge', 'crown', 'root canal', 'filling', 'braces', 'aligner', 'scaling', 'cleaning', 'ප්‍රතිකාර', 'පිරවුම', 'මූල නාල', 'சிகிச்சை', 'அடைப்பு', 'வேர்'],
    answer: (c) => `We provide check-ups and cleaning, fillings, root canal treatment, crowns and bridges, dentures, implants, whitening and orthodontics. Book through the chat${c.phone ? ` or call us on ${c.phone}` : ''} and the dentist will explain which option suits you.`,
  },
  {
    id: 'price',
    keys: ['price', 'cost', 'fee', 'charge', 'how much', 'මිල', 'ගාස්තු', 'කීයද', 'விலை', 'கட்டணம்', 'எவ்வளவு'],
    answer: (c) => `Fees depend on what treatment you need. A check-up comes first and the dentist gives you a written estimate before any treatment. ${c.phone ? `Call ${c.phone} for current consultation fees.` : 'Ask our team about current consultation fees when you visit.'}`,
  },
  {
    id: 'contact',
    keys: ['opening', 'open on', 'hours', 'when are you', 'location', 'address', 'where are you', 'contact', 'phone number', 'call you',
      'විවෘත', 'වේලාව', 'ලිපිනය', 'කොහේද', 'நேரம்', 'முகவரி', 'எங்கே'],
    answer: (c) => {
      const contactLine = [c.phone && `Phone ${c.phone}`, c.email && `email ${c.email}`].filter(Boolean).join(' or ');
      return `${c.name} is at ${c.address}. Opening hours: ${c.hours}.${contactLine ? ` ${contactLine}.` : ''}`;
    },
  },
  {
    id: 'booking',
    keys: ['book', 'appointment', 'schedule', 'visit', 'වෙන් කර', 'හමුවීම', 'முன்பதிவு', 'சந்திப்பு'],
    answer: (c) => `You can request an appointment at the end of this assessment or through the "Book appointment" section on the website${c.phone ? `, or call us on ${c.phone}` : ''}.`,
  },
  {
    id: 'ohat',
    keys: ['ohat', 'assessment', 'score', 'how does this work', 'what is this', 'ඇගයීම', 'ලකුණු', 'மதிப்பீடு', 'மதிப்பெண்'],
    answer: 'This check uses the Oral Health Assessment Tool (OHAT), a standard screening tool that scores 8 areas - lips, tongue, gums, saliva, natural teeth, dentures, cleanliness and pain - from 0 (healthy) to 2 (unhealthy). Any score of 1 means enhanced self-care; any 2 means you should see a dentist promptly. It is a screening aid, not a diagnosis.',
  },
];

const EN_FALLBACK = (c) => `I can help with questions about tooth pain, gums, dry mouth, bad breath, dentures, mouth sores, brushing, treatments and booking. For anything else, please ${c.phone ? `call our team on ${c.phone}` : 'ask our team when you visit'}.`;

const render = (value, c) => (typeof value === 'function' ? value(c) : value);

export function answerFromKnowledgeBase(question, lang = 'en') {
  const q = question.toLowerCase();
  const c = clinicFor(lang);
  const pack = langPack(lang);
  let best = null;
  let bestScore = 0;
  for (const entry of ENTRIES) {
    const score = entry.keys.reduce((s, k) => (q.includes(k) ? s + k.length : s), 0);
    if (score > bestScore) { best = entry; bestScore = score; }
  }
  if (best) return render(pack?.kb?.[best.id] ?? best.answer, c);
  return render(pack?.kbFallback ?? EN_FALLBACK, c);
}

// Exposed for the translation completeness tests.
export const _kbIds = ENTRIES.map((e) => e.id);
