import mongoose from 'mongoose';

import { connectDatabase } from '../config/db.js';
import { ensureDefaultAdmin } from '../services/bootstrapService.js';

const run = async () => {
  await connectDatabase();
  await ensureDefaultAdmin();
  await mongoose.disconnect();
  console.log('Admin seed completed.');
};

run().catch(async (error) => {
  console.error('Admin seed failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
