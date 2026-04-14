import { createHash, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

export type PracticeDraftAnalysis = {
  transcript: string;
  speechRateWpm: number;
  volumeStability: number;
  clarityScore: number;
  pauseScore: number;
  confidenceScore: number;
  totalScore: number;
  fillerWordCount: number;
  repeatCount: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  coachNotes: string[];
  followUpQuestions: string[];
  speedTimeline: Array<{ label: string; value: number }>;
  heatmap: Array<{ label: string; score: number; note: string }>;
};

export type PracticeDraftAnalysisInput = Partial<PracticeDraftAnalysis>;

export type PracticeDraft = {
  draftId: string;
  fingerprint: string;
  userId: string;
  practiceType: 'presentation' | 'interview';
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  durationSeconds: number;
  passed: boolean;
  analysis: PracticeDraftAnalysis;
};

const PRACTICE_PASS_SCORE = 50;
const PRACTICE_DRAFT_TOKEN_TYPE = 'practice_draft';

const roundMetric = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(value)));

const normalizeAnalysis = (analysis: PracticeDraftAnalysisInput): PracticeDraftAnalysis => ({
  transcript: String(analysis.transcript ?? '').trim(),
  speechRateWpm: roundMetric(Number(analysis.speechRateWpm ?? 0), 0, 240),
  volumeStability: roundMetric(Number(analysis.volumeStability ?? 0)),
  clarityScore: roundMetric(Number(analysis.clarityScore ?? 0)),
  pauseScore: roundMetric(Number(analysis.pauseScore ?? 0)),
  confidenceScore: roundMetric(Number(analysis.confidenceScore ?? 0)),
  totalScore: roundMetric(Number(analysis.totalScore ?? 0)),
  fillerWordCount: Math.max(0, Math.round(Number(analysis.fillerWordCount ?? 0))),
  repeatCount: Math.max(0, Math.round(Number(analysis.repeatCount ?? 0))),
  summary: String(analysis.summary ?? '').trim(),
  strengths: Array.isArray(analysis.strengths) ? analysis.strengths.map((item) => item.trim()).filter(Boolean) : [],
  improvements: Array.isArray(analysis.improvements)
    ? analysis.improvements.map((item) => item.trim()).filter(Boolean)
    : [],
  coachNotes: Array.isArray(analysis.coachNotes) ? analysis.coachNotes.map((item) => item.trim()).filter(Boolean) : [],
  followUpQuestions: Array.isArray(analysis.followUpQuestions)
    ? analysis.followUpQuestions.map((item) => item.trim()).filter(Boolean)
    : [],
  speedTimeline: Array.isArray(analysis.speedTimeline)
    ? analysis.speedTimeline.map((point, index) => ({
        label: String(point?.label ?? `Đoạn ${index + 1}`).trim(),
        value: roundMetric(Number(point?.value ?? 0), 0, 240)
      }))
    : [],
  heatmap: Array.isArray(analysis.heatmap)
    ? analysis.heatmap.map((point, index) => ({
        label: String(point?.label ?? `Đoạn ${index + 1}`).trim(),
        score: roundMetric(Number(point?.score ?? 0)),
        note: String(point?.note ?? 'Đoạn cần xem lại').trim()
      }))
    : []
});

const buildPracticeFingerprint = (input: {
  userId: string;
  practiceType: 'presentation' | 'interview';
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  durationSeconds: number;
  analysis: PracticeDraftAnalysis;
}) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        userId: input.userId,
        practiceType: input.practiceType,
        difficulty: input.difficulty,
        topic: input.topic.trim().toLowerCase(),
        durationSeconds: input.durationSeconds,
        transcript: input.analysis.transcript.trim().toLowerCase(),
        totalScore: input.analysis.totalScore,
        speechRateWpm: input.analysis.speechRateWpm,
        volumeStability: input.analysis.volumeStability,
        clarityScore: input.analysis.clarityScore,
        pauseScore: input.analysis.pauseScore,
        confidenceScore: input.analysis.confidenceScore
      })
    )
    .digest('hex');

export const determinePracticePassed = (totalScore: number) => roundMetric(totalScore) >= PRACTICE_PASS_SCORE;

export const getPracticePassThreshold = () => PRACTICE_PASS_SCORE;

export const buildPracticeDraft = (input: {
  userId: string;
  practiceType: 'presentation' | 'interview';
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  durationSeconds: number;
  analysis: PracticeDraftAnalysisInput;
}): PracticeDraft => {
  const normalizedAnalysis = normalizeAnalysis(input.analysis);
  const safeDurationSeconds = Math.min(60 * 30, Math.max(0, Math.round(input.durationSeconds)));

  return {
    draftId: randomUUID(),
    fingerprint: buildPracticeFingerprint({
      userId: input.userId,
      practiceType: input.practiceType,
      difficulty: input.difficulty,
      topic: input.topic,
      durationSeconds: safeDurationSeconds,
      analysis: normalizedAnalysis
    }),
    userId: input.userId,
    practiceType: input.practiceType,
    difficulty: input.difficulty,
    topic: input.topic.trim(),
    durationSeconds: safeDurationSeconds,
    passed: determinePracticePassed(normalizedAnalysis.totalScore),
    analysis: normalizedAnalysis
  };
};

export const signPracticeDraft = (draft: PracticeDraft) =>
  jwt.sign({ type: PRACTICE_DRAFT_TOKEN_TYPE, draft }, env.jwtSecret, { expiresIn: '2h' });

export const verifyPracticeDraft = (token: string) => {
  const payload = jwt.verify(token, env.jwtSecret) as { type?: string; draft?: PracticeDraft };

  if (payload.type !== PRACTICE_DRAFT_TOKEN_TYPE || !payload.draft) {
    throw new Error('Phiên phân tích không hợp lệ.');
  }

  return payload.draft;
};
