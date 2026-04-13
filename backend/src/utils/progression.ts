import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import utc from 'dayjs/plugin/utc.js';
import type { HydratedDocument } from 'mongoose';

import type { DailyGoal, UserShape } from '../models/User.js';

dayjs.extend(utc);
dayjs.extend(isoWeek);

export type UserDocument = HydratedDocument<UserShape>;

const ENERGY_MAX = 5;
const ENERGY_REFILL_MINUTES = 30;
const XP_PER_LEVEL = 200;

const goalTemplates = [
  {
    key: 'login_today',
    title: 'Điểm danh hôm nay',
    description: 'Đăng nhập ít nhất một lần trong ngày.',
    target: 1,
    rewardXp: 20,
    rewardEnergy: 0
  },
  {
    key: 'practice_once',
    title: 'Khởi động 1 phiên',
    description: 'Hoàn thành ít nhất một lượt luyện tập trong ngày.',
    target: 1,
    rewardXp: 40,
    rewardEnergy: 1
  },
  {
    key: 'practice_minutes',
    title: '15 phút tập trung',
    description: 'Tích lũy tối thiểu 15 phút luyện tập trong ngày.',
    target: 15,
    rewardXp: 60,
    rewardEnergy: 1
  }
] as const;

export const getDayKey = (date = dayjs()) => date.format('YYYY-MM-DD');

export const getWeekKey = (date = dayjs()) => `${date.isoWeekYear()}-W${String(date.isoWeek()).padStart(2, '0')}`;

export const getLevelFromXp = (totalXp: number) => Math.max(1, Math.floor(totalXp / XP_PER_LEVEL) + 1);

export const getEnergyRefillMinutes = (energy: number, energyUpdatedAt: Date) => {
  if (energy >= ENERGY_MAX) {
    return 0;
  }

  const elapsedMinutes = dayjs().diff(dayjs(energyUpdatedAt), 'minute');
  const remainder = elapsedMinutes % ENERGY_REFILL_MINUTES;
  return remainder === 0 ? ENERGY_REFILL_MINUTES : ENERGY_REFILL_MINUTES - remainder;
};

const buildFreshGoals = (): DailyGoal[] =>
  goalTemplates.map((goal) => ({
    ...goal,
    current: 0,
    completed: false,
    claimed: false
  }));

const shouldRefreshGoals = (user: UserDocument) =>
  user.dailyGoals.length !== goalTemplates.length ||
  goalTemplates.some((template) => {
    const existingGoal = user.dailyGoals.find((goal) => goal.key === template.key);
    if (!existingGoal) {
      return true;
    }

    return (
      existingGoal.title !== template.title ||
      existingGoal.description !== template.description ||
      existingGoal.target !== template.target ||
      existingGoal.rewardXp !== template.rewardXp ||
      existingGoal.rewardEnergy !== template.rewardEnergy
    );
  });

const rebuildGoalsFromTemplates = (user: UserDocument): DailyGoal[] =>
  goalTemplates.map((template) => {
    const existingGoal = user.dailyGoals.find((goal) => goal.key === template.key);
    const current = Math.min(template.target, Math.max(0, existingGoal?.current ?? 0));
    const claimed = existingGoal?.claimed ?? false;
    const completed = (existingGoal?.completed ?? claimed) || current >= template.target;

    return {
      ...template,
      current,
      completed,
      claimed
    };
  });

const upsertGoal = (user: UserDocument, key: string, updater: (goal: DailyGoal) => void) => {
  const goal = user.dailyGoals.find((item) => item.key === key);
  if (goal) {
    updater(goal);
  }
};

export const ensureWeeklyBucket = (user: UserDocument) => {
  const currentWeek = getWeekKey();
  if (user.weeklyBucket !== currentWeek) {
    user.weeklyBucket = currentWeek;
    user.weeklyXp = 0;
  }
};

export const refillEnergy = (user: UserDocument) => {
  if (user.energy >= ENERGY_MAX) {
    user.energy = ENERGY_MAX;
    user.energyUpdatedAt = new Date();
    return;
  }

  const now = dayjs();
  const updatedAt = dayjs(user.energyUpdatedAt);
  const recovered = Math.floor(now.diff(updatedAt, 'minute') / ENERGY_REFILL_MINUTES);

  if (recovered <= 0) {
    return;
  }

  user.energy = Math.min(ENERGY_MAX, user.energy + recovered);
  if (user.energy >= ENERGY_MAX) {
    user.energyUpdatedAt = new Date();
    return;
  }

  user.energyUpdatedAt = updatedAt.add(recovered * ENERGY_REFILL_MINUTES, 'minute').toDate();
};

export const ensureDailyGoals = (user: UserDocument) => {
  const today = getDayKey();
  if (user.dailyGoalDate !== today) {
    user.dailyGoalDate = today;
    user.set('dailyGoals', buildFreshGoals());
    return;
  }

  if (shouldRefreshGoals(user)) {
    user.set('dailyGoals', rebuildGoalsFromTemplates(user));
  }
};

export const markLoginGoal = (user: UserDocument) => {
  upsertGoal(user, 'login_today', (goal) => {
    goal.current = 1;
    goal.completed = true;
  });
};

export const syncGoalsWithStats = (
  user: UserDocument,
  stats: { sessionCount: number; totalMinutes: number }
) => {
  ensureDailyGoals(user);

  upsertGoal(user, 'practice_once', (goal) => {
    goal.current = Math.min(goal.target, stats.sessionCount);
    goal.completed = stats.sessionCount >= goal.target;
  });

  upsertGoal(user, 'practice_minutes', (goal) => {
    goal.current = Math.min(goal.target, stats.totalMinutes);
    goal.completed = stats.totalMinutes >= goal.target;
  });

  if (user.lastLoginDate === getDayKey()) {
    markLoginGoal(user);
  }
};

export const applyLoginProgression = (user: UserDocument) => {
  ensureWeeklyBucket(user);
  refillEnergy(user);
  ensureDailyGoals(user);

  const today = getDayKey();
  if (user.lastLoginDate === today) {
    markLoginGoal(user);
    return false;
  }

  const yesterday = getDayKey(dayjs().subtract(1, 'day'));
  user.streak = user.lastLoginDate === yesterday ? user.streak + 1 : 1;
  user.longestStreak = Math.max(user.longestStreak, user.streak);
  user.lastLoginDate = today;
  markLoginGoal(user);
  return true;
};

export const awardPracticeProgress = (
  user: UserDocument,
  input: { durationSeconds: number; passed: boolean; difficulty: 'easy' | 'medium' | 'hard' }
) => {
  ensureWeeklyBucket(user);
  refillEnergy(user);
  ensureDailyGoals(user);

  const durationMinutes = input.durationSeconds / 60;
  const difficultyBonus = input.difficulty === 'hard' ? 20 : input.difficulty === 'medium' ? 12 : 6;
  const consistencyBonus = Math.min(30, Math.round(durationMinutes * 2));
  const outcomeBonus = input.passed ? 18 : 4;
  const xpEarned = 25 + difficultyBonus + consistencyBonus + outcomeBonus;
  let energyChange = 0;

  if (!input.passed) {
    const previousEnergy = user.energy;
    user.energy = Math.max(0, user.energy - 1);
    user.energyUpdatedAt = new Date();
    energyChange = user.energy - previousEnergy;
  }

  user.totalXp += xpEarned;
  user.weeklyXp += xpEarned;

  return { xpEarned, energyChange };
};

export const claimGoalReward = (user: UserDocument, goalKey: string) => {
  ensureWeeklyBucket(user);
  refillEnergy(user);
  ensureDailyGoals(user);

  const goal = user.dailyGoals.find((item) => item.key === goalKey);
  if (!goal) {
    throw new Error('Không tìm thấy mục tiêu.');
  }

  if (!goal.completed) {
    throw new Error('Mục tiêu chưa hoàn thành.');
  }

  if (goal.claimed) {
    throw new Error('Mục tiêu đã được nhận thưởng.');
  }

  goal.claimed = true;
  user.totalXp += goal.rewardXp;
  user.weeklyXp += goal.rewardXp;
  user.energy = Math.min(ENERGY_MAX, user.energy + goal.rewardEnergy);
  if (goal.rewardEnergy > 0) {
    user.energyUpdatedAt = new Date();
  }

  return goal;
};

export const calculateWeekComparison = (thisWeekMinutes: number, lastWeekMinutes: number) => {
  if (lastWeekMinutes === 0) {
    return {
      thisWeekMinutes,
      lastWeekMinutes,
      differencePercent: thisWeekMinutes > 0 ? 100 : 0,
      trend: thisWeekMinutes > 0 ? 'up' : 'flat'
    } as const;
  }

  const differencePercent = Math.round(((thisWeekMinutes - lastWeekMinutes) / lastWeekMinutes) * 100);
  return {
    thisWeekMinutes,
    lastWeekMinutes,
    differencePercent,
    trend: differencePercent > 0 ? 'up' : differencePercent < 0 ? 'down' : 'flat'
  } as const;
};

