import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import { Types } from 'mongoose';

import { PracticeSession } from '../models/PracticeSession.js';
import { User } from '../models/User.js';
import { getWeekKey } from './progression.js';

dayjs.extend(isoWeek);

const toObjectId = (id: string) => new Types.ObjectId(id);

export const getTodayPracticeStats = async (userId: string) => {
  const start = dayjs().startOf('day').toDate();
  const end = dayjs().endOf('day').toDate();

  const [summary] = await PracticeSession.aggregate([
    {
      $match: {
        userId: toObjectId(userId),
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: null,
        sessionCount: { $sum: 1 },
        totalMinutes: { $sum: { $divide: ['$durationSeconds', 60] } }
      }
    }
  ]);

  return {
    sessionCount: summary?.sessionCount ?? 0,
    totalMinutes: Math.round(summary?.totalMinutes ?? 0)
  };
};

export const getWeekMinutes = async (userId: string, offset = 0) => {
  const start = dayjs().startOf('isoWeek').add(offset, 'week').toDate();
  const end = dayjs().endOf('isoWeek').add(offset, 'week').toDate();

  const [summary] = await PracticeSession.aggregate([
    {
      $match: {
        userId: toObjectId(userId),
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: null,
        totalMinutes: { $sum: { $divide: ['$durationSeconds', 60] } }
      }
    }
  ]);

  return Math.round(summary?.totalMinutes ?? 0);
};

export const getWeeklyTimeline = async (userId: string) => {
  const start = dayjs().startOf('isoWeek').toDate();
  const end = dayjs().endOf('isoWeek').toDate();

  const rows = await PracticeSession.aggregate([
    {
      $match: {
        userId: toObjectId(userId),
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        minutes: { $sum: { $divide: ['$durationSeconds', 60] } },
        xp: { $sum: '$xpEarned' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  const byDay = new Map(rows.map((row) => [row._id, row]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = dayjs().startOf('isoWeek').add(index, 'day');
    const key = date.format('YYYY-MM-DD');
    const row = byDay.get(key);

    return {
      day: date.format('dd'),
      minutes: Math.round(row?.minutes ?? 0),
      xp: row?.xp ?? 0
    };
  });
};

export const getRecentPracticeSessions = async (userId: string, limit = 8) =>
  PracticeSession.find({ userId }).sort({ createdAt: -1 }).limit(limit);

export const getLeaderboard = async (limit = 10) => {
  const users = await User.find({ role: 'user', weeklyBucket: getWeekKey() })
    .sort({ weeklyXp: -1, totalXp: -1, updatedAt: 1 })
    .limit(limit);

  return users.map((user, index) => ({
    rank: index + 1,
    id: user._id.toString(),
    name: user.name,
    targetRole: user.targetRole,
    weeklyXp: user.weeklyXp,
    totalXp: user.totalXp,
    streak: user.streak
  }));
};
