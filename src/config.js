// Central configuration, read once from environment variables (.env is loaded by `npm start`).

const env = process.env;

const DEFAULT_ADDRESS = 'Faculty Of Dental Science, University Of Peradeniya';
const DEFAULT_HOURS = 'Mon-Fri 8:00am-4:00pm';
const address = env.CLINIC_ADDRESS || DEFAULT_ADDRESS;
const hours = env.CLINIC_HOURS || DEFAULT_HOURS;

// Sinhala/Tamil address and hours. Built-in translations are used only for the default
// values; a custom CLINIC_ADDRESS/HOURS without a *_SI/*_TA version is shown as written.
const localized = (envValue, value, defaultValue, translation) => envValue || (value === defaultValue ? translation : value);

export const config = {
  port: Number(env.PORT) || 3000,
  mongoUri: env.MONGODB_URI || '',
  mongoDb: env.MONGODB_DB || 'brightsmile_dental',
  // Serverless hosts (Vercel) can't keep live connections open, so the browser polls instead.
  realtime: env.REALTIME_MODE || (env.VERCEL ? 'poll' : 'sse'),
  serverless: Boolean(env.VERCEL),
  adminPassword: env.ADMIN_PASSWORD || 'admin123',
  adminSecret: env.ADMIN_SECRET || 'dev-secret-change-me',
  anthropicEnabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
  clinic: {
    name: env.CLINIC_NAME || 'SELF DOC',
    phone: env.CLINIC_PHONE || '',
    email: env.CLINIC_EMAIL || '',
    address,
    hours,
    emergencyNumber: env.EMERGENCY_NUMBER || '1990',
    i18n: {
      si: {
        address: localized(env.CLINIC_ADDRESS_SI, address, DEFAULT_ADDRESS, 'දන්ත වෛද්‍ය විද්‍යා පීඨය, පේරාදෙණිය විශ්වවිද්‍යාලය'),
        hours: localized(env.CLINIC_HOURS_SI, hours, DEFAULT_HOURS, 'සඳුදා - සිකුරාදා, පෙ.ව. 8.00 - ප.ව. 4.00'),
      },
      ta: {
        address: localized(env.CLINIC_ADDRESS_TA, address, DEFAULT_ADDRESS, 'பல் மருத்துவ அறிவியல் பீடம், பேராதனைப் பல்கலைக்கழகம்'),
        hours: localized(env.CLINIC_HOURS_TA, hours, DEFAULT_HOURS, 'திங்கள் - வெள்ளி, காலை 8:00 - மாலை 4:00'),
      },
    },
  },
};

/** Clinic details with the address and hours in the given language. */
export function clinicFor(lang) {
  const { i18n, ...base } = config.clinic;
  return { ...base, ...(i18n[lang] || {}) };
}

export const usingDefaultAdminPassword = !env.ADMIN_PASSWORD;
