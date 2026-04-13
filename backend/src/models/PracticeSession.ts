import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const timelinePointSchema = new Schema(
  {
    label: { type: String, required: true },
    value: { type: Number, required: true }
  },
  { _id: false }
);

const heatmapPointSchema = new Schema(
  {
    label: { type: String, required: true },
    score: { type: Number, required: true },
    note: { type: String, required: true }
  },
  { _id: false }
);

const practiceSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceDraftId: { type: String, unique: true, sparse: true, index: true },
    sourceFingerprint: { type: String, index: true, default: '' },
    practiceType: { type: String, enum: ['presentation', 'interview'], required: true },
    topic: { type: String, required: true, trim: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    transcript: { type: String, default: '' },
    durationSeconds: { type: Number, default: 0 },
    speechRateWpm: { type: Number, default: 0 },
    volumeStability: { type: Number, default: 0 },
    clarityScore: { type: Number, default: 0 },
    pauseScore: { type: Number, default: 0 },
    confidenceScore: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    fillerWordCount: { type: Number, default: 0 },
    repeatCount: { type: Number, default: 0 },
    summary: { type: String, default: '' },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    coachNotes: { type: [String], default: [] },
    followUpQuestions: { type: [String], default: [] },
    speedTimeline: { type: [timelinePointSchema], default: [] },
    heatmap: { type: [heatmapPointSchema], default: [] },
    passed: { type: Boolean, default: true },
    xpEarned: { type: Number, default: 0 },
    energyChange: { type: Number, default: 0 }
  },
  {
    timestamps: true
  }
);

export type PracticeSessionShape = InferSchemaType<typeof practiceSessionSchema> & {
  _id: Types.ObjectId;
};

export const PracticeSession = model('PracticeSession', practiceSessionSchema);
