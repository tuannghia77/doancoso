import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const dailyGoalSchema = new Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    target: { type: Number, required: true },
    current: { type: Number, default: 0 },
    rewardXp: { type: Number, default: 0 },
    rewardEnergy: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    claimed: { type: Boolean, default: false }
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    avatarUrl: { type: String, default: '' },
    bio: { type: String, default: '' },
    targetRole: { type: String, default: '' },
    experienceLevel: { type: String, default: 'beginner' },
    skills: { type: [String], default: [] },
    streak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastLoginDate: { type: String, default: '' },
    totalXp: { type: Number, default: 0 },
    weeklyXp: { type: Number, default: 0 },
    weeklyBucket: { type: String, default: '' },
    previousWeeklyXp: { type: Number, default: 0 },
    previousWeeklyBucket: { type: String, default: '' },
    previousWeeklyClosedAt: { type: Date, default: null },
    energy: { type: Number, default: 5 },
    energyUpdatedAt: { type: Date, default: Date.now },
    isDisabled: { type: Boolean, default: false },
    disabledAt: { type: Date, default: null },
    disabledReason: { type: String, default: '' },
    disabledByEmail: { type: String, default: '' },
    dailyGoalDate: { type: String, default: '' },
    dailyGoals: { type: [dailyGoalSchema], default: [] }
  },
  {
    timestamps: true
  }
);

export type DailyGoal = InferSchemaType<typeof dailyGoalSchema>;
export type UserShape = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };

export const User = model('User', userSchema);
