import dotenv from 'dotenv';

dotenv.config();

const requireValue = (value: string | undefined, key: string) => {
  if (!value) {
    throw new Error(`${key} is required in the backend environment.`);
  }

  return value;
};

export const env = {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 5000),
  mongoUri: requireValue(process.env.MONGO_URI, 'MONGO_URI'),
  mongoUriFallback: process.env.MONGO_URI_FALLBACK ?? 'mongodb://127.0.0.1:27017/speakai',
  jwtSecret: requireValue(process.env.JWT_SECRET, 'JWT_SECRET'),
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiTextModel: process.env.OPENAI_TEXT_MODEL ?? 'gpt-4o-mini',
  openaiTranscribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe',
  openaiRealtimeModel: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime',
  openaiRealtimeVoice: process.env.OPENAI_REALTIME_VOICE ?? 'marin',
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, ''),
  mailFrom: process.env.MAIL_FROM ?? 'SpeakAI <no-reply@speakai.local>',
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@speakai.local',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'Admin@123'
};
