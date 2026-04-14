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
  weeklyBucket?: string;
  previousWeeklyXp?: number;
  previousWeeklyBucket?: string;
  previousWeeklyClosedAt?: string | null;
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
  reply?: string;
  question: string;
  reason: string;
  challenge: string;
  suggestedFocus: string[];
}

export type CourseAccessStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type CourseCategory = 'presentation' | 'interview' | 'cv';

export interface CourseSummary {
  id: string;
  title: string;
  category: CourseCategory;
  summary: string;
  description: string;
  thumbnailUrl: string;
  level: string;
  estimatedDuration: string;
  lessonsCount: number;
  isPublished: boolean;
  accessStatus: CourseAccessStatus;
  canView: boolean;
  canRequest: boolean;
  requestedAt?: string | null;
  reviewedAt?: string | null;
  adminNote?: string;
}

export interface CourseLesson {
  title: string;
  description: string;
  durationLabel: string;
  order: number;
  youtubeVideoId: string;
  youtubeUrl: string;
  embedUrl: string;
}

export interface CourseDetail extends CourseSummary {
  lessons: CourseLesson[];
}

export interface AdminCourseSummary {
  id: string;
  title: string;
  category: CourseCategory;
  summary: string;
  description: string;
  thumbnailUrl: string;
  level: string;
  estimatedDuration: string;
  isPublished: boolean;
  lessonsCount: number;
  lessons: Array<{
    title: string;
    description: string;
    durationLabel: string;
    youtubeUrl: string;
    youtubeVideoId: string;
    order: number;
  }>;
  createdAt: string;
}

export interface CourseRequestRecord {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  reviewedAt?: string | null;
  adminNote: string;
  course: {
    id: string;
    title: string;
    category?: CourseCategory;
  } | null;
  user: {
    id: string;
    name: string;
    email: string;
    targetRole?: string;
  } | null;
  reviewer?: {
    id: string;
    name: string;
    email: string;
  } | null;
}
