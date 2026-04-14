import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { env } from '../config/env.js';

const openai = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

const cvAnalysisSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).min(3).max(5),
  improvements: z.array(z.string()).min(3).max(5),
  interviewQuestions: z
    .array(
      z.object({
        question: z.string(),
        purpose: z.string()
      })
    )
    .min(4)
    .max(6),
  practicePlan: z.array(z.string()).min(3).max(6)
});

const practiceFeedbackSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).min(3).max(5),
  improvements: z.array(z.string()).min(3).max(6),
  coachNotes: z.array(z.string()).min(3).max(6),
  followUpQuestions: z.array(z.string()).min(2).max(5)
});

const nextQuestionSchema = z.object({
  reply: z.string(),
  question: z.string(),
  reason: z.string(),
  challenge: z.string(),
  suggestedFocus: z.array(z.string()).min(2).max(4)
});

const fillerTerms = ['ừ', 'ờ', 'ừm', 'kiểu như', 'nói chung', 'thực ra', 'actually', 'basically'];
const corruptedPattern = /Ã|Â|Ä|á»|Æ|â€|Ă/;

type UploadFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

type VolumePoint = {
  time: number;
  value: number;
};

type PracticeProviderPhase = 'transcription' | 'analysis' | 'cv' | 'realtime';

type CvAnalysisResult = z.infer<typeof cvAnalysisSchema> & {
  warningMessage?: string;
};

type PracticeAnalysisResult = {
  transcript: string;
  speechRateWpm: number;
  volumeStability: number;
  clarityScore: number;
  pauseScore: number;
  confidenceScore: number;
  totalScore: number;
  fillerWordCount: number;
  repeatCount: number;
  speedTimeline: Array<{ label: string; value: number }>;
  heatmap: Array<{ label: string; score: number; note: string }>;
  summary: string;
  strengths: string[];
  improvements: string[];
  coachNotes: string[];
  followUpQuestions: string[];
  warningMessage?: string;
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(value)));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const isUsableText = (value: unknown) => {
  const text = normalizeText(value);
  return Boolean(text) && !corruptedPattern.test(text);
};

const vietnameseStopWords = new Set([
  'anh',
  'chị',
  'em',
  'tôi',
  'mình',
  'bạn',
  'chúng',
  'ta',
  'là',
  'và',
  'với',
  'của',
  'cho',
  'trong',
  'trên',
  'dưới',
  'đến',
  'tại',
  'khi',
  'sau',
  'trước',
  'rằng',
  'thì',
  'đã',
  'đang',
  'sẽ',
  'vẫn',
  'rất',
  'khá',
  'cũng',
  'được',
  'này',
  'kia',
  'đó',
  'một',
  'những',
  'các',
  'về',
  'theo',
  'hay',
  'hoặc',
  'nên',
  'nếu',
  'để',
  'do',
  'từ',
  'ra',
  'vào',
  'qua',
  'việc',
  'điều',
  'phần',
  'câu',
  'ý',
  'nội',
  'dung',
  'bài',
  'nói',
  'phỏng',
  'vấn',
  'thuyết',
  'trình',
  'giới',
  'thiệu',
  'bản',
  'thân',
  'thực',
  'sự',
  'kiểu',
  'như',
  'nói',
  'chung',
  'actually',
  'basically',
  'about',
  'with',
  'from',
  'that',
  'this',
  'have',
  'has',
  'were',
  'was'
]);

const tokenizeContentWords = (text: string) =>
  normalizeText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 3 &&
        !vietnameseStopWords.has(word) &&
        !/^\d+$/.test(word) &&
        !personalFieldPattern.test(word)
    );

const uniqueWords = (text: string) => Array.from(new Set(tokenizeContentWords(text)));

const extractKeywords = (text: string, limit = 6) => {
  const tokens = tokenizeContentWords(text);
  const scored = new Map<string, { count: number; firstIndex: number }>();

  tokens.forEach((token, index) => {
    const existing = scored.get(token);
    if (existing) {
      existing.count += 1;
      return;
    }

    scored.set(token, { count: 1, firstIndex: index });
  });

  return Array.from(scored.entries())
    .sort((left, right) => right[1].count - left[1].count || left[1].firstIndex - right[1].firstIndex)
    .map(([token]) => token)
    .slice(0, limit);
};

const splitIntoSentences = (text: string) =>
  String(text ?? '')
    .replace(/\r/g, '\n')
    .split(/[\n.!?;]+/g)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.split(/\s+/).length >= 5);

const compactQuote = (value: string, maxLength = 90) => {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}…`;
};

const buildPracticeContentSignals = (
  transcript: string,
  topic: string,
  practiceType: 'presentation' | 'interview',
  targetRole = ''
) => {
  const cleanedTranscript = normalizeText(transcript);
  const sentences = splitIntoSentences(cleanedTranscript);
  const transcriptKeywords = extractKeywords(cleanedTranscript, 8);
  const topicKeywords = extractKeywords(topic, 5);
  const roleKeywords = extractKeywords(targetRole, 4);
  const topicCoverage =
    topicKeywords.length === 0
      ? 1
      : topicKeywords.filter((keyword) => cleanedTranscript.toLowerCase().includes(keyword)).length / topicKeywords.length;
  const roleCoverage =
    roleKeywords.length === 0
      ? 1
      : roleKeywords.filter((keyword) => cleanedTranscript.toLowerCase().includes(keyword)).length / roleKeywords.length;

  const evidenceSentence =
    sentences.find((sentence) => /\d|%|kết quả|doanh số|khách hàng|tăng|giảm|triển khai|phụ trách|đạt|cải thiện/i.test(sentence)) ||
    sentences[1] ||
    sentences[0] ||
    cleanedTranscript;
  const anchorSentence =
    sentences.find((sentence) => topicKeywords.some((keyword) => sentence.toLowerCase().includes(keyword))) ||
    sentences[0] ||
    cleanedTranscript;
  const supportingSentence =
    sentences.find((sentence) => sentence !== anchorSentence && sentence !== evidenceSentence) || sentences[2] || sentences[0] || cleanedTranscript;
  const hasOwnershipCue = /(tôi|em|mình|i)\s+(phụ trách|chịu trách nhiệm|đảm nhiệm|trực tiếp|dẫn dắt|lead|quản lý|managed|owned|handled|implemented|delivered)|\b(led|managed|owned|handled|implemented|delivered|responsible for)\b/i.test(cleanedTranscript);
  const hasOutcomeCue = /\b(\d+(?:[.,]\d+)?\s*(%|phần trăm|triệu|tỷ|khách|người|tháng|năm)|kết quả|doanh số|tăng|giảm|cải thiện|chốt|đạt|result|results|revenue|growth|conversion|improved|reduced|achieved|increase|decrease)\b/i.test(
    cleanedTranscript
  );
  const hasStructureCue =
    practiceType === 'presentation'
      ? /(đầu tiên|thứ nhất|thứ hai|tiếp theo|cuối cùng|tóm lại|kết luận|hôm nay|first|second|next|finally|in summary|to sum up)/i.test(cleanedTranscript)
      : /(bối cảnh|tình huống|nhiệm vụ|hành động|kết quả|bài học|lúc đó|sau đó|situation|task|action|result|lesson)/i.test(cleanedTranscript);
  const hasReflectionCue = /(bài học|rút ra|nhận ra|sẽ cải thiện|kinh nghiệm rút ra|lesson learned|learned that|takeaway|would do differently)/i.test(cleanedTranscript);
  const hasProblemCue = /(khó khăn|thử thách|áp lực|vấn đề|xung đột|mâu thuẫn|trở ngại|challenge|pressure|issue|obstacle|conflict)/i.test(cleanedTranscript);
  const evidenceCueCount =
    cleanedTranscript.match(/\b(\d+(?:[.,]\d+)?\s*(%|phần trăm|triệu|tỷ|khách|người|tháng|năm)|kết quả|doanh số|tăng|giảm|cải thiện|chốt|đạt|result|results|revenue|growth|conversion|improved|reduced|achieved|increase|decrease)\b/gi)?.length ??
    0;
  const genericCueCount =
    cleanedTranscript.match(/\b(khá ổn|nhiều việc|mọi thứ|cố gắng|học thêm|kinh nghiệm|tham gia|hỗ trợ|một số việc|nhiều thứ|good|many things|helped|supported|worked on various things)\b/gi)?.length ??
    0;

  const shortTopicLabel =
    normalizeText(topic) || (practiceType === 'presentation' ? 'bài thuyết trình hiện tại' : 'câu trả lời hiện tại');

  return {
    cleanedTranscript,
    sentences,
    transcriptKeywords,
    topicKeywords,
    roleKeywords,
    topicCoverage,
    roleCoverage,
    anchorSentence,
    evidenceSentence,
    supportingSentence,
    shortTopicLabel,
    hasOwnershipCue,
    hasOutcomeCue,
    hasStructureCue,
    hasReflectionCue,
    hasProblemCue,
    evidenceCueCount,
    genericCueCount
  };
};

const buildPracticeContentSignalsV2 = (
  transcript: string,
  topic: string,
  practiceType: 'presentation' | 'interview',
  targetRole = ''
) => {
  const base = buildPracticeContentSignals(transcript, topic, practiceType, targetRole);
  const cleanedTranscript = normalizeText(transcript);
  const sentences = splitIntoSentences(cleanedTranscript);
  const loweredTranscript = cleanedTranscript.toLowerCase();
  const topicKeywords = extractKeywords(topic, 5);
  const roleKeywords = extractKeywords(targetRole, 4);
  const topicAnchorHits = topicKeywords.filter((keyword) => loweredTranscript.includes(keyword)).length;
  const roleAnchorHits = roleKeywords.filter((keyword) => loweredTranscript.includes(keyword)).length;
  const topicCoverage = topicKeywords.length === 0 ? 1 : topicAnchorHits / topicKeywords.length;
  const roleCoverage = roleKeywords.length === 0 ? 1 : roleAnchorHits / roleKeywords.length;

  const ownershipCueCount =
    cleanedTranscript.match(
      /\b(tôi|em|mình|i)\s+(phụ trách|chịu trách nhiệm|đảm nhiệm|trực tiếp|dẫn dắt|lead|quản lý|managed|owned|handled|implemented|delivered)|\b(led|managed|owned|handled|implemented|delivered|responsible for)\b/giu
    )?.length ?? 0;
  const outcomeCueCount =
    cleanedTranscript.match(
      /\b(\d+(?:[.,]\d+)?\s*(%|phần trăm|triệu|tỷ|k|khách|người|tháng|năm|days?|weeks?|months?|years?)|kết quả|doanh số|doanh thu|tăng|giảm|cải thiện|vượt|rút ngắn|tiết kiệm|chốt|đạt|result|results|revenue|growth|conversion|improved|reduced|achieved|increase|decrease)\b/giu
    )?.length ?? 0;
  const structureCueCount =
    cleanedTranscript.match(
      practiceType === 'presentation'
        ? /\b(đầu tiên|thứ nhất|thứ hai|tiếp theo|cuối cùng|tóm lại|kết luận|hôm nay|mở đầu|sau đó|first|second|next|finally|in summary|to sum up)\b/giu
        : /\b(bối cảnh|tình huống|nhiệm vụ|hành động|kết quả|bài học|lúc đó|sau đó|situation|task|action|result|lesson)\b/giu
    )?.length ?? 0;
  const reflectionCueCount =
    cleanedTranscript.match(/\b(bài học|rút ra|nhận ra|sẽ cải thiện|kinh nghiệm rút ra|lesson learned|learned that|takeaway|would do differently)\b/giu)?.length ??
    0;
  const problemCueCount =
    cleanedTranscript.match(/\b(khó khăn|thử thách|áp lực|vấn đề|xung đột|mâu thuẫn|trở ngại|challenge|pressure|issue|obstacle|conflict)\b/giu)?.length ??
    0;
  const exampleCueCount =
    cleanedTranscript.match(/\b(ví dụ|chẳng hạn|cụ thể|đơn cử|for example|for instance)\b/giu)?.length ?? 0;
  const reasoningCueCount =
    cleanedTranscript.match(/\b(vì|do đó|nhờ đó|nên|từ đó|bởi vậy|because|therefore|so that|as a result)\b/giu)?.length ?? 0;
  const actionCueCount =
    cleanedTranscript.match(
      /\b(phụ trách|triển khai|xây dựng|tối ưu|đàm phán|đề xuất|phối hợp|dẫn dắt|thuyết phục|cải thiện|tăng|giảm|chốt|quản lý|đo lường|phân tích|managed|owned|led|optimized|built|delivered|negotiated|coordinated|analyzed|launched)\b/giu
    )?.length ?? 0;
  const genericCueCount =
    cleanedTranscript.match(
      /\b(khá ổn|nhiều việc|mọi thứ|cố gắng|học thêm|kinh nghiệm|tham gia|hỗ trợ|một số việc|nhiều thứ|good|many things|helped|supported|worked on various things)\b/giu
    )?.length ?? 0;

  const evidenceSentence =
    sentences.find((sentence) => /\d|%|kết quả|doanh số|khách hàng|tăng|giảm|triển khai|phụ trách|đạt|cải thiện/i.test(sentence)) ||
    base.evidenceSentence ||
    sentences[0] ||
    cleanedTranscript;
  const anchorSentence =
    sentences.find((sentence) => topicKeywords.some((keyword) => sentence.toLowerCase().includes(keyword))) ||
    base.anchorSentence ||
    sentences[0] ||
    cleanedTranscript;
  const supportingSentence =
    sentences.find((sentence) => sentence !== anchorSentence && sentence !== evidenceSentence) ||
    base.supportingSentence ||
    sentences[1] ||
    cleanedTranscript;

  const specificityDensity = clamp(
    22 +
      topicCoverage * 18 +
      roleCoverage * (practiceType === 'interview' ? 14 : 8) +
      outcomeCueCount * 6 +
      ownershipCueCount * 5 +
      structureCueCount * 4 +
      reflectionCueCount * 4 +
      problemCueCount * 4 +
      exampleCueCount * 3 +
      reasoningCueCount * 3 +
      actionCueCount * 2 -
      genericCueCount * 7,
    18,
    98
  );

  return {
    ...base,
    cleanedTranscript,
    sentences,
    topicKeywords,
    roleKeywords,
    topicAnchorHits,
    roleAnchorHits,
    topicCoverage,
    roleCoverage,
    anchorSentence,
    evidenceSentence,
    supportingSentence,
    shortTopicLabel: normalizeText(topic) || (practiceType === 'presentation' ? 'bài thuyết trình hiện tại' : 'câu trả lời hiện tại'),
    hasOwnershipCue: ownershipCueCount > 0,
    hasOutcomeCue: outcomeCueCount > 0,
    hasStructureCue: structureCueCount > 0,
    hasReflectionCue: reflectionCueCount > 0,
    hasProblemCue: problemCueCount > 0,
    evidenceCueCount: outcomeCueCount,
    genericCueCount,
    ownershipCueCount,
    outcomeCueCount,
    structureCueCount,
    reflectionCueCount,
    problemCueCount,
    exampleCueCount,
    reasoningCueCount,
    actionCueCount,
    specificityDensity
  };
};

const resumeSectionPatterns = {
  experience: /(kinh nghiệm|experience|work experience|employment)/i,
  education: /(học vấn|education|academic)/i,
  skills: /(kỹ năng|skills|technical skills|core skills)/i,
  projects: /(dự án|project|projects|portfolio)/i,
  achievements: /(thành tích|achievement|awards|awards?)/i
};

const personalFieldPattern =
  /^(họ và tên|họ tên|full name|tên|name|ngày sinh|date of birth|dob|giới tính|gender|số điện thoại|phone|mobile|email|địa chỉ|address|linkedin|github|facebook|website|quốc tịch|nationality)\b/i;

const roleKeywordPattern =
  /\b(intern|executive|developer|engineer|analyst|manager|specialist|designer|marketer|marketing|sales|business|product|account|consultant|coordinator|assistant|lead|head|officer|tester|qa|support|recruiter|content|seo|hr|operations?)\b/i;

const normalizeResumeLines = (resumeText: string) =>
  resumeText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

type ResumeSectionKey = 'experience' | 'education' | 'skills' | 'projects' | 'achievements' | 'other';

const detectResumeSection = (line: string): ResumeSectionKey | null => {
  const normalized = normalizeText(line);
  if (!normalized || normalized.length > 48) {
    return null;
  }

  if (resumeSectionPatterns.experience.test(normalized)) return 'experience';
  if (resumeSectionPatterns.education.test(normalized)) return 'education';
  if (resumeSectionPatterns.skills.test(normalized)) return 'skills';
  if (resumeSectionPatterns.projects.test(normalized)) return 'projects';
  if (resumeSectionPatterns.achievements.test(normalized)) return 'achievements';

  return null;
};

const extractResumeSectionBuckets = (lines: string[]) => {
  const buckets: Record<ResumeSectionKey, string[]> = {
    experience: [],
    education: [],
    skills: [],
    projects: [],
    achievements: [],
    other: []
  };

  let currentSection: ResumeSectionKey = 'other';

  for (const line of lines) {
    const nextSection = detectResumeSection(line);
    if (nextSection) {
      currentSection = nextSection;
      continue;
    }

    if (isPersonalInfoLine(line)) {
      continue;
    }

    buckets[currentSection].push(line);
  }

  return buckets;
};

const isPersonalInfoLine = (line: string) => {
  const normalized = normalizeText(line);
  if (!normalized) {
    return true;
  }

  if (personalFieldPattern.test(normalized)) {
    return true;
  }

  if (/^\+?\d[\d\s.-]{6,}$/.test(normalized)) {
    return true;
  }

  if (normalized.includes('@') || /(linkedin|github|facebook|http|www\.)/i.test(normalized)) {
    return true;
  }

  return false;
};

const inferTargetRoleFromResume = (resumeText: string, targetRole: string) => {
  const explicitRole = normalizeText(targetRole);
  if (explicitRole) {
    return explicitRole;
  }

  const lines = normalizeResumeLines(resumeText);
  const roleLine = lines.find((line) => {
    if (isPersonalInfoLine(line)) {
      return false;
    }

    if (line.length < 5 || line.length > 80) {
      return false;
    }

    return roleKeywordPattern.test(line);
  });

  return roleLine || 'vị trí ứng tuyển hiện tại';
};

const extractResumeSignals = (resumeText: string) => {
  const lines = normalizeResumeLines(resumeText);
  const contentLines = lines.filter((line) => !isPersonalInfoLine(line));
  const contentText = contentLines.join('\n');
  const sectionBuckets = extractResumeSectionBuckets(lines);
  const keywords = extractKeywords(contentText, 8).filter((word) => !/^(tên|name|nam|nữ|male|female)$/i.test(word));

  const sections = {
    experience: resumeSectionPatterns.experience.test(contentText),
    education: resumeSectionPatterns.education.test(contentText),
    skills: resumeSectionPatterns.skills.test(contentText),
    projects: resumeSectionPatterns.projects.test(contentText),
    achievements: resumeSectionPatterns.achievements.test(contentText)
  };

  const quantifiedBulletCount =
    (contentText.match(/\b\d+(?:[.,]\d+)?\s*(%|triệu|tỷ|k|khách|khách hàng|users?|người|tháng|năm|months?|years?)\b/gi)?.length ?? 0) +
    (contentText.match(/\b(tăng|giảm|cải thiện|đạt|vượt|mở rộng|tối ưu)\b/gi)?.length ?? 0);

  const projectLine =
    contentLines.find((line) => /(dự án|project|campaign|portfolio|case study|achievement|thành tích)/i.test(line)) || '';
  const roleLine =
    contentLines.find((line) => roleKeywordPattern.test(line) && line.length <= 90) ||
    contentLines.find((line) => /(business|sales|marketing|product|data|account|developer|engineer|analyst)/i.test(line)) ||
    '';
  const evidenceLines = contentLines
    .filter(
      (line) =>
        line.length >= 18 &&
        (/\d/.test(line) ||
          /\b(tăng|giảm|cải thiện|đạt|vượt|mở rộng|triển khai|phụ trách|doanh số|conversion|revenue|khách hàng|growth|improved|reduced|achieved|result|results)\b/i.test(line))
    )
    .slice(0, 3);
  const skillLines = contentLines
    .filter((line) => /(crm|excel|sql|power bi|google ads|facebook ads|seo|salesforce|marketing|b2b|b2c|negotiation|communication)/i.test(line))
    .slice(0, 3);
  const strongestEvidence = evidenceLines[0] || projectLine || roleLine || contentLines[0] || '';
  const ownershipLines = contentLines
    .filter((line) => /\b(phụ trách|chịu trách nhiệm|trực tiếp|dẫn dắt|quản lý|triển khai|xây dựng|tối ưu|managed|owned|led|handled|responsible|implemented)\b/i.test(line))
    .slice(0, 3);
  const experienceHighlights = [...sectionBuckets.experience, ...sectionBuckets.projects]
    .filter((line) => line.length >= 18 && !isPersonalInfoLine(line))
    .slice(0, 5);
  const strongestAchievement =
    evidenceLines[0] ||
    ownershipLines[0] ||
    experienceHighlights[0] ||
    roleLine ||
    contentLines[0] ||
    '';
  const missingSections = [
    sections.experience ? '' : 'kinh nghiệm',
    sections.projects ? '' : 'dự án',
    sections.skills ? '' : 'kỹ năng',
    quantifiedBulletCount > 0 ? '' : 'kết quả đo được'
  ].filter(Boolean);

  return {
    keywords,
    sections,
    quantifiedBulletCount,
    projectLine: projectLine || 'một dự án gần đây',
    roleLine,
    evidenceLines,
    skillLines,
    strongestEvidence,
    ownershipLines,
    experienceHighlights,
    strongestAchievement,
    sectionBuckets,
    missingSections
  };
};

const countOccurrences = (text: string, term: string) => {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = text.toLowerCase().match(new RegExp(escapedTerm, 'gu'));
  return matches?.length ?? 0;
};

const estimateRepeatCount = (words: string[]) => {
  let repeats = 0;
  for (let index = 1; index < words.length; index += 1) {
    if (words[index] === words[index - 1]) {
      repeats += 1;
    }
  }
  return repeats;
};

const splitWordsIntoChunks = (words: string[], chunks: number) => {
  const bucketSize = Math.max(1, Math.ceil(words.length / chunks));
  return Array.from({ length: chunks }, (_, index) => words.slice(index * bucketSize, (index + 1) * bucketSize));
};

const buildVolumeSegments = (volumeSamples: VolumePoint[], chunks: number) => {
  if (!volumeSamples.length) {
    return Array.from({ length: chunks }, (_, index) => ({
      label: `Đoạn ${index + 1}`,
      average: 0.45,
      silenceSeconds: 0,
      activityRatio: 0.55
    }));
  }

  const segmentLength = Math.max(1, Math.ceil(volumeSamples.length / chunks));

  return Array.from({ length: chunks }, (_, index) => {
    const slice = volumeSamples.slice(index * segmentLength, (index + 1) * segmentLength);
    const average = slice.reduce((sum, point) => sum + point.value, 0) / Math.max(1, slice.length);

    let silenceSeconds = 0;
    for (let cursor = 1; cursor < slice.length; cursor += 1) {
      if (slice[cursor].value < 0.08 && slice[cursor - 1].value < 0.08) {
        silenceSeconds += Math.max(0, slice[cursor].time - slice[cursor - 1].time);
      }
    }

    return {
      label: `Đoạn ${index + 1}`,
      average,
      silenceSeconds,
      activityRatio: slice.filter((point) => point.value >= 0.08).length / Math.max(1, slice.length)
    };
  });
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? '');
};

const getErrorCode = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const candidate = error as {
    code?: unknown;
    cause?: { code?: unknown };
  };

  const code = candidate.code ?? candidate.cause?.code;
  return typeof code === 'string' ? code : '';
};

const isRetryableProviderError = (error: unknown) => {
  const code = getErrorCode(error).toUpperCase();
  const message = getErrorMessage(error).toLowerCase();

  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNABORTED'].includes(code)) {
    return true;
  }

  return ['api connection error', 'connection error', 'fetch failed', 'socket hang up', 'network', 'timeout', 'econnreset'].some(
    (keyword) => message.includes(keyword)
  );
};

const normalizeProviderError = (error: unknown, phase: PracticeProviderPhase) => {
  const message = getErrorMessage(error).toLowerCase();

  if (message.includes('insufficient_quota') || message.includes('you exceeded your current quota')) {
    if (phase === 'realtime') {
      return 'Tài khoản OpenAI API hiện đã hết quota hoặc chưa bật thanh toán, nên chưa thể mở phòng thoại realtime.';
    }

    return 'Tài khoản OpenAI API hiện đã hết quota hoặc chưa bật thanh toán, nên SpeakAI đang chuyển sang bản phân tích dự phòng.';
  }

  if (message.includes('invalid_api_key') || message.includes('incorrect api key provided')) {
    return 'OPENAI_API_KEY hiện không hợp lệ hoặc đã bị thu hồi. Hãy cập nhật API key mới rồi thử lại.';
  }

  if (message.includes('rate limit')) {
    if (phase === 'realtime') {
      return 'OpenAI API đang chạm giới hạn tốc độ, nên phòng thoại chưa thể mở ngay lúc này.';
    }

    return 'OpenAI API đang chạm giới hạn tốc độ. SpeakAI đã chuyển sang bản phân tích dự phòng và bạn có thể thử lại sau ít phút.';
  }

  if (isRetryableProviderError(error)) {
    if (phase === 'transcription') {
      return 'Kết nối đến OpenAI bị gián đoạn khi chép lời từ file ghi âm. SpeakAI đã chuyển sang phân tích cơ bản từ nhịp nói và âm lượng.';
    }

    if (phase === 'cv') {
      return 'Kết nối AI đang không ổn định nên SpeakAI đã chuyển sang bản phân tích CV dự phòng bám theo nội dung hồ sơ.';
    }

    if (phase === 'realtime') {
      return 'Kết nối tới OpenAI đang không ổn định nên phòng thoại realtime chưa thể mở.';
    }

    return 'Kết nối AI đang không ổn định nên SpeakAI đã chuyển sang bản nhận xét dự phòng.';
  }

  if (phase === 'transcription') {
    return 'SpeakAI chưa thể chép transcript từ file ghi âm ở lần thử này. Bạn có thể dán transcript thủ công để tiếp tục phân tích.';
  }

  if (phase === 'cv') {
    return 'SpeakAI chưa thể lấy phân tích CV nâng cao ở lần thử này nên đã chuyển sang bản gợi ý dự phòng.';
  }

  if (phase === 'realtime') {
    return 'SpeakAI chưa thể tạo phiên thoại realtime ở lần thử này.';
  }

  return 'SpeakAI chưa thể lấy nhận xét nâng cao ở lần thử này nên đã chuyển sang bản đánh giá dự phòng.';
};

const mergeUniqueTexts = (primary: string[], fallback: string[], max: number) => {
  const merged = [...primary, ...fallback]
    .map((item) => normalizeText(item))
    .filter((item) => isUsableText(item));

  return Array.from(new Set(merged)).slice(0, max);
};

const mergeQuestionObjects = (
  primary: Array<{ question: string; purpose: string }>,
  fallback: Array<{ question: string; purpose: string }>,
  max: number
) => {
  const result: Array<{ question: string; purpose: string }> = [];
  const seen = new Set<string>();

  for (const item of [...primary, ...fallback]) {
    const question = normalizeText(item?.question);
    const purpose = normalizeText(item?.purpose);

    if (!isUsableText(question) || !isUsableText(purpose)) {
      continue;
    }

    const fingerprint = question.toLowerCase();
    if (seen.has(fingerprint)) {
      continue;
    }

    seen.add(fingerprint);
    result.push({ question, purpose });

    if (result.length >= max) {
      break;
    }
  }

  return result;
};

const buildResumeSignalsV2 = (resumeText: string, targetRole: string) => {
  const lines = resumeText
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const personalInfoPattern =
    /^(họ và tên|họ tên|full name|name|ngày sinh|date of birth|dob|giới tính|gender|số điện thoại|phone|mobile|email|địa chỉ|address|linkedin|github|facebook|website|quốc tịch|nationality)\b/i;
  const rolePattern =
    /\b(intern|executive|developer|engineer|analyst|manager|specialist|designer|marketer|marketing|sales|business|product|account|consultant|coordinator|assistant|lead|head|officer|tester|qa|support|recruiter|content|seo|hr|operations?)\b/i;
  const sectionPatterns = {
    experience: /(kinh nghiệm|experience|work experience|employment)/i,
    education: /(học vấn|education|academic)/i,
    skills: /(kỹ năng|skills|technical skills|core skills)/i,
    projects: /(dự án|project|projects|portfolio|case study)/i,
    achievements: /(thành tích|achievement|awards?)/i
  };

  const isPersonalLine = (line: string) => {
    if (!line) return true;
    if (personalInfoPattern.test(line)) return true;
    if (/^\+?\d[\d\s().-]{6,}$/.test(line)) return true;
    if (line.includes('@') || /(linkedin|github|facebook|http|www\.)/i.test(line)) return true;
    return false;
  };

  let currentSection: keyof typeof sectionPatterns | 'other' = 'other';
  const sectionBuckets: Record<keyof typeof sectionPatterns | 'other', string[]> = {
    experience: [],
    education: [],
    skills: [],
    projects: [],
    achievements: [],
    other: []
  };

  for (const line of lines) {
    const nextSection = (Object.keys(sectionPatterns) as Array<keyof typeof sectionPatterns>).find((key) =>
      sectionPatterns[key].test(line)
    );
    if (nextSection && line.length <= 50) {
      currentSection = nextSection;
      continue;
    }

    if (isPersonalLine(line)) {
      continue;
    }

    sectionBuckets[currentSection].push(line);
  }

  const contentLines = lines.filter((line) => !isPersonalLine(line));
  const contentText = contentLines.join('\n');
  const inferredRole =
    normalizeText(targetRole) ||
    contentLines.find((line) => rolePattern.test(line) && line.length <= 90) ||
    'vị trí ứng tuyển hiện tại';
  const measurableLines = contentLines.filter((line) =>
    /\d|%|khách|người|doanh thu|doanh số|tăng|giảm|cải thiện|đạt|vượt|rút ngắn|result|results|growth|revenue|conversion|improved|reduced|achieved/i.test(
      line
    )
  );
  const ownershipLines = contentLines.filter((line) =>
    /\b(phụ trách|chịu trách nhiệm|trực tiếp|dẫn dắt|quản lý|triển khai|xây dựng|tối ưu|managed|owned|led|implemented|delivered|responsible)\b/i.test(
      line
    )
  );
  const projectLines = [...sectionBuckets.projects, ...sectionBuckets.experience].filter((line) => line.length >= 18);
  const skillAnchor =
    extractKeywords(sectionBuckets.skills.join(' ') || contentText, 6)
      .filter((word) => !/^(tên|name|nam|nữ|male|female)$/i.test(word))
      .join(', ') || 'kỹ năng nền tảng hiện có';
  const missingSections = [
    sectionBuckets.experience.length ? '' : 'kinh nghiệm',
    sectionBuckets.projects.length ? '' : 'dự án',
    sectionBuckets.skills.length ? '' : 'kỹ năng',
    measurableLines.length ? '' : 'kết quả đo được'
  ].filter(Boolean);

  return {
    inferredRole,
    contentText,
    contentLines,
    sectionBuckets,
    measurableLines,
    ownershipLines,
    projectLines,
    skillAnchor,
    missingSections,
    strongestEvidence: measurableLines[0] || ownershipLines[0] || projectLines[0] || inferredRole,
    strongestStory: projectLines[0] || ownershipLines[0] || measurableLines[0] || inferredRole,
    strongestOwnership: ownershipLines[0] || projectLines[0] || inferredRole
  };
};

const buildFallbackCvAnalysisV2 = (resumeText: string, targetRole: string): CvAnalysisResult => {
  const signals = buildResumeSignalsV2(resumeText, targetRole);
  const mainRole = signals.inferredRole;
  const storyAnchor = compactQuote(signals.strongestStory, 100);
  const evidenceAnchor = compactQuote(signals.strongestEvidence, 110);
  const ownershipAnchor = compactQuote(signals.strongestOwnership, 110);
  const hasMeasuredImpact = signals.measurableLines.length > 0;
  const hasOwnershipStory = signals.ownershipLines.length > 0;
  const hasProjects = signals.projectLines.length > 0;

  const strengths = [
    `CV đã thể hiện định hướng tương đối rõ cho vai trò ${mainRole}.`,
    hasOwnershipStory
      ? `Hồ sơ đã có dấu hiệu nêu rõ phần việc bạn trực tiếp đảm nhiệm, nổi bật ở đoạn "${ownershipAnchor}".`
      : 'Nội dung hiện tại đủ để SpeakAI xây dựng bộ câu hỏi luyện tập nền tảng theo vai trò mục tiêu.',
    hasMeasuredImpact
      ? `CV đã có ít nhất một tín hiệu về kết quả hoặc tác động đo được quanh "${evidenceAnchor}".`
      : `CV đã có chất liệu kinh nghiệm để phát triển tiếp thành câu chuyện ứng tuyển cho ${mainRole}.`,
    hasProjects
      ? `Bạn đã có phần trải nghiệm có thể dùng để kể chuyện khi phỏng vấn, đặc biệt quanh "${storyAnchor}".`
      : `Bộ kỹ năng hiện có đang gợi mở đúng nhóm năng lực cho ${mainRole}, ví dụ như ${signals.skillAnchor}.`
  ].slice(0, 4);

  const improvements = [
    hasMeasuredImpact
      ? 'Nên gom các kết quả đo được vào đúng từng trải nghiệm chính để nhà tuyển dụng nhìn thấy tác động nhanh hơn.'
      : 'Cần bổ sung kết quả đo được cho từng trải nghiệm, ví dụ tỷ lệ tăng trưởng, doanh thu, số khách hàng hoặc hiệu suất cải thiện.',
    hasOwnershipStory
      ? 'Hãy viết rõ hơn bối cảnh, hành động và kết quả cho từng dòng thành tựu mạnh nhất thay vì mô tả ngắn gọn.'
      : 'CV chưa làm rõ đủ phần việc bạn trực tiếp chịu trách nhiệm, nên nhà tuyển dụng dễ cảm nhận nội dung còn chung chung.',
    hasProjects
      ? `Nên chọn 1-2 trải nghiệm mạnh nhất như "${storyAnchor}" để đẩy sâu hơn theo hướng vai trò - hành động - kết quả.`
      : 'Nên bổ sung thêm 1-2 dự án hoặc trải nghiệm thực tế để tạo điểm tựa cho phần hỏi sâu khi phỏng vấn.',
    signals.missingSections.length
      ? `Các phần còn đang thiếu hoặc mỏng: ${signals.missingSections.join(', ')}.`
      : `Hãy chỉnh lại các bullet bám chặt hơn vào vai trò ${mainRole}, tránh liệt kê dàn trải.`
  ].slice(0, 4);

  return {
    summary:
      hasMeasuredImpact && hasOwnershipStory
        ? `CV đang bám khá đúng vai trò ${mainRole} và đã có nền nội dung đủ tốt để đi sâu hơn. Điểm mạnh nằm ở việc bạn đã thể hiện cả phần việc trực tiếp lẫn tín hiệu kết quả đo được quanh "${evidenceAnchor}". Để nổi bật hơn trong vòng sàng lọc, hãy làm đậm từng bullet theo hướng vai trò - hành động - tác động.`
        : `CV hiện đã cho thấy định hướng ứng tuyển vào ${mainRole}, nhưng mức độ thuyết phục vẫn chưa đồng đều. Bạn cần làm rõ hơn phần việc trực tiếp đảm nhiệm, kết quả đo được và trải nghiệm mạnh nhất như "${storyAnchor}" để hồ sơ bám sát thực tế hơn.`,
    strengths,
    improvements,
    interviewQuestions: [
      {
        question: `Hãy giới thiệu ngắn gọn về bản thân trong vai trò ${mainRole}, nhấn vào giá trị bạn mang lại rõ nhất.`,
        purpose: 'Kiểm tra cách bạn định vị bản thân và mở đầu cuộc phỏng vấn.'
      },
      {
        question: `Ở trải nghiệm "${storyAnchor}", bạn trực tiếp làm phần nào và kết quả cuối cùng được đo như thế nào?`,
        purpose: 'Đào sâu trách nhiệm cá nhân và mức độ tác động thực tế của bạn.'
      },
      {
        question: 'Một khó khăn thực tế bạn từng gặp là gì và bạn đã xử lý nó ra sao?',
        purpose: 'Kiểm tra khả năng giải quyết vấn đề và kể lại trải nghiệm thật có chiều sâu.'
      },
      {
        question: `Nếu vào vai trò ${mainRole} ngay lúc này, bạn sẽ dùng trải nghiệm nào để chứng minh năng lực đầu tiên?`,
        purpose: 'Xem bạn có biết chọn đúng bằng chứng mạnh nhất cho vai trò mục tiêu hay không.'
      },
      {
        question: `Trong 90 ngày đầu ở vai trò ${mainRole}, bạn sẽ ưu tiên điều gì và đo kết quả bằng chỉ số nào?`,
        purpose: 'Đánh giá tư duy vào việc, mức chủ động và cách bạn gắn mục tiêu với kết quả.'
      }
    ],
    practicePlan: [
      `Luyện phần giới thiệu bản thân cho vai trò ${mainRole} trong 60-90 giây và chốt bằng một giá trị nổi bật nhất bạn mang lại.`,
      `Chọn trải nghiệm gần với "${storyAnchor}" rồi luyện trả lời theo cấu trúc bối cảnh - nhiệm vụ - hành động - kết quả.`,
      hasMeasuredImpact
        ? 'Chuẩn bị sẵn 3 số liệu hoặc kết quả mạnh nhất để dùng khi bị hỏi sâu về tác động cá nhân.'
        : 'Viết lại 3 bullet kinh nghiệm chính theo hướng có con số, kết quả hoặc tác động đo được trước khi luyện phỏng vấn.',
      `Tập một lượt phản biện cho câu hỏi “Vì sao nên chọn bạn cho vai trò ${mainRole}?” dựa trên ${signals.skillAnchor}.`
    ]
  };
};

const buildCvPromptContextV2 = (resumeText: string, targetRole: string) => {
  const signals = buildResumeSignalsV2(resumeText, targetRole);

  return [
    `Vai trò đang phân tích: ${signals.inferredRole}`,
    `Kỹ năng nổi bật: ${signals.skillAnchor}`,
    `Trải nghiệm nổi bật: ${signals.projectLines.map((line) => compactQuote(line, 110)).join(' | ') || 'Chưa thấy rõ'}`,
    `Dòng thể hiện trách nhiệm cá nhân: ${signals.ownershipLines.map((line) => compactQuote(line, 110)).join(' | ') || 'Chưa thấy rõ'}`,
    `Dòng có kết quả đo được: ${signals.measurableLines.map((line) => compactQuote(line, 110)).join(' | ') || 'Chưa thấy rõ'}`,
    `Các phần đang thiếu hoặc mỏng: ${signals.missingSections.join(', ') || 'không có phần thiếu rõ rệt'}`,
    'Yêu cầu bắt buộc:',
    '- Không dùng họ tên, ngày sinh, giới tính, số điện thoại, email hoặc địa chỉ làm keyword phân tích.',
    '- Summary phải bám vào kinh nghiệm, trách nhiệm, dự án và kết quả thật có trong CV.',
    '- Strengths và improvements phải nêu cụ thể phần nào trong CV đang mạnh hoặc đang yếu.',
    '- Interview questions phải truy sâu vào đúng trải nghiệm, hành động và tác động đã xuất hiện trong CV.',
    '- Practice plan phải bám vào vai trò mục tiêu và phần còn thiếu thực sự của CV này.'
  ].join('\n');
};

const buildFallbackCvAnalysis = (resumeText: string, targetRole: string): CvAnalysisResult => {
  const mainRole = inferTargetRoleFromResume(resumeText, targetRole);
  const signals = extractResumeSignals(resumeText);
  const skillAnchor = signals.keywords.slice(0, 4).join(', ') || 'kỹ năng nền tảng hiện có';
  const roleAnchor = compactQuote(signals.roleLine || mainRole, 90);
  const projectAnchor = compactQuote(signals.projectLine || signals.experienceHighlights[0] || mainRole, 100);
  const evidenceAnchor = compactQuote(signals.strongestEvidence || signals.projectLine || mainRole, 110);
  const ownershipAnchor = compactQuote(signals.ownershipLines[0] || signals.experienceHighlights[0] || roleAnchor, 110);
  const achievementAnchor = compactQuote(signals.strongestAchievement || signals.strongestEvidence || roleAnchor, 110);
  const missingAnchor = signals.missingSections.length ? signals.missingSections.join(', ') : '';
  const hasMeasuredImpact = signals.quantifiedBulletCount >= 2 || /\d/.test(signals.strongestAchievement || '');
  const hasOwnershipStory = signals.ownershipLines.length > 0;
  const hasExperienceStory = signals.experienceHighlights.length > 0;
  const sectionCoverage = Object.values(signals.sections).filter(Boolean).length;

  const strengths: string[] = [`CV đang định hình khá rõ hướng ứng tuyển cho vai trò ${mainRole}.`];

  if (hasOwnershipStory) {
    strengths.push(`CV đã có dấu hiệu nêu rõ phần việc bạn trực tiếp đảm nhiệm, nổi bật quanh "${ownershipAnchor}".`);
  }

  if (hasMeasuredImpact) {
    strengths.push(`Hồ sơ đã xuất hiện tín hiệu về kết quả hoặc tác động đo được, đặc biệt ở đoạn "${achievementAnchor}".`);
  }

  if (hasExperienceStory) {
    strengths.push(`CV có chất liệu kinh nghiệm để khai thác khi phỏng vấn, nhất là ở phần "${projectAnchor}".`);
  }

  if (signals.sections.skills) {
    strengths.push(`Bộ kỹ năng đang có liên hệ tương đối tốt với vai trò mục tiêu, ví dụ như ${skillAnchor}.`);
  }

  const improvements: string[] = [];

  if (missingAnchor) {
    improvements.push(`CV hiện còn thiếu hoặc còn mỏng ở các phần: ${missingAnchor}. Đây là nhóm nội dung nên bổ sung trước.`);
  }

  if (!hasMeasuredImpact) {
    improvements.push('Hồ sơ còn thiếu kết quả định lượng rõ ràng như doanh số, tăng trưởng, hiệu suất hoặc quy mô công việc.');
  } else {
    improvements.push('Nên gom các kết quả đo được vào đúng từng kinh nghiệm chính thay vì để rải rác, để nhà tuyển dụng thấy tác động nhanh hơn.');
  }

  if (!hasOwnershipStory) {
    improvements.push('CV chưa chỉ ra đủ rõ phần việc bạn trực tiếp chịu trách nhiệm, nên dễ bị cảm giác mô tả chung chung.');
  } else {
    improvements.push('Hãy viết sắc hơn theo cấu trúc bối cảnh - hành động - kết quả cho từng dòng thành tựu mạnh nhất.');
  }

  if (!signals.sections.projects && signals.sectionBuckets.experience.length < 2) {
    improvements.push('Nên bổ sung 1-2 dự án hoặc tình huống làm việc thực tế để tạo điểm tựa cho phần hỏi sâu khi phỏng vấn.');
  }

  if (sectionCoverage <= 2) {
    improvements.push('Bố cục CV hiện vẫn hơi mỏng, nên tách section rõ hơn để người đọc quét nhanh được kinh nghiệm, kỹ năng và thành tựu.');
  }

  return {
    summary:
      hasOwnershipStory && hasMeasuredImpact
        ? `CV đang bám khá đúng vai trò ${mainRole} và đã có nền nội dung đủ tốt để đi sâu hơn. Điểm mạnh nằm ở việc bạn đã cho thấy cả trách nhiệm cá nhân lẫn kết quả cụ thể quanh "${achievementAnchor}". Để hồ sơ thuyết phục hơn ở vòng sàng lọc, hãy làm đậm hơn từng bullet theo hướng vai trò - hành động - tác động.`
        : hasOwnershipStory
          ? `CV đã cho thấy bạn có trải nghiệm thực tế phù hợp với ${mainRole}, đặc biệt quanh "${ownershipAnchor}". Tuy nhiên, hồ sơ vẫn chưa đủ sắc ở phần kết quả đo được, nên cảm giác giá trị mang lại còn chưa thật nổi bật.`
          : `CV đang cho thấy định hướng ứng tuyển vào ${mainRole}, nhưng nội dung hiện vẫn thiên về liệt kê hơn là chứng minh năng lực. Hồ sơ sẽ mạnh hơn nhiều nếu bạn bổ sung rõ trách nhiệm cá nhân, dự án gần "${projectAnchor}" và kết quả cụ thể quanh "${evidenceAnchor}".`,
    strengths,
    improvements,
    interviewQuestions: [
      {
        question: `Hãy giới thiệu ngắn gọn về bản thân trong vai trò ${mainRole}, nhấn vào điều khiến bạn phù hợp nhất.`,
        purpose: 'Kiểm tra cách bạn định vị bản thân và mở đầu cuộc phỏng vấn.'
      },
      {
        question: `Ở nội dung "${achievementAnchor}", bạn trực tiếp làm gì và kết quả cuối cùng được đo như thế nào?`,
        purpose: 'Đào sâu trách nhiệm cá nhân và mức tác động thực tế của bạn.'
      },
      {
        question: `Trong phần "${projectAnchor}", khó khăn lớn nhất là gì và bạn đã xử lý nó ra sao?`,
        purpose: 'Kiểm tra năng lực giải quyết vấn đề và khả năng kể lại trải nghiệm theo ngữ cảnh thật.'
      },
      {
        question: `Nếu ứng tuyển vào ${mainRole} ngay lúc này, bạn muốn dùng dự án hoặc kinh nghiệm nào để chứng minh năng lực đầu tiên?`,
        purpose: 'Xem bạn có biết chọn đúng bằng chứng mạnh nhất cho đúng vai trò mục tiêu hay không.'
      },
      {
        question: `Trong 90 ngày đầu ở vai trò ${mainRole}, bạn sẽ ưu tiên học gì, làm gì và đo kết quả bằng chỉ số nào?`,
        purpose: 'Đánh giá tư duy vào việc, mức chủ động và cách bạn gắn mục tiêu với kết quả.'
      }
    ],
    practicePlan: [
      `Luyện phần giới thiệu bản thân cho vai trò ${mainRole} trong 60-90 giây và chốt bằng một giá trị nổi bật nhất bạn mang lại.`,
      `Chọn trải nghiệm gần với "${achievementAnchor}" rồi luyện trả lời theo cấu trúc bối cảnh - nhiệm vụ - hành động - kết quả.`,
      hasMeasuredImpact
        ? 'Chuẩn bị sẵn 3 số liệu hoặc kết quả mạnh nhất để dùng khi bị hỏi sâu về tác động cá nhân.'
        : 'Viết lại 3 bullet kinh nghiệm chính theo hướng có con số, kết quả hoặc tác động đo được trước khi luyện phỏng vấn.',
      `Tập một lượt phản biện cho câu hỏi “Vì sao nên chọn bạn cho vai trò ${mainRole}?” dựa trên ${skillAnchor}.`
    ]
  };
};

const normalizeCvAnalysisOutput = (raw: unknown, fallback: CvAnalysisResult): CvAnalysisResult => {
  const parsed = (raw ?? {}) as Partial<z.infer<typeof cvAnalysisSchema>>;

  return {
    summary: isUsableText(parsed.summary) ? normalizeText(parsed.summary) : fallback.summary,
    strengths: mergeUniqueTexts(
      Array.isArray(parsed.strengths) ? parsed.strengths.map((item) => normalizeText(item)) : [],
      fallback.strengths,
      5
    ),
    improvements: mergeUniqueTexts(
      Array.isArray(parsed.improvements) ? parsed.improvements.map((item) => normalizeText(item)) : [],
      fallback.improvements,
      5
    ),
    interviewQuestions: mergeQuestionObjects(
      Array.isArray(parsed.interviewQuestions)
        ? parsed.interviewQuestions.map((item) => ({
            question: normalizeText(item?.question),
            purpose: normalizeText(item?.purpose)
          }))
        : [],
      fallback.interviewQuestions,
      6
    ),
    practicePlan: mergeUniqueTexts(
      Array.isArray(parsed.practicePlan) ? parsed.practicePlan.map((item) => normalizeText(item)) : [],
      fallback.practicePlan,
      6
    )
  };
};

const buildCvPromptContext = (resumeText: string, targetRole: string) => {
  const mainRole = inferTargetRoleFromResume(resumeText, targetRole);
  const signals = extractResumeSignals(resumeText);

  return [
    `Vai trò đang phân tích: ${mainRole}`,
    `Từ khóa nội dung: ${signals.keywords.join(', ') || 'Chưa rõ'}`,
    `Dòng vai trò nổi bật: ${signals.roleLine || 'Chưa thấy rõ'}`,
    `Dòng có số liệu/kết quả: ${signals.evidenceLines.map((line) => compactQuote(line, 120)).join(' | ') || 'Chưa thấy rõ'}`,
    `Dòng dự án nổi bật: ${signals.projectLine || 'Chưa thấy rõ'}`,
    `Dòng thể hiện trách nhiệm cá nhân: ${signals.ownershipLines.map((line) => compactQuote(line, 120)).join(' | ') || 'Chưa thấy rõ'}`,
    `Dòng thành tích mạnh nhất: ${signals.strongestAchievement || 'Chưa thấy rõ'}`,
    `Các trải nghiệm nổi bật: ${signals.experienceHighlights.map((line) => compactQuote(line, 120)).join(' | ') || 'Chưa thấy rõ'}`,
    `Các nhóm nội dung đang có: ${
      [
        signals.sections.experience ? 'kinh nghiệm' : '',
        signals.sections.projects ? 'dự án' : '',
        signals.sections.skills ? 'kỹ năng' : '',
        signals.sections.education ? 'học vấn' : '',
        signals.sections.achievements ? 'thành tích' : ''
      ]
        .filter(Boolean)
        .join(', ') || 'không rõ'
    }`,
    `Các phần còn thiếu hoặc mỏng: ${signals.missingSections.join(', ') || 'không có phần thiếu rõ rệt'}`,
    'Yêu cầu bắt buộc:',
    '- Không dùng họ tên, ngày sinh, giới tính, số điện thoại hoặc email làm keyword phân tích.',
    '- Summary phải nêu đúng hồ sơ đang mạnh ở đâu, yếu ở đâu, bám vào kinh nghiệm, trách nhiệm và kết quả thật có trong CV.',
    '- Strengths và improvements phải chỉ ra nội dung cụ thể trong CV, không viết chung chung.',
    '- Interview questions phải truy vào dự án, vai trò, hành động và kết quả thật sự có dấu hiệu xuất hiện trong CV.',
    '- Practice plan phải bám vào vai trò mục tiêu và điểm còn thiếu của CV này.'
  ].join('\n');
};

export const extractResumeText = async (file: UploadFile) => {
  if (file.mimetype.includes('pdf') || file.originalname.toLowerCase().endsWith('.pdf')) {
    const parsed = await pdfParse(file.buffer);
    return normalizeText(parsed.text);
  }

  return file.buffer.toString('utf-8').trim();
};

export const analyzeCv = async (input: { resumeText: string; targetRole: string }) => {
  const fallback = buildFallbackCvAnalysisV2(input.resumeText, input.targetRole);

  if (!openai) {
    return {
      ...fallback,
      warningMessage: 'SpeakAI chưa được cấu hình kết nối OpenAI nên đang dùng bản phân tích CV dự phòng.'
    };
  }

  try {
    const response = await openai.responses.parse({
      model: env.openaiTextModel,
      input: [
        {
          role: 'system',
          content:
            'Bạn là chuyên gia tối ưu CV và luyện phỏng vấn. Hãy phân tích thật sát nội dung CV, không bịa kinh nghiệm, luôn trả lời bằng tiếng Việt có dấu tự nhiên, chuyên nghiệp, cụ thể và dễ áp dụng. Nếu CV thiếu dữ liệu, phải chỉ rõ phần còn thiếu.'
        },
        {
          role: 'user',
          content: `Vị trí mục tiêu: ${normalizeText(input.targetRole) || 'Chưa cung cấp'}\n\nNội dung CV:\n${input.resumeText.slice(0, 12000)}`
        },
        {
          role: 'user',
          content: buildCvPromptContextV2(input.resumeText, input.targetRole)
        }
      ],
      text: {
        format: zodTextFormat(cvAnalysisSchema, 'cv_analysis')
      }
    });

    return normalizeCvAnalysisOutput(response.output_parsed, fallback);
  } catch (error) {
    return {
      ...fallback,
      warningMessage: normalizeProviderError(error, 'cv')
    };
  }
};

const transcribeAudio = async (audio: UploadFile) => {
  if (!openai) {
    return '';
  }

  const file = new File([audio.buffer], audio.originalname || 'practice.webm', {
    type: audio.mimetype || 'audio/webm'
  });

  const transcript = await openai.audio.transcriptions.create({
    file,
    model: env.openaiTranscribeModel,
    language: 'vi',
    response_format: 'text',
    prompt:
      'Đây là một bài thuyết trình hoặc câu trả lời phỏng vấn bằng tiếng Việt. Hãy chép lại sát nội dung, giữ dấu câu và tiếng Việt có dấu khi có thể.'
  });

  return String(transcript ?? '');
};

const transcribeAudioSafely = async (audio?: UploadFile) => {
  if (!audio) {
    return { transcript: '', warningMessage: '' };
  }

  if (!openai) {
    return {
      transcript: '',
      warningMessage:
        'SpeakAI chưa có kết nối OpenAI để tự chép lời từ file ghi âm. Bạn có thể dán transcript thủ công để tiếp tục phân tích.'
    };
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const transcript = await transcribeAudio(audio);
      return {
        transcript: normalizeText(transcript),
        warningMessage: ''
      };
    } catch (error) {
      lastError = error;

      if (!isRetryableProviderError(error) || attempt === 2) {
        break;
      }

      await wait((attempt + 1) * 500);
    }
  }

  return {
    transcript: '',
    warningMessage: normalizeProviderError(lastError, 'transcription')
  };
};

const buildMetricScores = (
  transcript: string,
  durationSeconds: number,
  volumeSamples: VolumePoint[],
  context?: {
    practiceType?: 'presentation' | 'interview';
    topic?: string;
    targetRole?: string;
  }
) => {
  const words = transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const wordCount = words.length;
  const durationMinutes = Math.max(durationSeconds / 60, 0.2);
  const speechRateWpm = clamp(wordCount / durationMinutes, 0, 220);
  const fillerWordCount = fillerTerms.reduce((sum, term) => sum + countOccurrences(transcript, term), 0);
  const repeatCount = estimateRepeatCount(words);
  const contentSignals =
    wordCount > 0
      ? buildPracticeContentSignalsV2(
          transcript,
          context?.topic ?? '',
          context?.practiceType ?? 'presentation',
          context?.targetRole ?? ''
        )
      : null;
  const uniqueRatio = wordCount ? uniqueWords(transcript).length / wordCount : 0;
  const sentenceCount = contentSignals?.sentences.length ?? 0;
  const averageWordsPerSentence = sentenceCount ? wordCount / sentenceCount : wordCount;
  const topicCoverage = contentSignals?.topicCoverage ?? 0.55;
  const roleCoverage = contentSignals?.roleCoverage ?? (context?.practiceType === 'interview' ? 0.45 : 0.7);
  const hasConcreteEvidence =
    Boolean(contentSignals?.evidenceSentence) &&
    normalizeText(contentSignals?.evidenceSentence) !== normalizeText(contentSignals?.anchorSentence);
  const quantifiedEvidenceCount = transcript.match(/\b\d+(?:[.,]\d+)?\b/gu)?.length ?? 0;
  const actionVerbCount =
    transcript.match(/\b(phụ trách|triển khai|xây dựng|tối ưu|đàm phán|đề xuất|phối hợp|dẫn dắt|thuyết phục|cải thiện|tăng|giảm|chốt|quản lý|đo lường)\b/giu)
      ?.length ?? 0;
  const genericPhraseCount =
    transcript.match(/\b(nhiều việc|mọi thứ|khá ổn|cố gắng|học thêm|kinh nghiệm|tham gia|hỗ trợ nhóm|một số|nhiều thứ|các việc khác nhau)\b/giu)
      ?.length ?? 0;
  const longWordVariety = new Set(words.filter((word) => word.length >= 6)).size;
  const enhancedActionVerbCount = contentSignals?.actionCueCount ?? actionVerbCount;
  const enhancedGenericPhraseCount = contentSignals?.genericCueCount ?? genericPhraseCount;
  const exampleCueCount = contentSignals?.exampleCueCount ?? 0;
  const reasoningCueCount = contentSignals?.reasoningCueCount ?? 0;
  const repeatedSentenceStarts = new Set(
    (contentSignals?.sentences ?? []).map((sentence) =>
      sentence
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(' ')
    )
  ).size;
  const structureCueBoost =
    contentSignals?.hasStructureCue ? (context?.practiceType === 'presentation' ? 8 : 5) : context?.practiceType === 'presentation' ? -5 : -2;
  const ownershipCueBoost = contentSignals?.hasOwnershipCue ? 7 : context?.practiceType === 'interview' ? -5 : 0;
  const outcomeCueBoost = contentSignals?.hasOutcomeCue ? Math.min(12, (contentSignals?.evidenceCueCount ?? 0) * 3 + 4) : -6;
  const reflectionCueBoost = contentSignals?.hasReflectionCue ? 5 : 0;
  const problemCueBoost = contentSignals?.hasProblemCue && context?.practiceType === 'interview' ? 5 : 0;
  const genericCuePenalty = (contentSignals?.genericCueCount ?? 0) * 3;
  const specificityScore = clamp(
    24 +
      quantifiedEvidenceCount * 14 +
      enhancedActionVerbCount * 3 +
      exampleCueCount * 4 +
      reasoningCueCount * 4 +
      longWordVariety * 1.6 +
      (hasConcreteEvidence ? 10 : 0) +
      structureCueBoost +
      ownershipCueBoost +
      outcomeCueBoost +
      reflectionCueBoost +
      problemCueBoost -
      enhancedGenericPhraseCount * 10 -
      genericCuePenalty -
      Math.max(0, sentenceCount - repeatedSentenceStarts) * 4,
    18,
    98
  );

  const volumeAverage = volumeSamples.length
    ? volumeSamples.reduce((sum, point) => sum + point.value, 0) / volumeSamples.length
    : 0.45;
  const variance = volumeSamples.length
    ? volumeSamples.reduce((sum, point) => sum + (point.value - volumeAverage) ** 2, 0) / volumeSamples.length
    : 0.02;
  const deviation = Math.sqrt(variance);
  const volumeStability = clamp(100 - deviation * 220 - Math.abs(volumeAverage - 0.42) * 120);

  let pauseSeconds = 0;
  let pauseCount = 0;
  for (let index = 1; index < volumeSamples.length; index += 1) {
    const current = volumeSamples[index];
    const previous = volumeSamples[index - 1];

    if (current.value < 0.08 && previous.value < 0.08) {
      pauseSeconds += Math.max(0, current.time - previous.time);
    }

    if (current.value < 0.08 && previous.value >= 0.08) {
      pauseCount += 1;
    }
  }

  const targetSpeed = 132;
  const pacePenalty = Math.abs(speechRateWpm - targetSpeed) * 0.9;
  const structureScore = clamp(
    52 +
      Math.min(18, sentenceCount * 4) +
      Math.min(12, uniqueRatio * 28) +
      topicCoverage * 18 +
      roleCoverage * (context?.practiceType === 'interview' ? 10 : 4) +
      structureCueBoost +
      ownershipCueBoost * 0.7 +
      outcomeCueBoost * 0.6 +
      exampleCueCount * 2 +
      reasoningCueCount * 1.6 +
      specificityScore * 0.14 -
      Math.max(0, Math.abs(averageWordsPerSentence - 18) * 1.3),
    35,
    96
  );
  const clarityScore = clamp(
    18 +
      structureScore * 0.42 +
      specificityScore * 0.38 +
      Math.min(8, wordCount / 24) -
      fillerWordCount * 6 -
      repeatCount * 3 -
      enhancedGenericPhraseCount * 2 -
      genericCuePenalty * 0.7,
    22,
    98
  );
  const targetPauseCount = Math.max(2, Math.round(Math.max(sentenceCount, 4) * 0.75));
  const pauseScore = clamp(84 - Math.abs(pauseCount - targetPauseCount) * 4 - pauseSeconds * 3 + sentenceCount * 1.5, 18, 96);
  const paceScore = clamp(100 - pacePenalty + (speechRateWpm >= 108 && speechRateWpm <= 155 ? 6 : 0), 24, 100);
  const confidenceScore = clamp(
    volumeStability * 0.24 +
      clarityScore * 0.22 +
      pauseScore * 0.16 +
      paceScore * 0.14 +
      structureScore * 0.1 +
      specificityScore * 0.14
  );
  const totalScore = clamp(
    volumeStability * 0.16 +
      clarityScore * 0.22 +
      pauseScore * 0.14 +
      confidenceScore * 0.16 +
      paceScore * 0.1 +
      structureScore * 0.08 +
      specificityScore * 0.14
  );

  const chunks = 6;
  const wordChunks = splitWordsIntoChunks(words, chunks);
  const volumeChunks = buildVolumeSegments(volumeSamples, chunks);
  const chunkDurationMinutes = Math.max(durationMinutes / chunks, 0.15);

  const speedTimeline = wordChunks.map((chunk, index) => ({
    label: `Đoạn ${index + 1}`,
    value: clamp(chunk.length / chunkDurationMinutes, 0, 220)
  }));

  const heatmap = volumeChunks.map((chunk, index) => {
    const localSpeed = speedTimeline[index]?.value ?? speechRateWpm;
    const score = clamp(
      100 - Math.abs(localSpeed - targetSpeed) * 0.7 - Math.abs(chunk.average - 0.42) * 120 - chunk.silenceSeconds * 10
    );

    let note = 'Đoạn ổn định';
    if (localSpeed > 160) {
      note = 'Nói nhanh';
    } else if (localSpeed < 100) {
      note = 'Nói chậm';
    } else if (chunk.average < 0.22) {
      note = 'Thiếu lực giọng';
    }

    return {
      label: `Đoạn ${index + 1}`,
      score,
      note
    };
  });

  return {
    transcript,
    wordCount,
    speechRateWpm,
    volumeStability,
    clarityScore,
    pauseScore,
    confidenceScore,
    totalScore,
    fillerWordCount,
    repeatCount,
    speedTimeline,
    heatmap
  };
};

const buildAudioFallbackMetrics = (durationSeconds: number, volumeSamples: VolumePoint[]) => {
  const baseMetrics = buildMetricScores('', durationSeconds, volumeSamples);
  const chunks = 6;
  const volumeChunks = buildVolumeSegments(volumeSamples, chunks);
  const volumeAverage = volumeSamples.length
    ? volumeSamples.reduce((sum, point) => sum + point.value, 0) / volumeSamples.length
    : 0.45;
  const activityAverage = volumeChunks.reduce((sum, chunk) => sum + chunk.activityRatio, 0) / Math.max(1, volumeChunks.length);

  const estimatedSpeechRate = clamp(92 + volumeAverage * 90 + activityAverage * 54, 70, 190);
  const clarityScore = clamp(48 + baseMetrics.volumeStability * 0.34 + Math.min(12, volumeAverage * 22), 38, 84);
  const confidenceScore = clamp(
    (baseMetrics.volumeStability +
      clarityScore +
      baseMetrics.pauseScore +
      (100 - Math.abs(estimatedSpeechRate - 132) * 0.9)) /
      4 +
      4,
    35,
    92
  );
  const totalScore = clamp((baseMetrics.volumeStability + clarityScore + baseMetrics.pauseScore + confidenceScore) / 4);

  return {
    ...baseMetrics,
    speechRateWpm: estimatedSpeechRate,
    clarityScore,
    confidenceScore,
    totalScore,
    speedTimeline: volumeChunks.map((chunk, index) => ({
      label: `Đoạn ${index + 1}`,
      value: clamp(86 + chunk.activityRatio * 94 - chunk.silenceSeconds * 12, 60, 190)
    })),
    heatmap: volumeChunks.map((chunk, index) => ({
      label: `Đoạn ${index + 1}`,
      score: clamp(
        100 -
          Math.abs((86 + chunk.activityRatio * 94) - 132) * 0.7 -
          Math.abs(chunk.average - 0.42) * 120 -
          chunk.silenceSeconds * 10
      ),
      note:
        chunk.average < 0.22 ? 'Thiếu lực giọng' : chunk.silenceSeconds > 1.4 ? 'Khoảng dừng dài' : 'Nhịp nói khá ổn'
    }))
  };
};

const buildContextualFollowUpQuestions = (input: {
  practiceType: 'presentation' | 'interview';
  topic: string;
  transcript: string;
  speechRateWpm: number;
  clarityScore: number;
  pauseScore: number;
}) => {
  const topicLabel =
    normalizeText(input.topic) || (input.practiceType === 'presentation' ? 'bài thuyết trình hiện tại' : 'câu trả lời hiện tại');
  const transcriptKeywords = extractKeywords(`${input.topic} ${input.transcript}`, 4);
  const keywordAnchor = transcriptKeywords[0] || 'ý chính vừa trình bày';
  const evidenceAnchor =
    transcriptKeywords[1] || (input.practiceType === 'presentation' ? 'ví dụ minh họa' : 'kết quả cụ thể');

  const questions =
    input.practiceType === 'presentation'
      ? [
          `Nếu trình bày lại chủ đề "${topicLabel}", bạn sẽ mở đầu bằng câu nào để vào ý nhanh và rõ hơn?`,
          input.speechRateWpm > 155
            ? `Bạn sẽ cắt bớt hoặc dừng ở đâu trong phần nói về "${keywordAnchor}" để người nghe theo kịp hơn?`
            : `Bạn sẽ thêm ví dụ hoặc số liệu nào ở phần "${evidenceAnchor}" để bài nói thuyết phục hơn?`,
          input.pauseScore < 60
            ? 'Bạn sẽ chủ động đặt điểm dừng ngắn ở đâu để tách rõ từng ý chính?'
            : `Bạn muốn nhấn mạnh lại thông điệp nào để người nghe nhớ lâu nhất về "${topicLabel}"?`
        ]
      : [
          `Nếu nhà tuyển dụng hỏi sâu hơn về "${topicLabel}", bạn sẽ dùng ví dụ nào để trả lời chắc hơn?`,
          input.speechRateWpm > 155
            ? `Bạn sẽ rút gọn phần nào trong câu trả lời về "${keywordAnchor}" để vẫn đủ ý mà không bị vội?`
            : `Bạn sẽ bổ sung kết quả đo được nào để phần nói về "${evidenceAnchor}" đáng tin hơn?`,
          input.clarityScore < 65
            ? 'Bạn sẽ đổi câu nào thành ngắn gọn hơn để nhà tuyển dụng nghe là hiểu ngay giá trị của bạn?'
            : `Câu chốt nào bạn muốn nhấn mạnh lại để thể hiện rõ nhất năng lực của mình với chủ đề "${topicLabel}"?`
        ];

  return Array.from(new Set(questions.map((item) => normalizeText(item)))).slice(0, 3);
};

const buildFallbackPracticeFeedback = (input: {
  practiceType: 'presentation' | 'interview';
  topic: string;
  transcript: string;
  speechRateWpm: number;
  volumeStability: number;
  clarityScore: number;
  pauseScore: number;
  confidenceScore: number;
  fillerWordCount: number;
  repeatCount: number;
  transcriptAvailable: boolean;
  warningMessage?: string;
}): PracticeAnalysisResult => {
  const topicLabel =
    normalizeText(input.topic) || (input.practiceType === 'presentation' ? 'bài thuyết trình hiện tại' : 'câu trả lời hiện tại');
  const strengths: string[] = [];
  const improvements: string[] = [];
  const coachNotes: string[] = [];

  if (input.speechRateWpm >= 110 && input.speechRateWpm <= 155) {
    strengths.push('Tốc độ nói đang ở mức dễ nghe và dễ theo dõi.');
  } else if (input.speechRateWpm > 155) {
    improvements.push('Tốc độ nói đang khá nhanh, nên chèn thêm điểm dừng sau mỗi ý chính.');
  } else {
    improvements.push('Tốc độ nói đang hơi chậm, nên vào thẳng ý chính sớm hơn để giữ nhịp.');
  }

  if (input.volumeStability >= 68) {
    strengths.push('Âm lượng khá ổn định trong suốt phần trình bày.');
  } else {
    improvements.push('Âm lượng chưa đều, nên giữ khoảng cách micro ổn định hơn.');
  }

  if (input.clarityScore >= 70) {
    strengths.push('Độ rõ phát âm khá tốt và ý nói tương đối sáng.');
  } else {
    improvements.push('Cần nói dứt ý hơn và giảm các cụm rườm rà để nội dung rõ hơn.');
  }

  if (input.pauseScore >= 65) {
    strengths.push('Khoảng dừng khá hợp lý, giúp chia nhịp bài nói tốt hơn.');
  } else {
    improvements.push('Khoảng dừng chưa tối ưu, nên dừng ngắn trước ý quan trọng thay vì ngắt giữa câu.');
  }

  if (input.fillerWordCount > 4) {
    improvements.push('Số từ đệm còn hơi nhiều, cần thay bằng khoảng dừng ngắn và câu ngắn hơn.');
  }

  if (input.repeatCount > 3) {
    improvements.push('Nội dung có dấu hiệu lặp ý, nên chốt trước 3 ý chính rồi mới bắt đầu nói.');
  }

  if (input.confidenceScore < 60) {
    coachNotes.push('Hãy chuẩn bị sẵn một câu mở đầu và một câu chốt để giữ phong thái tự tin hơn.');
  }

  if (input.speechRateWpm > 155) {
    coachNotes.push(`Với chủ đề "${topicLabel}", hãy chia phần nói thành 3 ý ngắn để tốc độ ổn định hơn.`);
  } else {
    coachNotes.push(`Ở lượt tiếp theo, hãy nhấn mạnh một ví dụ cụ thể cho chủ đề "${topicLabel}" để phần nói có điểm tựa rõ hơn.`);
  }

  if (input.fillerWordCount > 0 || input.repeatCount > 0) {
    coachNotes.push('Nghe lại bản ghi và đánh dấu đúng câu bị lặp hoặc bị vướng từ đệm để sửa nhanh hơn ở lần sau.');
  }

  if (!input.transcriptAvailable) {
    strengths.unshift('SpeakAI vẫn đo được nhịp nói, âm lượng và khoảng dừng trực tiếp từ file ghi âm.');
    improvements.unshift('Chưa chép được transcript nên kết quả hiện tại chưa đi sâu vào cách dùng từ và độ mạch lạc nội dung.');
    coachNotes.unshift('Hãy dán transcript hoặc thử phân tích lại khi mạng ổn định hơn để nhận góp ý đầy đủ hơn.');
  }

  if (input.warningMessage) {
    coachNotes.unshift(input.warningMessage);
  }

  const summary = !input.transcriptAvailable
    ? 'SpeakAI đang dùng bản phân tích dự phòng từ tín hiệu âm thanh, nên kết quả hiện tại tập trung vào nhịp nói, âm lượng, khoảng dừng và độ ổn định tổng thể.'
    : input.practiceType === 'presentation'
      ? `Bài thuyết trình về "${topicLabel}" đã có khung nội dung cơ bản, nhưng vẫn cần tối ưu nhịp nói và cách nhấn ý để thuyết phục hơn.`
      : `Câu trả lời phỏng vấn cho chủ đề "${topicLabel}" đã có nội dung cốt lõi, nhưng vẫn cần rõ ý và chắc nhịp hơn để tạo cảm giác tự tin.`;

  return {
    transcript: normalizeText(input.transcript),
    speechRateWpm: input.speechRateWpm,
    volumeStability: input.volumeStability,
    clarityScore: input.clarityScore,
    pauseScore: input.pauseScore,
    confidenceScore: input.confidenceScore,
    totalScore: clamp((input.volumeStability + input.clarityScore + input.pauseScore + input.confidenceScore) / 4),
    fillerWordCount: input.fillerWordCount,
    repeatCount: input.repeatCount,
    speedTimeline: [],
    heatmap: [],
    summary,
    strengths: mergeUniqueTexts(strengths, ['Bạn đã có đủ dữ liệu nền để tiếp tục luyện tập sâu hơn.'], 4),
    improvements: mergeUniqueTexts(improvements, ['Hãy luyện thêm một lượt ngắn và nghe lại để chốt đúng điểm cần sửa.'], 5),
    coachNotes: mergeUniqueTexts(
      coachNotes,
      ['Luyện với đồng hồ 60-90 giây để giữ câu trả lời ngắn gọn và có trọng tâm.'],
      5
    ),
    followUpQuestions: buildContextualFollowUpQuestions({
      practiceType: input.practiceType,
      topic: input.topic,
      transcript: input.transcript,
      speechRateWpm: input.speechRateWpm,
      clarityScore: input.clarityScore,
      pauseScore: input.pauseScore
    })
  };
};

const buildSmartContextualFollowUpQuestions = (input: {
  practiceType: 'presentation' | 'interview';
  topic: string;
  transcript: string;
  speechRateWpm: number;
  clarityScore: number;
  pauseScore: number;
  targetRole?: string;
}) => {
  const signals = buildPracticeContentSignalsV2(input.transcript, input.topic, input.practiceType, input.targetRole ?? '');
  const topicLabel = signals.shortTopicLabel;
  const anchorQuote = compactQuote(signals.anchorSentence || topicLabel);
  const evidenceQuote = compactQuote(
    signals.evidenceSentence ||
      signals.supportingSentence ||
      (input.practiceType === 'presentation' ? 'ví dụ minh họa' : 'kết quả cụ thể')
  );
  const roleLabel = normalizeText(input.targetRole) || 'vai trò mục tiêu hiện tại';

  const questions =
    input.practiceType === 'presentation'
      ? [
          !signals.hasStructureCue
            ? `Nếu trình bày lại chủ đề "${topicLabel}", bạn sẽ chia bài thành 3 phần nào để người nghe theo kịp hơn?`
            : signals.anchorSentence
              ? `Trong ý "${anchorQuote}", bạn sẽ nhấn lại câu nào để người nghe hiểu ngay thông điệp chính?`
              : `Nếu trình bày lại chủ đề "${topicLabel}", bạn sẽ mở đầu bằng câu nào để vào ý nhanh hơn?`,
          signals.topicCoverage < 0.35
            ? `Bài nói đang chạm chưa nhiều vào chủ đề "${topicLabel}". Bạn sẽ bổ sung luận điểm nào để bám sát trọng tâm hơn?`
            : !signals.hasOutcomeCue
              ? `Bạn sẽ thêm ví dụ, số liệu hay kết quả nào quanh "${evidenceQuote}" để bài nói có sức nặng hơn?`
              : `Bạn sẽ bổ sung chi tiết nào quanh "${evidenceQuote}" để bài nói thuyết phục hơn?`,
          input.speechRateWpm > 155
            ? 'Bạn sẽ chủ động dừng ở đâu để giảm cảm giác nói nhanh và tách rõ từng ý chính?'
            : input.pauseScore < 60
              ? 'Bạn sẽ đặt điểm dừng ngắn ở đâu để bài nói có nhịp chắc hơn?'
              : signals.genericCueCount >= 3
                ? 'Câu nào trong bài đang còn chung chung và bạn sẽ thay nó bằng ví dụ cụ thể nào?'
                : 'Người nghe cần nhớ điều gì nhất sau bài trình bày này, và bạn sẽ chốt lại bằng câu nào?'
        ]
      : [
          !signals.hasOwnershipCue
            ? `Trong câu trả lời vừa rồi, phần việc nào là do chính bạn trực tiếp chịu trách nhiệm trong bối cảnh ${roleLabel}?`
            : signals.anchorSentence
              ? `Nếu nhà tuyển dụng hỏi sâu hơn về câu "${anchorQuote}", bạn sẽ dùng ví dụ nào để trả lời chắc hơn?`
              : `Nếu nhà tuyển dụng hỏi sâu hơn về "${topicLabel}", bạn sẽ trả lời bằng ví dụ nào cụ thể nhất?`,
          signals.topicCoverage < 0.35 || signals.roleCoverage < 0.3
            ? `Câu trả lời hiện tại chưa bám sát vai trò ${roleLabel}. Bạn sẽ nối kinh nghiệm của mình với vai trò này bằng ý nào?`
            : !signals.hasOutcomeCue
              ? `Kết quả đo được nào bạn có thể bổ sung quanh "${evidenceQuote}" để câu trả lời có sức nặng hơn?`
              : `Bạn sẽ thêm kết quả đo được nào quanh "${evidenceQuote}" để câu trả lời có sức nặng hơn?`,
          !signals.hasProblemCue
            ? 'Khó khăn thực tế lớn nhất trong tình huống đó là gì, và bạn đã xử lý ra sao?'
            : !signals.hasReflectionCue
              ? 'Sau trải nghiệm đó, bài học lớn nhất bạn rút ra là gì và bạn đã thay đổi cách làm ra sao?'
              : input.clarityScore < 65
                ? 'Bạn sẽ rút gọn câu nào để người nghe hiểu ngay giá trị của bạn chỉ sau một lần nghe?'
                : 'Nếu phải chốt trong một câu, bạn muốn nhà tuyển dụng nhớ nhất điều gì về năng lực của mình?'
        ];

  return Array.from(new Set(questions.map((item) => normalizeText(item)))).slice(0, 3);
};

const buildSmartFallbackPracticeFeedbackV2 = (input: {
  practiceType: 'presentation' | 'interview';
  topic: string;
  transcript: string;
  speechRateWpm: number;
  volumeStability: number;
  clarityScore: number;
  pauseScore: number;
  confidenceScore: number;
  fillerWordCount: number;
  repeatCount: number;
  transcriptAvailable: boolean;
  warningMessage?: string;
  targetRole?: string;
}): PracticeAnalysisResult => {
  const signals = buildPracticeContentSignalsV2(input.transcript, input.topic, input.practiceType, input.targetRole ?? '');
  const topicLabel = signals.shortTopicLabel;
  const roleLabel = normalizeText(input.targetRole) || 'vai trò mục tiêu';
  const anchorQuote = compactQuote(signals.anchorSentence || topicLabel);
  const evidenceQuote = compactQuote(signals.evidenceSentence || signals.supportingSentence || topicLabel);
  const strengths: string[] = [];
  const improvements: string[] = [];
  const coachNotes: string[] = [];

  if (!input.transcriptAvailable) {
    strengths.push('SpeakAI vẫn phân tích được nhịp nói, âm lượng và khoảng dừng trực tiếp từ file ghi âm.');
    improvements.push('Chưa chép được transcript nên nhận xét hiện tại chưa đi sâu vào cách dùng từ và độ mạch lạc của nội dung.');
    coachNotes.push('Hãy dán transcript hoặc thử phân tích lại khi mạng ổn định hơn để nhận góp ý đầy đủ hơn.');
  } else {
    if (signals.topicCoverage >= 0.5) {
      strengths.push(`Nội dung đang bám khá đúng vào chủ đề "${topicLabel}".`);
    } else {
      improvements.push(`Bài nói còn bám chưa sát chủ đề "${topicLabel}", nên cần chốt rõ trọng tâm hơn.`);
    }

    if (signals.hasOwnershipCue) {
      strengths.push('Bạn đã cho thấy phần việc bản thân trực tiếp đảm nhiệm, giúp nội dung đáng tin hơn.');
    } else if (input.practiceType === 'interview') {
      improvements.push('Câu trả lời chưa làm rõ phần việc bạn trực tiếp chịu trách nhiệm, nên giá trị cá nhân còn mờ.');
    }

    if (signals.hasOutcomeCue) {
      strengths.push(`Bài nói đã có tín hiệu về kết quả hoặc tác động cụ thể quanh "${evidenceQuote}".`);
    } else {
      improvements.push('Bài nói còn thiếu số liệu, kết quả hoặc tác động cụ thể để tăng sức nặng.');
    }

    if (signals.hasStructureCue) {
      strengths.push(
        input.practiceType === 'presentation'
          ? 'Bài trình bày đã có nhịp chia ý tương đối rõ, giúp người nghe theo dõi tốt hơn.'
          : 'Câu trả lời đã có khung tình huống - hành động - kết quả tương đối rõ.'
      );
    } else {
      improvements.push(
        input.practiceType === 'presentation'
          ? 'Bài trình bày chưa thể hiện rõ bố cục mở đầu - ý chính - chốt lại.'
          : 'Câu trả lời nên đi rõ hơn theo bối cảnh - hành động - kết quả để dễ theo dõi.'
      );
    }

    if (signals.exampleCueCount > 0) {
      strengths.push('Bạn đã đưa ra ví dụ hoặc chi tiết cụ thể thay vì chỉ nói khái quát.');
    } else {
      improvements.push('Nên thêm một ví dụ thật hoặc tình huống cụ thể để người nghe hình dung rõ hơn.');
    }

    if (input.practiceType === 'interview') {
      if (signals.hasProblemCue) {
        strengths.push('Câu trả lời đã chạm vào khó khăn hoặc áp lực thực tế, khá đúng tinh thần phỏng vấn.');
      } else {
        improvements.push('Nên nhắc tới khó khăn, áp lực hoặc mâu thuẫn thực tế để câu trả lời có chiều sâu hơn.');
      }

      if (signals.hasReflectionCue) {
        strengths.push('Bạn đã cho thấy bài học rút ra hoặc hướng cải thiện sau trải nghiệm.');
      } else {
        improvements.push('Câu trả lời nên có thêm bài học rút ra hoặc điều bạn sẽ làm tốt hơn ở lần sau.');
      }
    }

    if (signals.genericCueCount >= 3) {
      improvements.push('Một số câu còn khá chung chung, nên thay bằng hành động, ví dụ hoặc kết quả cụ thể hơn.');
    }
  }

  if (input.speechRateWpm >= 110 && input.speechRateWpm <= 155) {
    strengths.push('Tốc độ nói đang ở mức dễ nghe và khá vừa nhịp.');
  } else if (input.speechRateWpm > 155) {
    improvements.push('Tốc độ nói đang khá nhanh, nên chèn thêm điểm dừng sau mỗi ý chính.');
    coachNotes.push(`Với chủ đề "${topicLabel}", hãy chia ý "${anchorQuote}" thành 2-3 câu ngắn để giữ nhịp tốt hơn.`);
  } else {
    improvements.push('Tốc độ nói đang hơi chậm, nên vào thẳng ý chính sớm hơn.');
    coachNotes.push('Thử mở đầu bằng một câu chốt rõ ý rồi đi ngay vào phần minh họa để giữ nhịp tốt hơn.');
  }

  if (input.volumeStability >= 68) {
    strengths.push('Âm lượng tương đối ổn định trong suốt lượt nói.');
  } else {
    improvements.push('Âm lượng chưa đều, nên giữ khoảng cách micro ổn định hơn.');
    coachNotes.push('Thử luyện lại với cùng khoảng cách micro và tránh xoay đầu quá nhiều khi nói.');
  }

  if (input.clarityScore >= 70) {
    strengths.push('Độ rõ phát âm khá tốt, người nghe có thể nắm ý chính nhanh.');
  } else {
    improvements.push('Cần nói dứt ý hơn và cắt bớt các cụm rườm rà để nội dung rõ hơn.');
  }

  if (input.pauseScore >= 65) {
    strengths.push('Khoảng dừng khá hợp lý, giúp bài nói có nhịp thở tốt hơn.');
  } else {
    improvements.push('Khoảng dừng chưa tối ưu, nên dừng ngắn trước ý quan trọng thay vì ngắt giữa câu.');
  }

  if (input.fillerWordCount > 4) {
    improvements.push('Từ đệm xuất hiện hơi nhiều, nên thay bằng khoảng dừng ngắn để giữ sự chắc chắn.');
  }

  if (input.repeatCount > 3) {
    improvements.push('Nội dung có dấu hiệu lặp ý, nên chốt trước 3 ý chính rồi mới bắt đầu nói.');
  }

  if (!signals.hasOwnershipCue && input.transcriptAvailable) {
    coachNotes.push('Hãy thử công thức: “Tôi trực tiếp phụ trách..., tôi đã làm..., kết quả là...” để vai trò cá nhân rõ hơn.');
  }
  if (!signals.hasOutcomeCue && input.transcriptAvailable) {
    coachNotes.push('Chuẩn bị sẵn ít nhất một con số, một kết quả hoặc một tác động cụ thể để chèn vào lần nói tiếp theo.');
  }
  if (!signals.hasStructureCue && input.practiceType === 'presentation' && input.transcriptAvailable) {
    coachNotes.push('Trước khi nói, hãy chốt 3 nhịp rõ: mở vấn đề, triển khai ý chính, kết luận.');
  }
  if (!signals.hasProblemCue && input.practiceType === 'interview' && input.transcriptAvailable) {
    coachNotes.push(`Hãy gắn câu trả lời với một khó khăn thật bạn từng gặp trong vai trò ${roleLabel} để tăng độ thuyết phục.`);
  }
  if (!signals.hasReflectionCue && input.practiceType === 'interview' && input.transcriptAvailable) {
    coachNotes.push('Chốt thêm một bài học rút ra hoặc một thay đổi bạn sẽ làm ở lần sau để câu trả lời trưởng thành hơn.');
  }

  const followUpQuestions = Array.from(
    new Set(
      [
        !signals.hasOwnershipCue
          ? `Trong phần "${anchorQuote}", bạn trực tiếp chịu trách nhiệm điều gì?`
          : `Nếu hỏi sâu hơn về "${anchorQuote}", bạn sẽ dùng ví dụ nào để trả lời chắc hơn?`,
        !signals.hasOutcomeCue
          ? `Kết quả cụ thể nào bạn có thể bổ sung quanh "${evidenceQuote}" để tăng sức nặng?`
          : `Bạn sẽ nhấn lại chỉ số hoặc tác động nào quanh "${evidenceQuote}" để người nghe nhớ rõ nhất?`,
        input.practiceType === 'interview'
          ? !signals.hasProblemCue
            ? 'Khó khăn lớn nhất trong tình huống đó là gì và bạn đã xử lý ra sao?'
            : !signals.hasReflectionCue
              ? 'Sau trải nghiệm đó, bài học lớn nhất bạn rút ra là gì?'
              : 'Nếu nhà tuyển dụng hỏi vặn sâu hơn, bạn sẽ bảo vệ quyết định của mình thế nào?'
          : !signals.hasStructureCue
            ? 'Nếu trình bày lại, bạn sẽ chia bài nói thành 3 ý nào để người nghe theo kịp hơn?'
            : 'Câu chốt nào sẽ giúp người nghe nhớ đúng trọng tâm của bài trình bày này?'
      ].map((item) => normalizeText(item))
    )
  ).slice(0, 3);

  const summary = !input.transcriptAvailable
    ? 'SpeakAI chưa chép được transcript từ file ghi âm, nên kết quả hiện tại tập trung vào nhịp nói, âm lượng, khoảng dừng và độ ổn định tổng thể.'
    : input.practiceType === 'presentation'
      ? `Bài thuyết trình về "${topicLabel}" đã có nền nội dung rõ hơn khi bạn bám được vào "${anchorQuote}", nhưng vẫn cần tăng độ cụ thể và bố cục để thuyết phục hơn.`
      : `Câu trả lời phỏng vấn cho "${topicLabel}" đã có khung nội dung cơ bản, nhưng cần làm rõ hơn vai trò cá nhân, kết quả và chiều sâu phản xạ để công bằng với năng lực thật.`;

  return {
    transcript: input.transcript,
    speechRateWpm: input.speechRateWpm,
    volumeStability: input.volumeStability,
    clarityScore: input.clarityScore,
    pauseScore: input.pauseScore,
    confidenceScore: input.confidenceScore,
    totalScore: 0,
    fillerWordCount: input.fillerWordCount,
    repeatCount: input.repeatCount,
    speedTimeline: [],
    heatmap: [],
    summary,
    strengths: Array.from(new Set(strengths)).slice(0, 5),
    improvements: Array.from(new Set(improvements)).slice(0, 6),
    coachNotes: Array.from(new Set(coachNotes)).slice(0, 6),
    followUpQuestions
  };
};

const buildSmartFallbackPracticeFeedback = (input: {
  practiceType: 'presentation' | 'interview';
  topic: string;
  transcript: string;
  speechRateWpm: number;
  volumeStability: number;
  clarityScore: number;
  pauseScore: number;
  confidenceScore: number;
  fillerWordCount: number;
  repeatCount: number;
  transcriptAvailable: boolean;
  warningMessage?: string;
  targetRole?: string;
}): PracticeAnalysisResult => {
  const signals = buildPracticeContentSignalsV2(input.transcript, input.topic, input.practiceType, input.targetRole ?? '');
  const topicLabel = signals.shortTopicLabel;
  const roleLabel = normalizeText(input.targetRole) || 'vai trò mục tiêu';
  const anchorQuote = compactQuote(signals.anchorSentence || topicLabel);
  const evidenceQuote = compactQuote(signals.evidenceSentence || signals.supportingSentence || topicLabel);
  const strengths: string[] = [];
  const improvements: string[] = [];
  const coachNotes: string[] = [];

  if (input.transcriptAvailable && signals.hasOwnershipCue) {
    strengths.push('Bạn đã cho thấy khá rõ phần việc mình trực tiếp chịu trách nhiệm, nên người nghe dễ tin hơn.');
  } else if (input.practiceType === 'interview' && input.transcriptAvailable) {
    improvements.push('Câu trả lời chưa nói rõ phần việc bạn trực tiếp chịu trách nhiệm, nên giá trị cá nhân còn mờ.');
  }

  if (input.transcriptAvailable && signals.hasOutcomeCue) {
    strengths.push(`Bài nói đã có tín hiệu về kết quả hoặc tác động cụ thể quanh "${evidenceQuote}".`);
  } else if (input.transcriptAvailable) {
    improvements.push('Bài nói còn thiếu số liệu, kết quả hoặc tác động rõ ràng để tăng sức nặng.');
  }

  if (input.practiceType === 'presentation' && input.transcriptAvailable) {
    if (signals.hasStructureCue) {
      strengths.push('Bài trình bày đã có dấu hiệu chia ý khá rõ, giúp người nghe theo kịp hơn.');
    } else {
      improvements.push('Bài trình bày chưa thể hiện rõ bố cục mở đầu - ý chính - chốt lại, nên còn hơi rời.');
    }
  }

  if (input.practiceType === 'interview' && input.transcriptAvailable) {
    if (signals.hasProblemCue) {
      strengths.push('Câu trả lời đã chạm vào bối cảnh khó khăn hoặc vấn đề thực tế, khá hợp ngữ cảnh phỏng vấn.');
    } else {
      improvements.push('Nên thêm bối cảnh khó khăn hoặc áp lực thực tế để câu trả lời bớt chung chung.');
    }

    if (signals.hasReflectionCue) {
      strengths.push('Bạn đã cho thấy bài học rút ra hoặc hướng cải thiện, giúp câu trả lời trưởng thành hơn.');
    } else {
      improvements.push('Câu trả lời nên có thêm bài học rút ra hoặc điều bạn sẽ làm khác đi ở lần sau.');
    }
  }

  if (input.transcriptAvailable && signals.genericCueCount >= 3) {
    improvements.push('Một số câu còn chung chung, nên thay bằng ví dụ, quyết định hoặc con số cụ thể hơn.');
  }

  if (signals.topicCoverage >= 0.45 && input.transcriptAvailable) {
    strengths.push(`Nội dung đã bám khá đúng vào chủ đề "${topicLabel}".`);
  } else if (input.transcriptAvailable) {
    improvements.push(`Nội dung hiện vẫn bám chưa sát chủ đề "${topicLabel}", nên cần chốt lại đúng trọng tâm hơn.`);
  }

  if (signals.evidenceSentence) {
    strengths.push(`Bài nói đã có một điểm tựa nội dung rõ ở ý "${evidenceQuote}".`);
  } else if (input.transcriptAvailable) {
    improvements.push('Bài nói còn thiếu ví dụ, kết quả hoặc tình huống cụ thể để tăng độ thuyết phục.');
  }

  if (input.speechRateWpm >= 110 && input.speechRateWpm <= 155) {
    strengths.push('Tốc độ nói đang ở mức dễ nghe và đủ nhịp để người nghe theo kịp.');
  } else if (input.speechRateWpm > 155) {
    improvements.push('Tốc độ nói đang khá nhanh, nên chèn thêm điểm dừng sau mỗi ý chính.');
  } else {
    improvements.push('Tốc độ nói đang hơi chậm, nên vào thẳng ý chính sớm hơn để giữ nhịp.');
  }

  if (input.volumeStability >= 68) {
    strengths.push('Âm lượng khá ổn định trong suốt phần trình bày.');
  } else {
    improvements.push('Âm lượng chưa đều, nên giữ khoảng cách micro ổn định hơn.');
  }

  if (input.clarityScore >= 70) {
    strengths.push('Độ rõ phát âm khá tốt và ý nói tương đối sáng.');
  } else {
    improvements.push('Cần nói dứt ý hơn và giảm các cụm rườm rà để nội dung rõ hơn.');
  }

  if (input.pauseScore >= 65) {
    strengths.push('Khoảng dừng khá hợp lý, giúp chia nhịp bài nói tốt hơn.');
  } else {
    improvements.push('Khoảng dừng chưa tối ưu, nên dừng ngắn trước ý quan trọng thay vì ngắt giữa câu.');
  }

  if (input.fillerWordCount > 4) {
    improvements.push('Số từ đệm còn hơi nhiều, nên thay bằng khoảng dừng ngắn và câu ngắn hơn.');
  }

  if (input.repeatCount > 3) {
    improvements.push('Nội dung có dấu hiệu lặp ý, nên chốt trước 3 ý chính rồi mới bắt đầu nói.');
  }

  if (input.confidenceScore < 60) {
    coachNotes.push('Hãy chuẩn bị sẵn một câu mở đầu và một câu chốt để giữ phong thái tự tin hơn.');
  }

  if (input.speechRateWpm > 155 && signals.anchorSentence) {
    coachNotes.push(`Ở lượt nói tiếp theo, hãy chia ý "${anchorQuote}" thành 2-3 câu ngắn để tốc độ ổn định hơn.`);
  } else {
    coachNotes.push(`Hãy nhấn mạnh thêm một ví dụ hoặc chi tiết cụ thể quanh "${evidenceQuote}" để bài nói có điểm tựa rõ hơn.`);
  }

  if (input.transcriptAvailable && !signals.hasOwnershipCue) {
    coachNotes.push('Hãy thử nói lại bằng mẫu: “Tôi trực tiếp phụ trách..., tôi đã làm..., kết quả là...” để vai trò cá nhân rõ hơn.');
  }

  if (input.transcriptAvailable && !signals.hasOutcomeCue) {
    coachNotes.push('Chuẩn bị sẵn ít nhất một con số, một kết quả hoặc một tác động cụ thể để chèn vào lần nói tiếp theo.');
  }

  if (input.practiceType === 'presentation' && input.transcriptAvailable && !signals.hasStructureCue) {
    coachNotes.push('Trước khi nói, hãy chốt sẵn 3 nhịp rõ: mở vấn đề, triển khai ý chính, kết luận.');
  }

  if (input.practiceType === 'interview' && input.transcriptAvailable && !signals.hasProblemCue) {
    coachNotes.push('Với câu trả lời phỏng vấn, hãy thêm một đoạn nói rõ khó khăn hoặc áp lực thực tế để câu chuyện đáng tin hơn.');
  }

  if (input.fillerWordCount > 0 || input.repeatCount > 0) {
    coachNotes.push('Nghe lại bản ghi và đánh dấu đúng câu bị lặp hoặc bị vướng từ đệm để sửa nhanh hơn ở lần sau.');
  }

  if (input.practiceType === 'interview' && (signals.topicCoverage < 0.35 || signals.roleCoverage < 0.3)) {
    coachNotes.push(`Hãy nối câu trả lời về "${topicLabel}" trực tiếp hơn với vai trò ${roleLabel} để ngữ cảnh phỏng vấn rõ hơn.`);
  }

  if (signals.sentences.length <= 2 && input.transcriptAvailable) {
    improvements.push('Nội dung đang hơi ngắn, nên thêm một ý giải thích hoặc một ví dụ để bài nói đầy đặn hơn.');
  }

  if (!input.transcriptAvailable) {
    strengths.unshift('SpeakAI vẫn đo được nhịp nói, âm lượng và khoảng dừng trực tiếp từ file ghi âm.');
    improvements.unshift('Chưa chép được transcript nên kết quả hiện tại chưa đi sâu vào cách dùng từ và độ mạch lạc nội dung.');
    coachNotes.unshift('Hãy dán transcript hoặc thử phân tích lại khi mạng ổn định hơn để nhận góp ý đầy đủ hơn.');
  }

  if (input.warningMessage) {
    coachNotes.unshift(input.warningMessage);
  }

  const summary = !input.transcriptAvailable
    ? 'SpeakAI đang dùng bản phân tích dự phòng từ tín hiệu âm thanh, nên kết quả hiện tại tập trung vào nhịp nói, âm lượng, khoảng dừng và độ ổn định tổng thể.'
    : input.practiceType === 'presentation'
      ? signals.topicCoverage < 0.35
        ? `Bài thuyết trình đang nói quanh chủ đề "${topicLabel}", nhưng phần nội dung chính vẫn chưa bám đủ sát trọng tâm. Bạn cần chốt lại thông điệp, ví dụ minh họa và nhịp nhấn để người nghe hiểu nhanh hơn.`
        : !signals.hasStructureCue
          ? `Bài thuyết trình về "${topicLabel}" đã có nội dung nền, nhưng bố cục vẫn chưa thật rõ. Nếu chia lại mạch mở đầu - ý chính - chốt lại và giữ nhịp nhấn tốt hơn, bài nói sẽ chuyên nghiệp hơn nhiều.`
          : !signals.hasOutcomeCue
            ? `Bài thuyết trình về "${topicLabel}" đã có khung ý tương đối rõ ở phần "${anchorQuote}", nhưng vẫn thiếu ví dụ hoặc kết quả cụ thể để tăng sức thuyết phục.`
            : `Bài thuyết trình về "${topicLabel}" đã có khung ý rõ hơn ở phần "${anchorQuote}" và bắt đầu có điểm tựa nội dung quanh "${evidenceQuote}". Lần luyện tiếp theo nên tập trung tăng độ sắc của ví dụ và câu chốt.`
      : signals.topicCoverage < 0.35 || signals.roleCoverage < 0.3
        ? `Câu trả lời phỏng vấn hiện chưa bám đủ sát vai trò và chủ đề "${topicLabel}". Bạn nên nối kinh nghiệm của mình trực tiếp hơn với giá trị nhà tuyển dụng cần nghe.`
        : !signals.hasOwnershipCue && !signals.hasOutcomeCue
          ? `Câu trả lời phỏng vấn về "${topicLabel}" đã có ý nền, nhưng vẫn còn thiên về mô tả chung. Bạn cần nói rõ mình trực tiếp làm gì và kết quả cụ thể ra sao để tạo cảm giác đáng tin hơn.`
          : !signals.hasProblemCue || !signals.hasReflectionCue
            ? `Câu trả lời phỏng vấn về "${topicLabel}" đã đi đúng hướng, nhưng vẫn thiếu phần khó khăn thực tế hoặc bài học rút ra nên chiều sâu chưa đủ.`
            : `Câu trả lời phỏng vấn về "${topicLabel}" đã có một số ý chính rõ hơn ở phần "${anchorQuote}", và ngữ cảnh bắt đầu bám sát hơn vào vai trò ${roleLabel}. Lần tiếp theo chỉ cần tăng thêm độ sắc ở kết quả đo được và câu chốt.`;

  return {
    transcript: normalizeText(input.transcript),
    speechRateWpm: input.speechRateWpm,
    volumeStability: input.volumeStability,
    clarityScore: input.clarityScore,
    pauseScore: input.pauseScore,
    confidenceScore: input.confidenceScore,
    totalScore: clamp((input.volumeStability + input.clarityScore + input.pauseScore + input.confidenceScore) / 4),
    fillerWordCount: input.fillerWordCount,
    repeatCount: input.repeatCount,
    speedTimeline: [],
    heatmap: [],
    summary,
    strengths: mergeUniqueTexts(strengths, ['Bài nói đã có đủ dữ liệu nền để tiếp tục luyện sâu hơn.'], 4),
    improvements: mergeUniqueTexts(improvements, ['Hãy luyện thêm một lượt ngắn và nghe lại để chốt đúng điểm cần sửa.'], 5),
    coachNotes: mergeUniqueTexts(
      coachNotes,
      ['Luyện với đồng hồ 60-90 giây để giữ câu trả lời ngắn gọn và có trọng tâm.'],
      5
    ),
    followUpQuestions: buildSmartContextualFollowUpQuestions({
      practiceType: input.practiceType,
      topic: input.topic,
      transcript: input.transcript,
      speechRateWpm: input.speechRateWpm,
      clarityScore: input.clarityScore,
      pauseScore: input.pauseScore,
      targetRole: input.targetRole
    })
  };
};

const buildPracticePromptContextV2 = (input: {
  practiceType: 'presentation' | 'interview';
  difficulty?: 'easy' | 'medium' | 'hard';
  topic: string;
  transcript: string;
  speechRateWpm: number;
  volumeStability: number;
  clarityScore: number;
  pauseScore: number;
  confidenceScore: number;
  fillerWordCount: number;
  repeatCount: number;
  targetRole?: string;
  profileSummary?: string;
}) => {
  const signals = buildPracticeContentSignalsV2(input.transcript, input.topic, input.practiceType, input.targetRole ?? '');

  return [
    `Loại luyện tập: ${input.practiceType === 'presentation' ? 'Thuyết trình' : 'Phỏng vấn'}`,
    `Độ khó: ${input.difficulty ?? 'medium'}`,
    `Chủ đề: ${signals.shortTopicLabel}`,
    `Vai trò mục tiêu: ${normalizeText(input.targetRole) || 'Chưa cập nhật'}`,
    `Bối cảnh hồ sơ: ${normalizeText(input.profileSummary) || 'Chưa cập nhật'}`,
    `Transcript đầy đủ:\n${signals.cleanedTranscript}`,
    `Các ý nổi bật trong transcript: ${signals.transcriptKeywords.join(', ') || 'Chưa rõ'}`,
    `Mức bám chủ đề: ${Math.round(signals.topicCoverage * 100)}%`,
    `Mức bám vai trò: ${Math.round(signals.roleCoverage * 100)}%`,
    `Câu neo nội dung: ${signals.anchorSentence || 'Chưa rõ'}`,
    `Câu có ví dụ hoặc kết quả: ${signals.evidenceSentence || 'Chưa có ví dụ cụ thể'}`,
    `Tốc độ nói (WPM): ${input.speechRateWpm}`,
    `Độ ổn định âm lượng: ${input.volumeStability}`,
    `Độ rõ phát âm: ${input.clarityScore}`,
    `Điểm khoảng dừng: ${input.pauseScore}`,
    `Điểm tự tin: ${input.confidenceScore}`,
    `Số từ đệm: ${input.fillerWordCount}`,
    `Số lần lặp ý: ${input.repeatCount}`,
    'Yêu cầu bắt buộc:',
    '- Summary phải nêu đúng người nói đang làm tốt hay chưa tốt ở ý nào trong transcript.',
    '- Strengths và improvements phải bám vào nội dung thực sự đã nói, không được viết nhận xét chung chung.',
    '- Coach notes phải chỉ ra bước sửa cụ thể cho lượt nói tiếp theo.',
    '- Follow-up questions phải nối tiếp đúng chủ đề, đúng transcript và không lạc sang ý không có trong bài nói.'
  ].join('\n');
};

const buildPracticePromptContext = (input: {
  practiceType: 'presentation' | 'interview';
  difficulty?: 'easy' | 'medium' | 'hard';
  topic: string;
  transcript: string;
  speechRateWpm: number;
  volumeStability: number;
  clarityScore: number;
  pauseScore: number;
  confidenceScore: number;
  fillerWordCount: number;
  repeatCount: number;
  targetRole?: string;
  profileSummary?: string;
}) => {
  const signals = buildPracticeContentSignalsV2(input.transcript, input.topic, input.practiceType, input.targetRole ?? '');

  return [
    `Loại luyện tập: ${input.practiceType === 'presentation' ? 'Thuyết trình' : 'Phỏng vấn'}`,
    `Độ khó: ${input.difficulty ?? 'medium'}`,
    `Chủ đề: ${signals.shortTopicLabel}`,
    `Vai trò mục tiêu: ${normalizeText(input.targetRole) || 'Chưa cập nhật'}`,
    `Bối cảnh hồ sơ: ${normalizeText(input.profileSummary) || 'Chưa cập nhật'}`,
    `Transcript đầy đủ:\n${signals.cleanedTranscript}`,
    `Các ý nổi bật trong transcript: ${signals.transcriptKeywords.join(', ') || 'Chưa rõ'}`,
    `Mức bám chủ đề: ${Math.round(signals.topicCoverage * 100)}%`,
    `Câu neo nội dung: ${signals.anchorSentence || 'Chưa rõ'}`,
    `Câu có ví dụ hoặc kết quả: ${signals.evidenceSentence || 'Chưa có ví dụ cụ thể'}`,
    `Tốc độ nói (WPM): ${input.speechRateWpm}`,
    `Độ ổn định âm lượng: ${input.volumeStability}`,
    `Độ rõ phát âm: ${input.clarityScore}`,
    `Điểm khoảng dừng: ${input.pauseScore}`,
    `Điểm tự tin: ${input.confidenceScore}`,
    `Số từ đệm: ${input.fillerWordCount}`,
    `Số lần lặp ý: ${input.repeatCount}`,
    'Yêu cầu bắt buộc:',
    '- Summary phải nêu đúng người nói đang làm tốt hay chưa tốt ở ý nào trong transcript.',
    '- Strengths và improvements phải bám vào nội dung thực sự đã nói, không viết nhận xét chung chung.',
    '- Coach notes phải chỉ ra bước sửa cụ thể cho lượt nói tiếp theo.',
    '- Follow-up questions phải nối tiếp đúng chủ đề, đúng transcript và không được lạc sang ý không có trong bài nói.'
  ].join('\n');
};

const normalizePracticeFeedbackOutput = (
  raw: unknown,
  fallback: PracticeAnalysisResult,
  context: {
    practiceType: 'presentation' | 'interview';
    topic: string;
    transcript: string;
    speechRateWpm: number;
    clarityScore: number;
    pauseScore: number;
    targetRole?: string;
  }
) => {
  const parsed = (raw ?? {}) as Partial<z.infer<typeof practiceFeedbackSchema>>;

  return {
    summary: isUsableText(parsed.summary) ? normalizeText(parsed.summary) : fallback.summary,
    strengths: mergeUniqueTexts(
      Array.isArray(parsed.strengths) ? parsed.strengths.map((item) => normalizeText(item)) : [],
      fallback.strengths,
      5
    ),
    improvements: mergeUniqueTexts(
      Array.isArray(parsed.improvements) ? parsed.improvements.map((item) => normalizeText(item)) : [],
      fallback.improvements,
      6
    ),
    coachNotes: mergeUniqueTexts(
      Array.isArray(parsed.coachNotes) ? parsed.coachNotes.map((item) => normalizeText(item)) : [],
      fallback.coachNotes,
      6
    ),
    followUpQuestions: mergeUniqueTexts(
      Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions.map((item) => normalizeText(item)) : [],
      buildSmartContextualFollowUpQuestions(context),
      4
    )
  };
};

export const analyzePractice = async (input: {
  practiceType: 'presentation' | 'interview';
  difficulty?: 'easy' | 'medium' | 'hard';
  transcript?: string;
  durationSeconds: number;
  volumeSamples: VolumePoint[];
  topic: string;
  audioFile?: UploadFile;
  targetRole?: string;
  profileSummary?: string;
}) => {
  const manualTranscript = normalizeText(input.transcript);
  const transcription = manualTranscript
    ? { transcript: manualTranscript, warningMessage: '' }
    : await transcribeAudioSafely(input.audioFile);
  const transcript = transcription.transcript;
  const hasTranscript = Boolean(transcript);

  const metrics = hasTranscript
    ? buildMetricScores(transcript, input.durationSeconds, input.volumeSamples, {
        practiceType: input.practiceType,
        topic: input.topic,
        targetRole: input.targetRole
      })
    : buildAudioFallbackMetrics(input.durationSeconds, input.volumeSamples);

  const fallback = buildSmartFallbackPracticeFeedbackV2({
    practiceType: input.practiceType,
    topic: input.topic,
    transcript: metrics.transcript,
    speechRateWpm: metrics.speechRateWpm,
    volumeStability: metrics.volumeStability,
    clarityScore: metrics.clarityScore,
    pauseScore: metrics.pauseScore,
    confidenceScore: metrics.confidenceScore,
    fillerWordCount: metrics.fillerWordCount,
    repeatCount: metrics.repeatCount,
    transcriptAvailable: hasTranscript,
    warningMessage: transcription.warningMessage,
    targetRole: input.targetRole
  });

  if (!openai || !hasTranscript) {
    return {
      ...metrics,
      ...fallback,
      totalScore: metrics.totalScore,
      speedTimeline: metrics.speedTimeline,
      heatmap: metrics.heatmap,
      warningMessage: transcription.warningMessage
    };
  }

  try {
    const response = await openai.responses.parse({
      model: env.openaiTextModel,
      input: [
        {
          role: 'system',
          content:
            'Bạn là AI coach giúp luyện thuyết trình và phỏng vấn bằng tiếng Việt. Hãy nhận xét bám sát transcript và các chỉ số đã cho, không bịa nội dung chưa xuất hiện, không nói lan man, luôn đưa góp ý cụ thể và có thể áp dụng ngay.'
        },
        {
          role: 'user',
          content:
            `Loại luyện tập: ${input.practiceType === 'presentation' ? 'Thuyết trình' : 'Phỏng vấn'}\n` +
            `Chủ đề: ${normalizeText(input.topic) || 'Luyện tập SpeakAI'}\n` +
            `Transcript: ${metrics.transcript}\n` +
            `Tốc độ nói (WPM): ${metrics.speechRateWpm}\n` +
            `Độ ổn định âm lượng: ${metrics.volumeStability}\n` +
            `Độ rõ phát âm: ${metrics.clarityScore}\n` +
            `Điểm khoảng dừng: ${metrics.pauseScore}\n` +
            `Điểm tự tin: ${metrics.confidenceScore}\n` +
            `Số từ đệm: ${metrics.fillerWordCount}\n` +
            `Số lần lặp ý: ${metrics.repeatCount}\n` +
            'Yêu cầu đặc biệt: phần follow-up phải bám sát đúng chủ đề, đúng nội dung transcript và gợi ý câu hỏi vòng sau thật liên quan.'
        },
        {
          role: 'user',
          content: buildPracticePromptContextV2({
            practiceType: input.practiceType,
            difficulty: input.difficulty,
            topic: input.topic,
            transcript: metrics.transcript,
            speechRateWpm: metrics.speechRateWpm,
            volumeStability: metrics.volumeStability,
            clarityScore: metrics.clarityScore,
            pauseScore: metrics.pauseScore,
            confidenceScore: metrics.confidenceScore,
            fillerWordCount: metrics.fillerWordCount,
            repeatCount: metrics.repeatCount,
            targetRole: input.targetRole,
            profileSummary: input.profileSummary
          })
        }
      ],
      text: {
        format: zodTextFormat(practiceFeedbackSchema, 'practice_feedback')
      }
    });

    const normalizedFeedback = normalizePracticeFeedbackOutput(response.output_parsed, fallback, {
      practiceType: input.practiceType,
      topic: input.topic,
      transcript: metrics.transcript,
      speechRateWpm: metrics.speechRateWpm,
      clarityScore: metrics.clarityScore,
      pauseScore: metrics.pauseScore,
      targetRole: input.targetRole
    });

    return {
      ...metrics,
      ...normalizedFeedback,
      totalScore: metrics.totalScore,
      speedTimeline: metrics.speedTimeline,
      heatmap: metrics.heatmap,
      warningMessage: transcription.warningMessage
    };
  } catch (error) {
    return {
      ...metrics,
      ...fallback,
      totalScore: metrics.totalScore,
      speedTimeline: metrics.speedTimeline,
      heatmap: metrics.heatmap,
      warningMessage: transcription.warningMessage || normalizeProviderError(error, 'analysis')
    };
  }
};

type RealtimePracticeInput = {
  practiceType: 'presentation' | 'interview';
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  targetRole?: string;
  profileSummary?: string;
  userName?: string;
};

const realtimeDifficultyGuide = {
  easy: 'Ưu tiên các câu hỏi dễ mở lời để người dùng vào nhịp tự tin trước.',
  medium: 'Giữ nhịp như một buổi phỏng vấn hoặc phản biện thực tế, có truy vấn nhưng vẫn vừa sức.',
  hard: 'Truy vấn sâu hơn, phản biện rõ hơn và yêu cầu ví dụ hoặc số liệu cụ thể khi cần.'
} as const;

const buildRealtimePracticeInstructions = (input: RealtimePracticeInput) => {
  const practiceLabel = input.practiceType === 'presentation' ? 'thuyết trình' : 'phỏng vấn';
  const targetRole = normalizeText(input.targetRole) || 'chưa xác định';
  const profileSummary = normalizeText(input.profileSummary) || 'chưa có mô tả hồ sơ';
  const userName = normalizeText(input.userName) || 'học viên SpeakAI';

  return [
    'Bạn là SpeakAI Live Coach, một huấn luyện viên hội thoại bằng giọng nói hoàn toàn bằng tiếng Việt có dấu.',
    `Người dùng hiện tại: ${userName}.`,
    `Chế độ luyện: ${practiceLabel}.`,
    `Chủ đề chính: ${normalizeText(input.topic) || 'Luyện tập SpeakAI'}.`,
    `Vai trò mục tiêu: ${targetRole}.`,
    `Bối cảnh hồ sơ: ${profileSummary}.`,
    `Mức độ mong muốn: ${input.difficulty}. ${realtimeDifficultyGuide[input.difficulty]}`,
    'Quy tắc bắt buộc:',
    '- Luôn nói tự nhiên, ngắn gọn, rõ ý, không lan man.',
    '- Mỗi lượt trả lời chỉ nên dài khoảng 1 đến 3 câu.',
    '- Bám theo câu trả lời gần nhất của người dùng để hỏi tiếp hoặc phản biện.',
    '- Nếu người dùng trả lời chung chung, hãy yêu cầu ví dụ cụ thể hoặc số liệu minh họa.',
    '- Nếu đang ở chế độ thuyết trình, hãy đóng vai người nghe phản biện và góp ý độ thuyết phục.',
    '- Nếu đang ở chế độ phỏng vấn, hãy đóng vai nhà tuyển dụng chuyên nghiệp, sắc sảo nhưng lịch sự.',
    '- Khi người dùng nói các từ như dừng, kết thúc, tổng kết, hãy đưa ra phần chốt ngắn gồm: điểm tốt, điểm cần sửa, bước tiếp theo.',
    '- Tuyệt đối không chuyển sang tiếng Anh nếu người dùng không yêu cầu.'
  ].join('\n');
};

const normalizeRealtimeProviderError = (raw: string) => {
  const normalized = raw.toLowerCase();

  if (normalized.includes('insufficient_quota') || normalized.includes('you exceeded your current quota')) {
    return 'Tài khoản OpenAI API hiện đã hết quota hoặc chưa bật thanh toán. Hãy kiểm tra Billing rồi thử lại.';
  }

  if (normalized.includes('invalid_api_key') || normalized.includes('incorrect api key provided')) {
    return 'OPENAI_API_KEY hiện không hợp lệ hoặc đã bị thu hồi. Hãy tạo API key mới rồi cập nhật lại.';
  }

  if (normalized.includes('country, region, or territory not supported')) {
    return 'OpenAI API hiện chưa hỗ trợ khu vực mạng hiện tại nên phòng thoại chưa thể mở từ kết nối này.';
  }

  if (normalized.includes('rate limit')) {
    return 'OpenAI API đang chạm giới hạn tốc độ. Hãy đợi một chút rồi thử mở lại phòng thoại.';
  }

  return raw;
};

export const createRealtimePracticeSession = async (input: RealtimePracticeInput) => {
  if (!env.openaiApiKey) {
    throw new Error('Chưa cấu hình OPENAI_API_KEY nên chưa thể mở phòng hội thoại giọng nói.');
  }

  const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      expires_after: {
        anchor: 'created_at',
        seconds: 600
      },
      session: {
        type: 'realtime',
        model: env.openaiRealtimeModel,
        instructions: buildRealtimePracticeInstructions(input),
        output_modalities: ['audio'],
        audio: {
          input: {
            transcription: {
              model: env.openaiTranscribeModel
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.45,
              prefix_padding_ms: 300,
              silence_duration_ms: input.difficulty === 'hard' ? 420 : input.difficulty === 'easy' ? 720 : 560,
              idle_timeout_ms: 6000,
              create_response: true,
              interrupt_response: true
            }
          },
          output: {
            voice: env.openaiRealtimeVoice,
            speed: input.difficulty === 'hard' ? 1.03 : 1
          }
        }
      }
    })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | {
          error?: { message?: string };
          message?: string;
        }
      | null;
    const rawMessage =
      payload?.error?.message ||
      payload?.message ||
      `Không thể tạo phiên realtime (${response.status}).`;

    throw new Error(normalizeRealtimeProviderError(String(rawMessage)));
  }

  const payload = (await response.json()) as {
    value?: string;
    session?: {
      id?: string;
      model?: string;
      audio?: {
        output?: {
          voice?: string;
        };
      };
    };
  };

  if (!payload.value) {
    throw new Error('OpenAI không trả về client secret hợp lệ cho phiên realtime.');
  }

  return {
    clientSecret: payload.value,
    sessionId: payload.session?.id ?? '',
    model: payload.session?.model ?? env.openaiRealtimeModel,
    voice: payload.session?.audio?.output?.voice ?? env.openaiRealtimeVoice
  };
};

const fallbackQuestionBank = {
  easy: [
    'Hãy giới thiệu ngắn gọn về bản thân và mục tiêu nghề nghiệp hiện tại.',
    'Điểm mạnh nào giúp bạn phù hợp với vị trí này?',
    'Nếu được chọn một dự án để kể lại, bạn sẽ chọn dự án nào?'
  ],
  medium: [
    'Hãy kể về một tình huống bạn gặp áp lực và cách bạn vẫn giữ kết quả công việc ổn định.',
    'Nếu một thành viên trong nhóm không đạt tiến độ, bạn sẽ xử lý như thế nào?',
    'Vì sao nhà tuyển dụng nên ưu tiên bạn thay vì một ứng viên có kỹ năng tương tự?'
  ],
  hard: [
    'Nếu nhà tuyển dụng cho rằng kinh nghiệm của bạn chưa đủ sâu, bạn sẽ phản hồi như thế nào?',
    'Hãy bảo vệ một quyết định mà bạn từng đưa ra dù bị nhiều người phản đối.',
    'Nếu bị truy vấn về một thất bại lớn, bạn sẽ trình bày ra sao để vẫn tạo được niềm tin?'
  ]
};

const formatInterviewHistoryForPrompt = (history: Array<{ question: string; answer: string }>) => {
  if (!history.length) {
    return 'Chưa có lượt hỏi đáp nào trước đó.';
  }

  return history
    .slice(-5)
    .map(
      (item, index) =>
        `Lượt ${index + 1}\n- Câu hỏi: ${compactQuote(item.question, 220)}\n- Câu trả lời: ${compactQuote(item.answer, 320)}`
    )
    .join('\n');
};

const buildInterviewAnswerReplyV2 = (input: {
  targetRole: string;
  question: string;
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
}) => {
  const answerText = normalizeText(input.answer);
  const roleLabel = normalizeText(input.targetRole) || 'vai trò mục tiêu';

  if (!answerText) {
    return 'Mình sẽ bắt đầu bằng một câu nền để bạn vào nhịp trước, sau đó mới hỏi sâu dần theo đúng vai trò mục tiêu.';
  }

  const keywords = extractKeywords(`${input.question} ${answerText}`, 4);
  const mainAnchor = keywords[0] || 'ý chính bạn vừa nêu';
  const answerSignals = buildPracticeContentSignalsV2(answerText, input.question, 'interview', input.targetRole);
  const hasMetrics = /\d|%|triệu|tỷ|khách|người|doanh thu|tăng|giảm|kết quả/i.test(answerText);
  const answerLength = answerText.split(/\s+/).length;

  if (answerLength < 18) {
    return `Bạn đã chạm đúng vào "${mainAnchor}", nhưng câu trả lời còn khá ngắn so với ngữ cảnh ${roleLabel}. Ở lượt tiếp theo, hãy thêm bối cảnh, hành động và kết quả rõ hơn.`;
  }

  if (!answerSignals.hasOwnershipCue) {
    return `Câu trả lời đang đi đúng hướng ở "${mainAnchor}", nhưng vẫn chưa cho thấy rõ bạn trực tiếp làm gì trong bối cảnh ${roleLabel}. Mình sẽ hỏi sâu hơn để làm rõ trách nhiệm cá nhân.`;
  }

  if (!hasMetrics && input.difficulty !== 'easy') {
    return `Câu trả lời đã có khung cho "${mainAnchor}", nhưng vẫn thiếu số liệu hoặc kết quả đủ mạnh cho vai trò ${roleLabel}. Mình sẽ truy tiếp vào phần tác động thực tế.`;
  }

  if (input.difficulty !== 'easy' && !answerSignals.hasProblemCue) {
    return `Bạn đã trả lời khá đúng trọng tâm ở "${mainAnchor}", nhưng câu chuyện vẫn thiếu phần khó khăn hoặc áp lực thực tế. Mình sẽ hỏi tiếp để kiểm tra chiều sâu xử lý vấn đề.`;
  }

  if (input.difficulty === 'hard' && !answerSignals.hasReflectionCue) {
    return `Phần trả lời về "${mainAnchor}" đã có chất liệu tốt, nhưng vẫn thiếu bài học rút ra hoặc thay đổi sau trải nghiệm đó. Mình sẽ hỏi tiếp để xem chiều sâu phản tư của bạn.`;
  }

  return `Bạn đang trả lời khá đúng trọng tâm ở ý "${mainAnchor}". Mình sẽ nối tiếp bằng một câu hỏi sâu hơn để kiểm tra cách bạn giải thích hành động và tác động thực tế.`;
};

const buildFallbackInterviewQuestionV2 = (input: {
  difficulty: 'easy' | 'medium' | 'hard';
  targetRole: string;
  history: Array<{ question: string; answer: string }>;
}) => {
  const bank = fallbackQuestionBank[input.difficulty];
  const lastAnswer = normalizeText(input.history[input.history.length - 1]?.answer);
  const lastQuestion = normalizeText(input.history[input.history.length - 1]?.question);
  const keywords = extractKeywords(lastAnswer, 3);
  const roleLabel = normalizeText(input.targetRole) || 'vai trò mục tiêu';
  const answerSignals = lastAnswer ? buildPracticeContentSignalsV2(lastAnswer, lastQuestion || input.targetRole, 'interview', input.targetRole) : null;

  const question =
    !lastAnswer
      ? bank[input.history.length % bank.length]
      : answerSignals && !answerSignals.hasOwnershipCue
        ? 'Trong tình huống bạn vừa nêu, bạn trực tiếp chịu trách nhiệm phần nào và đã tự mình quyết định điều gì?'
        : answerSignals && !answerSignals.hasOutcomeCue
          ? 'Kết quả cụ thể của hành động đó là gì, và bạn đo nó bằng chỉ số hay phản hồi nào?'
          : answerSignals && input.difficulty !== 'easy' && !answerSignals.hasProblemCue
            ? 'Khó khăn hoặc áp lực lớn nhất trong tình huống đó là gì, và bạn xử lý nó ra sao?'
            : answerSignals && input.difficulty === 'hard' && !answerSignals.hasReflectionCue
              ? 'Sau trải nghiệm đó, bài học lớn nhất bạn rút ra là gì và lần sau bạn sẽ làm khác điều gì?'
              : keywords[0]
                ? `Bạn có thể nói sâu hơn về "${keywords[0]}" và tác động cụ thể của bạn trong bối cảnh ${roleLabel} không?`
                : bank[input.history.length % bank.length];

  return {
    reply: buildInterviewAnswerReplyV2({
      targetRole: input.targetRole,
      question: input.history[input.history.length - 1]?.question ?? '',
      answer: lastAnswer,
      difficulty: input.difficulty
    }),
    question,
    reason: `Câu hỏi này giúp bạn luyện cách trả lời chắc hơn cho ${roleLabel} và tránh nói quá chung chung.`,
    challenge:
      input.history.length > 0
        ? 'Nếu câu trả lời chưa đủ thuyết phục, hãy thêm 1 ví dụ thực tế và 1 kết quả đo được.'
        : 'Trả lời trong 60-90 giây với bố cục: mở đầu, hành động chính, kết quả.',
    suggestedFocus: ['Ví dụ cụ thể', 'Kết quả đo được', 'Giọng nói tự tin']
  };
};

const buildInterviewAnswerReply = (input: {
  targetRole: string;
  question: string;
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
}) => {
  const answerText = normalizeText(input.answer);
  const roleLabel = normalizeText(input.targetRole) || 'vai trò mục tiêu';

  if (!answerText) {
    return 'Mình sẽ mở đầu bằng một câu nền để bạn vào nhịp trước, sau đó sẽ hỏi sâu dần theo vai trò mục tiêu.';
  }

  const keywords = extractKeywords(`${input.question} ${answerText}`, 4);
  const mainAnchor = keywords[0] || 'ý chính bạn vừa nêu';
  const answerSignals = buildPracticeContentSignalsV2(answerText, input.question, 'interview', input.targetRole);
  const hasMetrics = /\d|%|triệu|tỷ|khách|người|doanh thu|tăng|giảm|kết quả/i.test(answerText);
  const answerLength = answerText.split(/\s+/).length;

  if (answerLength < 18) {
    return `Bạn đã chạm đúng vào "${mainAnchor}", nhưng câu trả lời còn khá ngắn cho bối cảnh ${roleLabel}. Ở lượt tiếp theo, hãy thêm hành động cụ thể và kết quả rõ hơn.`;
  }

  if (!answerSignals.hasOwnershipCue) {
    return `Câu trả lời đang có hướng đúng ở "${mainAnchor}", nhưng vẫn chưa cho thấy rõ bạn trực tiếp làm gì trong bối cảnh ${roleLabel}. Mình sẽ hỏi sâu hơn để làm rõ phần trách nhiệm cá nhân.`;
  }

  if (!hasMetrics && input.difficulty !== 'easy') {
    return `Câu trả lời đã có hướng đi cho "${mainAnchor}", nhưng vẫn thiếu số liệu hoặc kết quả để đủ sức nặng cho ${roleLabel}. Mình sẽ hỏi sâu hơn để bạn làm rõ phần này.`;
  }

  if (input.difficulty !== 'easy' && !answerSignals.hasProblemCue) {
    return `Bạn đã trả lời khá đúng trọng tâm ở "${mainAnchor}", nhưng câu chuyện vẫn thiếu bối cảnh khó khăn hoặc áp lực thực tế. Mình sẽ truy tiếp vào phần này để câu trả lời có chiều sâu hơn.`;
  }

  if (input.difficulty === 'hard' && !answerSignals.hasReflectionCue) {
    return `Phần trả lời về "${mainAnchor}" đã có chất liệu tốt, nhưng vẫn thiếu bài học rút ra hoặc thay đổi sau trải nghiệm đó. Mình sẽ hỏi tiếp để kiểm tra chiều sâu phản tư của bạn.`;
  }

  return `Bạn đang trả lời khá đúng trọng tâm ở ý "${mainAnchor}". Mình sẽ nối tiếp bằng một câu hỏi sâu hơn để kiểm tra cách bạn giải thích hành động và tác động thực tế.`;
};

const buildFallbackInterviewQuestion = (input: {
  difficulty: 'easy' | 'medium' | 'hard';
  targetRole: string;
  history: Array<{ question: string; answer: string }>;
}) => {
  const bank = fallbackQuestionBank[input.difficulty];
  const lastAnswer = normalizeText(input.history[input.history.length - 1]?.answer);
  const lastQuestion = normalizeText(input.history[input.history.length - 1]?.question);
  const keywords = extractKeywords(lastAnswer, 3);
  const roleLabel = normalizeText(input.targetRole) || 'vai trò mục tiêu';
  const answerSignals = lastAnswer ? buildPracticeContentSignalsV2(lastAnswer, lastQuestion || input.targetRole, 'interview', input.targetRole) : null;

  const question =
    !lastAnswer
      ? bank[input.history.length % bank.length]
      : answerSignals && !answerSignals.hasOwnershipCue
        ? `Trong tình huống bạn vừa nêu, bạn trực tiếp chịu trách nhiệm phần nào và đã tự mình quyết định điều gì?`
        : answerSignals && !answerSignals.hasOutcomeCue
          ? `Kết quả cụ thể của hành động đó là gì, và bạn đo nó bằng chỉ số hay phản hồi nào?`
          : answerSignals && input.difficulty !== 'easy' && !answerSignals.hasProblemCue
            ? `Khó khăn hoặc áp lực lớn nhất trong tình huống đó là gì, và bạn xử lý nó ra sao?`
            : answerSignals && input.difficulty === 'hard' && !answerSignals.hasReflectionCue
              ? `Sau trải nghiệm đó, bài học lớn nhất bạn rút ra là gì và lần sau bạn sẽ làm khác điều gì?`
              : keywords[0]
                ? `Bạn có thể nói sâu hơn về "${keywords[0]}" và tác động cụ thể của bạn trong bối cảnh ${roleLabel} không?`
                : bank[input.history.length % bank.length];

  return {
    reply: buildInterviewAnswerReply({
      targetRole: input.targetRole,
      question: input.history[input.history.length - 1]?.question ?? '',
      answer: lastAnswer,
      difficulty: input.difficulty
    }),
    question,
    reason: `Câu hỏi này giúp bạn luyện cách trả lời chắc hơn cho ${roleLabel} và tránh trả lời quá chung chung.`,
    challenge:
      input.history.length > 0
        ? 'Nếu câu trả lời chưa đủ thuyết phục, hãy thêm 1 ví dụ thực tế và 1 kết quả đo được.'
        : 'Trả lời trong 60-90 giây với bố cục: mở đầu, hành động chính, kết quả.',
    suggestedFocus: ['Ví dụ cụ thể', 'Kết quả đo được', 'Giọng nói tự tin']
  };
};

export const generateInterviewQuestion = async (input: {
  difficulty: 'easy' | 'medium' | 'hard';
  targetRole: string;
  history: Array<{ question: string; answer: string }>;
  cvSummary?: string;
}) => {
  const fallback = buildFallbackInterviewQuestionV2(input);

  if (!openai) {
    return fallback;
  }

  try {
    const response = await openai.responses.parse({
      model: env.openaiTextModel,
      input: [
        {
          role: 'system',
          content:
            'Bạn là nhà phỏng vấn AI bằng tiếng Việt. Hãy đặt câu hỏi tiếp theo thật bám sát lịch sử hỏi đáp, bám vai trò mục tiêu và luôn ưu tiên câu hỏi có chiều sâu, thực tế, có thể truy vấn hoặc phản biện khi cần.'
        },
        {
          role: 'user',
          content:
            `Vị trí mục tiêu: ${normalizeText(input.targetRole) || 'Chưa cung cấp'}\n` +
            `Mức độ: ${input.difficulty}\n` +
            `Tóm tắt CV: ${normalizeText(input.cvSummary) || 'Chưa cung cấp'}\n` +
            'Yêu cầu bắt buộc:\n' +
            '- Trường reply phải phản hồi trực tiếp cho câu trả lời gần nhất của ứng viên trong 1-2 câu, bằng tiếng Việt tự nhiên.\n' +
            '- Trường question phải là câu hỏi kế tiếp thật sự nối tiếp nội dung vừa trả lời, không được hỏi sang chủ đề lạ.\n' +
            '- Nếu ứng viên trả lời còn chung chung, hãy truy vấn sâu vào hành động, quyết định và kết quả đo được.\n' +
            '- Nếu chưa có lịch sử, reply có thể là câu dẫn ngắn để bắt đầu buổi luyện.\n' +
            `Lịch sử hỏi đáp gần đây:\n${formatInterviewHistoryForPrompt(input.history)}`
        }
      ],
      text: {
        format: zodTextFormat(nextQuestionSchema, 'next_question')
      }
    });

    const parsed = (response.output_parsed ?? {}) as Partial<z.infer<typeof nextQuestionSchema>>;

    return {
      reply: isUsableText(parsed.reply) ? normalizeText(parsed.reply) : fallback.reply,
      question: isUsableText(parsed.question) ? normalizeText(parsed.question) : fallback.question,
      reason: isUsableText(parsed.reason) ? normalizeText(parsed.reason) : fallback.reason,
      challenge: isUsableText(parsed.challenge) ? normalizeText(parsed.challenge) : fallback.challenge,
      suggestedFocus: mergeUniqueTexts(
        Array.isArray(parsed.suggestedFocus) ? parsed.suggestedFocus.map((item) => normalizeText(item)) : [],
        fallback.suggestedFocus,
        4
      )
    };
  } catch {
    return fallback;
  }
};
