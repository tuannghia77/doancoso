import mongoose from 'mongoose';

import { env } from './env.js';

const connectWithUri = async (uri: string, label: string) => {
  await mongoose.connect(uri);
  console.log(`MongoDB connected (${label}).`);
};

export const connectDatabase = async () => {
  mongoose.set('strictQuery', true);

  try {
    await connectWithUri(env.mongoUri, 'primary');
  } catch (primaryError) {
    console.warn('Primary MongoDB connection failed.');
    console.warn(primaryError);

    if (!env.mongoUriFallback) {
      throw primaryError;
    }

    await mongoose.disconnect().catch(() => undefined);

    try {
      await connectWithUri(env.mongoUriFallback, 'fallback');
    } catch (fallbackError) {
      console.error('Fallback MongoDB connection failed.');
      console.error(fallbackError);
      throw fallbackError;
    }
  }
};
