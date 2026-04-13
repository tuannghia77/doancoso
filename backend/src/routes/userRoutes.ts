import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import { Router } from 'express';

import { authRequired } from '../middleware/auth.js';
import { PracticeSession } from '../models/PracticeSession.js';
import { serializeUser } from '../utils/auth.js';
import { calculateWeekComparison, claimGoalReward, syncGoalsWithStats } from '../utils/progression.js';
import {
  getLeaderboard,
  getRecentPracticeSessions,
  getTodayPracticeStats,
  getWeeklyTimeline,
  getWeekMinutes
} from '../utils/sessionStats.js';

dayjs.extend(isoWeek);

const router = Router();

const mapSession = (session: any) => ({
  id: session._id.toString(),
  practiceType: session.practiceType,
  topic: session.topic,
  difficulty: session.difficulty,
  durationSeconds: session.durationSeconds,
  speechRateWpm: session.speechRateWpm,
  volumeStability: session.volumeStability,
  confidenceScore: session.confidenceScore,
  totalScore: session.totalScore,
  passed: session.passed,
  xpEarned: session.xpEarned,
  energyChange: session.energyChange,
  summary: session.summary,
  strengths: session.strengths,
  improvements: session.improvements,
  coachNotes: session.coachNotes,
  followUpQuestions: session.followUpQuestions,
  speedTimeline: session.speedTimeline,
  heatmap: session.heatmap,
  transcript: session.transcript,
  createdAt: session.createdAt
});

router.get('/dashboard', authRequired, async (req, res) => {
  const user = req.user!;

  const [todayStats, thisWeekMinutes, lastWeekMinutes, weeklyTimeline, recentSessions, leaderboard, totalSessions] =
    await Promise.all([
      getTodayPracticeStats(user._id.toString()),
      getWeekMinutes(user._id.toString(), 0),
      getWeekMinutes(user._id.toString(), -1),
      getWeeklyTimeline(user._id.toString()),
      getRecentPracticeSessions(user._id.toString(), 6),
      getLeaderboard(10),
      PracticeSession.countDocuments({ userId: user._id })
    ]);

  syncGoalsWithStats(user, todayStats);
  await user.save();

  return res.json({
    user: serializeUser(user),
    overview: {
      totalSessions,
      sessionsToday: todayStats.sessionCount,
      minutesToday: todayStats.totalMinutes,
      thisWeekMinutes,
      lastWeekMinutes
    },
    progress: calculateWeekComparison(thisWeekMinutes, lastWeekMinutes),
    weeklyTimeline,
    leaderboard,
    recentSessions: recentSessions.map(mapSession)
  });
});

router.patch('/profile', authRequired, async (req, res) => {
  const user = req.user!;
  const { name, bio, targetRole, experienceLevel, skills, avatarUrl } = req.body as {
    name?: string;
    bio?: string;
    targetRole?: string;
    experienceLevel?: string;
    skills?: string[] | string;
    avatarUrl?: string;
  };

  if (name) user.name = name.trim();
  if (bio !== undefined) user.bio = bio.trim();
  if (targetRole !== undefined) user.targetRole = targetRole.trim();
  if (experienceLevel !== undefined) user.experienceLevel = experienceLevel.trim() || 'beginner';
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl.trim();
  if (skills !== undefined) {
    user.skills = Array.isArray(skills)
      ? skills.map((item) => item.trim()).filter(Boolean)
      : skills
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
  }

  await user.save();
  return res.json({ message: 'Cập nhật hồ sơ thành công.', user: serializeUser(user) });
});

router.get('/practice-history', authRequired, async (req, res) => {
  const user = req.user!;
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const sessions = await getRecentPracticeSessions(user._id.toString(), limit);
  return res.json({ sessions: sessions.map(mapSession) });
});

router.post('/goals/:goalKey/claim', authRequired, async (req, res) => {
  const user = req.user!;
  const todayStats = await getTodayPracticeStats(user._id.toString());
  syncGoalsWithStats(user, todayStats);

  try {
    const goal = claimGoalReward(user, String(req.params.goalKey));
    await user.save();
    return res.json({ message: 'Nhận thưởng thành công.', goal, user: serializeUser(user) });
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : 'Không thể nhận thưởng lúc này.'
    });
  }
});

export default router;
