// Central configuration, read once from environment variables (.env is loaded by `npm start`).

const env = process.env;

export const config = {
  port: Number(env.PORT) || 3000,
  adminPassword: env.ADMIN_PASSWORD || 'admin123',
  adminSecret: env.ADMIN_SECRET || 'dev-secret-change-me',
  anthropicEnabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
  clinic: {
    name: env.CLINIC_NAME || 'BrightSmile Dental Care',
    phone: env.CLINIC_PHONE || '+94 11 234 5678',
    email: env.CLINIC_EMAIL || 'hello@brightsmile.example',
    address: env.CLINIC_ADDRESS || '123 Galle Road, Colombo 03',
    hours: env.CLINIC_HOURS || 'Mon-Sat 8:30am-6:00pm',
    emergencyNumber: env.EMERGENCY_NUMBER || '1990',
  },
};

export const usingDefaultAdminPassword = !env.ADMIN_PASSWORD;
