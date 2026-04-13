import { Router } from 'express';

import { authRequired } from '../middleware/auth.js';
import { PracticeSession } from '../models/PracticeSession.js';
import { serializeUser } from '../utils/auth.js';
import { verifyPracticeDraft } from '../utils/practiceDraft.js';
import { awardPracticeProgress, syncGoalsWithStats } from '../utils/progression.js';
import { getTodayPracticeStats } from '../utils/sessionStats.js';

const router = Router();
const DUPLICATE_FINGERPRINT_WINDOW_MS = 10 * 60 * 1000;

router.post('/sessions', authRequired, async (req, res) => {
  const user = req.user!;
  const { analysisToken } = req.body as {
    analysisToken?: string;
  };

  if (!analysisToken) {
    return res.status(400).json({ message: 'Thiếu phiên phân tích hợp lệ. Vui lòng phân tích lại trước khi lưu.' });
  }

  let draft;
  try {
    draft = verifyPracticeDraft(String(analysisToken));
  } catch (_error) {
    return res.status(400).json({ message: 'Phiên phân tích đã hết hạn hoặc không hợp lệ. Vui lòng phân tích lại.' });
  }

  if (draft.userId !== user._id.toString()) {
    return res.status(403).json({ message: 'Bạn không có quyền sử dụng phiên phân tích này.' });
  }

  const existingSession = await PracticeSession.findOne({
    userId: user._id,
    sourceDraftId: draft.draftId
  });

  if (existingSession) {
    return res.status(409).json({ message: 'Bài phân tích này đã được lưu trước đó.' });
  }

  const duplicateWindowStart = new Date(Date.now() - DUPLICATE_FINGERPRINT_WINDOW_MS);
  const replaySession = await PracticeSession.findOne({
    userId: user._id,
    sourceFingerprint: draft.fingerprint,
    createdAt: { $gte: duplicateWindowStart }
  });

  if (replaySession) {
    return res.status(409).json({
      message: 'Bạn vừa lưu một phiên có nội dung gần như trùng lặp. Hãy luyện lại hoặc chỉnh nội dung trước khi lưu thêm.'
    });
  }

  const reward = awardPracticeProgress(user, {
    durationSeconds: draft.durationSeconds,
    passed: draft.passed,
    difficulty: draft.difficulty
  });

  try {
    const session = await PracticeSession.create({
      userId: user._id,
      sourceDraftId: draft.draftId,
      sourceFingerprint: draft.fingerprint,
      practiceType: draft.practiceType,
      topic: draft.topic,
      difficulty: draft.difficulty,
      transcript: draft.analysis.transcript,
      durationSeconds: draft.durationSeconds,
      speechRateWpm: draft.analysis.speechRateWpm,
      volumeStability: draft.analysis.volumeStability,
      clarityScore: draft.analysis.clarityScore,
      pauseScore: draft.analysis.pauseScore,
      confidenceScore: draft.analysis.confidenceScore,
      totalScore: draft.analysis.totalScore,
      fillerWordCount: draft.analysis.fillerWordCount,
      repeatCount: draft.analysis.repeatCount,
      summary: draft.analysis.summary,
      strengths: draft.analysis.strengths,
      improvements: draft.analysis.improvements,
      coachNotes: draft.analysis.coachNotes,
      followUpQuestions: draft.analysis.followUpQuestions,
      speedTimeline: draft.analysis.speedTimeline,
      heatmap: draft.analysis.heatmap,
      passed: draft.passed,
      xpEarned: reward.xpEarned,
      energyChange: reward.energyChange
    });

    const todayStats = await getTodayPracticeStats(user._id.toString());
    syncGoalsWithStats(user, todayStats);
    await user.save();

    return res.status(201).json({
      message: 'Đã lưu lịch sử luyện tập.',
      user: serializeUser(user),
      session
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Bài phân tích này đã được lưu trước đó.' });
    }

    throw error;
  }
});

export default router;
