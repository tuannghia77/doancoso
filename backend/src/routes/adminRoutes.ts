import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import { Router } from 'express';

import { adminOnly, authRequired } from '../middleware/auth.js';
import { PracticeSession } from '../models/PracticeSession.js';
import { User } from '../models/User.js';
import { canDisableUser } from '../services/bootstrapService.js';
import { isRootAdmin } from '../utils/auth.js';
import { getWeekKey } from '../utils/progression.js';

dayjs.extend(isoWeek);

const router = Router();

router.get('/overview', authRequired, adminOnly, async (_req, res) => {
  const startOfWeek = dayjs().startOf('isoWeek').toDate();
  const currentWeek = getWeekKey();

  const [usersCount, adminsCount, disabledUsersCount, sessionsThisWeek, topUsers, recentUsers, recentSessions] =
    await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ isDisabled: true }),
      PracticeSession.countDocuments({ createdAt: { $gte: startOfWeek } }),
      User.find({ role: 'user', weeklyBucket: currentWeek }).sort({ weeklyXp: -1, totalXp: -1 }).limit(5),
      User.find().sort({ createdAt: -1 }).limit(5),
      PracticeSession.find().populate('userId', 'name email').sort({ createdAt: -1 }).limit(8)
    ]);

  return res.json({
    stats: {
      usersCount,
      adminsCount,
      disabledUsersCount,
      sessionsThisWeek
    },
    topUsers: topUsers.map((user, index) => ({
      rank: index + 1,
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      weeklyXp: user.weeklyXp,
      streak: user.streak,
      energy: user.energy,
      isDisabled: user.isDisabled
    })),
    recentUsers: recentUsers.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      totalXp: user.totalXp,
      isDisabled: user.isDisabled,
      isRootAdmin: isRootAdmin(user)
    })),
    recentSessions: recentSessions.map((session: any) => ({
      id: session._id.toString(),
      practiceType: session.practiceType,
      topic: session.topic,
      user: session.userId,
      totalScore: session.totalScore,
      xpEarned: session.xpEarned,
      createdAt: session.createdAt
    }))
  });
});

router.get('/users', authRequired, adminOnly, async (_req, res) => {
  const currentWeek = getWeekKey();
  const users = await User.find().sort({ createdAt: -1 }).limit(200);
  return res.json({
    users: users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      streak: user.streak,
      totalXp: user.totalXp,
      weeklyXp: user.weeklyBucket === currentWeek ? user.weeklyXp : 0,
      previousWeeklyXp: user.previousWeeklyXp ?? 0,
      previousWeeklyBucket: user.previousWeeklyBucket ?? '',
      energy: user.energy,
      targetRole: user.targetRole,
      createdAt: user.createdAt,
      isDisabled: user.isDisabled,
      disabledAt: user.disabledAt,
      disabledReason: user.disabledReason,
      isRootAdmin: isRootAdmin(user)
    }))
  });
});

router.patch('/users/:userId/status', authRequired, adminOnly, async (req, res) => {
  const actor = req.user!;
  const { isDisabled, reason } = req.body as { isDisabled?: boolean; reason?: string };

  if (typeof isDisabled !== 'boolean') {
    return res.status(400).json({ message: 'Vui lòng truyền trạng thái vô hiệu hóa hợp lệ.' });
  }

  const targetUser = await User.findById(req.params.userId);
  if (!targetUser) {
    return res.status(404).json({ message: 'Không tìm thấy tài khoản cần cập nhật.' });
  }

  if (!canDisableUser(targetUser.email)) {
    return res.status(400).json({ message: 'Không thể vô hiệu hóa tài khoản quản trị viên gốc.' });
  }

  if (targetUser._id.toString() === actor._id.toString()) {
    return res.status(400).json({ message: 'Bạn không thể tự vô hiệu hóa chính mình.' });
  }

  targetUser.isDisabled = isDisabled;
  targetUser.disabledAt = isDisabled ? new Date() : null;
  targetUser.disabledReason = isDisabled ? String(reason ?? '').trim() : '';
  targetUser.disabledByEmail = isDisabled ? actor.email : '';
  await targetUser.save();

  return res.json({
    message: isDisabled ? 'Đã vô hiệu hóa tài khoản thành công.' : 'Đã kích hoạt lại tài khoản thành công.',
    user: {
      id: targetUser._id.toString(),
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      isDisabled: targetUser.isDisabled,
      disabledReason: targetUser.disabledReason,
      isRootAdmin: isRootAdmin(targetUser)
    }
  });
});

router.get('/sessions', authRequired, adminOnly, async (_req, res) => {
  const sessions = await PracticeSession.find()
    .populate('userId', 'name email')
    .sort({ createdAt: -1 })
    .limit(100);

  return res.json({
    sessions: sessions.map((session: any) => ({
      id: session._id.toString(),
      practiceType: session.practiceType,
      topic: session.topic,
      difficulty: session.difficulty,
      totalScore: session.totalScore,
      xpEarned: session.xpEarned,
      passed: session.passed,
      createdAt: session.createdAt,
      user: session.userId
    }))
  });
});

export default router;

