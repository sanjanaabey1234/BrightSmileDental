// Central configuration, read once from environment variables (.env is loaded by `npm start`).

const env = process.env;

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
    address: env.CLINIC_ADDRESS || 'Faculty Of Dental Science, University Of Peradeniya',
    hours: env.CLINIC_HOURS || 'Mon-Sat 8:00am-4:00pm',
    emergencyNumber: env.EMERGENCY_NUMBER || '1990',
  },
};

export const usingDefaultAdminPassword = !env.ADMIN_PASSWORD;
