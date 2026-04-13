export type UserRole = 'admin' | 'user';
export type PracticeType = 'presentation' | 'interview';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DailyGoal {
  key: string;
  title: string;
  description: string;
  target: number;
  current: number;
  rewardXp: number;
  rewardEnergy: number;
  completed: boolean;
  claimed: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string;
  bio: string;
  targetRole: string;
  experienceLevel: string;
  skills: string[];
  streak: number;
  longestStreak: number;
  totalXp: number;
  weeklyXp: number;
  level: number;
  energy: number;
  energyRefillInMinutes: number;
  isDisabled: boolean;
  disabledReason: string;
  isRootAdmin: boolean;
  dailyGoals: DailyGoal[];
  createdAt: string;
}

export interface PracticeChartPoint {
  label: string;
  value: number;
}

export interface HeatmapPoint {
  label: string;
  score: number;
  note: string;
}

export interface PracticeAnalysis {
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
  speedTimeline: PracticeChartPoint[];
  heatmap: HeatmapPoint[];
}

export interface PracticeSession extends PracticeAnalysis {
  id: string;
  practiceType: PracticeType;
  topic: string;
  difficulty: Difficulty;
  durationSeconds: number;
  passed: boolean;
  xpEarned: number;
  energyChange: number;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  targetRole: string;
  weeklyXp: number;
  totalXp: number;
  streak: number;
}

export interface WeeklyTimelinePoint {
  day: string;
  minutes: number;
  xp: number;
}

export interface DashboardData {
  user: User;
  overview: {
    totalSessions: number;
    sessionsToday: number;
    minutesToday: number;
    thisWeekMinutes: number;
    lastWeekMinutes: number;
  };
  progress: {
    thisWeekMinutes: number;
    lastWeekMinutes: number;
    differencePercent: number;
    trend: 'up' | 'down' | 'flat';
  };
  weeklyTimeline: WeeklyTimelinePoint[];
  leaderboard: LeaderboardEntry[];
  recentSessions: PracticeSession[];
}

export interface CvAnalysisQuestion {
  question: string;
  purpose: string;
}

export interface CvAnalysisResult {
  summary: string;
  strengths: string[];
  improvements: string[];
  interviewQuestions: CvAnalysisQuestion[];
  practicePlan: string[];
}

export interface InterviewQuestionResult {
  question: string;
  reason: string;
  challenge: string;
  suggestedFocus: string[];
}
