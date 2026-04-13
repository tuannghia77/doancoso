import multer from 'multer';
import { Router } from 'express';

import { authRequired } from '../middleware/auth.js';
import {
  analyzeCv,
  analyzePractice,
  createRealtimePracticeSession,
  extractResumeText,
  generateInterviewQuestion
} from '../services/aiService.js';
import {
  buildPracticeDraft,
  getPracticePassThreshold,
  signPracticeDraft
} from '../utils/practiceDraft.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const parseVolumeSamples = (value: unknown) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  return [];
};

const normalizeDifficulty = (value: unknown): 'easy' | 'medium' | 'hard' => {
  if (value === 'easy' || value === 'medium' || value === 'hard') {
    return value;
  }

  return 'medium';
};

const normalizePracticeType = (value: unknown): 'presentation' | 'interview' =>
  value === 'presentation' ? 'presentation' : 'interview';

router.post('/cv-analysis', authRequired, upload.single('cv'), async (req, res) => {
  const targetRole = String(req.body.targetRole ?? req.user?.targetRole ?? '');
  const manualResumeText = String(req.body.resumeText ?? '').trim();

  let resumeText = manualResumeText;
  if (req.file) {
    resumeText = await extractResumeText({
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      buffer: req.file.buffer
    });
  }

  if (!resumeText) {
    return res.status(400).json({ message: 'Vui lòng tải CV lên hoặc nhập nội dung CV.' });
  }

  const analysis = await analyzeCv({ resumeText, targetRole });
  const notice = String((analysis as { warningMessage?: string }).warningMessage ?? '').trim();

  return res.json({ analysis, extractedText: resumeText, notice });
});

router.post('/practice-analysis', authRequired, upload.single('audio'), async (req, res) => {
  const user = req.user!;
  const practiceType = normalizePracticeType(req.body.practiceType);
  const difficulty = normalizeDifficulty(req.body.difficulty);
  const topic = String(req.body.topic ?? 'Luyện tập SpeakAI').trim();
  const transcript = String(req.body.transcript ?? '').trim();
  const durationSeconds = Math.max(0, Number(req.body.durationSeconds ?? 0));
  const volumeSamples = parseVolumeSamples(req.body.volumeSamples);

  const analysis = await analyzePractice({
    practiceType,
    transcript,
    durationSeconds,
    volumeSamples,
    topic,
    audioFile: req.file
      ? {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          buffer: req.file.buffer
        }
      : undefined
  });

  const canSave = Boolean(String(analysis.transcript ?? '').trim());
  const notice =
    String((analysis as { warningMessage?: string }).warningMessage ?? '').trim() ||
    (canSave ? '' : 'Đã tạo bản phân tích cơ bản từ file ghi âm. Hãy dán transcript hoặc thử lại để có thể lưu phiên.');

  const draft = canSave
    ? buildPracticeDraft({
        userId: user._id.toString(),
        practiceType,
        difficulty,
        topic,
        durationSeconds,
        analysis
      })
    : null;

  return res.json({
    analysis,
    analysisToken: draft ? signPracticeDraft(draft) : '',
    outcome: draft
      ? {
          passed: draft.passed,
          label: draft.passed ? 'Đạt' : 'Chưa đạt',
          passThreshold: getPracticePassThreshold()
        }
      : null,
    notice
  });
});

router.post('/interview/next-question', authRequired, async (req, res) => {
  const { difficulty, history, targetRole, cvSummary } = req.body as {
    difficulty?: 'easy' | 'medium' | 'hard';
    history?: Array<{ question: string; answer: string }>;
    targetRole?: string;
    cvSummary?: string;
  };

  const nextQuestion = await generateInterviewQuestion({
    difficulty: normalizeDifficulty(difficulty),
    history: Array.isArray(history) ? history : [],
    targetRole: targetRole ?? req.user?.targetRole ?? '',
    cvSummary
  });

  return res.json({ nextQuestion });
});

router.post('/realtime/token', authRequired, async (req, res) => {
  const session = await createRealtimePracticeSession({
    practiceType: normalizePracticeType(req.body.practiceType),
    difficulty: normalizeDifficulty(req.body.difficulty),
    topic: String(req.body.topic ?? 'Luyện tập hội thoại SpeakAI').trim() || 'Luyện tập hội thoại SpeakAI',
    targetRole: req.user?.targetRole ?? '',
    profileSummary: req.user?.bio ?? '',
    userName: req.user?.name ?? ''
  });

  return res.json({ session });
});

export default router;
