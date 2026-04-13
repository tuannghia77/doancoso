import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { hashPassword, isRootAdminEmail } from '../utils/auth.js';
import { ensureDailyGoals, ensureWeeklyBucket } from '../utils/progression.js';

export const ensureDefaultAdmin = async () => {
  const adminEmail = env.adminEmail.toLowerCase();
  const existingAdmin = await User.findOne({ email: adminEmail });

  if (existingAdmin) {
    existingAdmin.role = 'admin';
    existingAdmin.isDisabled = false;
    existingAdmin.disabledAt = null;
    existingAdmin.disabledReason = '';
    existingAdmin.disabledByEmail = '';
    await existingAdmin.save();
    return existingAdmin;
  }

  const admin = new User({
    name: 'SpeakAI Admin Gốc',
    email: adminEmail,
    passwordHash: await hashPassword(env.adminPassword),
    role: 'admin',
    energy: 5,
    isDisabled: false
  });

  ensureWeeklyBucket(admin);
  ensureDailyGoals(admin);

  await admin.save();
  console.log(`Tài khoản quản trị viên gốc đã sẵn sàng: ${env.adminEmail}`);
  return admin;
};

export const canDisableUser = (email: string) => !isRootAdminEmail(email);

