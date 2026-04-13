import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { HydratedDocument } from 'mongoose';

import { env } from '../config/env.js';
import type { UserShape } from '../models/User.js';
import { getEnergyRefillMinutes, getLevelFromXp } from './progression.js';

export type UserDocument = HydratedDocument<UserShape>;

export const hashPassword = async (password: string) => bcrypt.hash(password, 10);

export const comparePassword = async (password: string, hash: string) => bcrypt.compare(password, hash);

export const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

export const isRootAdminEmail = (email: string) => email.toLowerCase().trim() === env.adminEmail.toLowerCase();

export const isRootAdmin = (user: Pick<UserShape, 'email'> | UserDocument) => isRootAdminEmail(user.email);

export const signToken = (user: UserDocument) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, { expiresIn: '7d' });

export const serializeUser = (user: UserDocument) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  avatarUrl: user.avatarUrl,
  bio: user.bio,
  targetRole: user.targetRole,
  experienceLevel: user.experienceLevel,
  skills: user.skills,
  streak: user.streak,
  longestStreak: user.longestStreak,
  totalXp: user.totalXp,
  weeklyXp: user.weeklyXp,
  level: getLevelFromXp(user.totalXp),
  energy: user.energy,
  energyRefillInMinutes: getEnergyRefillMinutes(user.energy, user.energyUpdatedAt),
  isDisabled: user.isDisabled,
  disabledReason: user.disabledReason,
  isRootAdmin: isRootAdmin(user),
  dailyGoals: user.dailyGoals,
  createdAt: user.createdAt
});
