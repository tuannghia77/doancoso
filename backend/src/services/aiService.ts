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

const uniqueWords = (text: string) =>
  Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((word) => word.length >= 3)
    )
  );

const extractKeywords = (text: string, limit = 6) => uniqueWords(text).slice(0, limit);

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

  return {
    keywords,
    sections,
    quantifiedBulletCount,
    projectLine: projectLine || 'một dự án gần đây'
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

const buildFallbackCvAnalysis = (resumeText: string, targetRole: string): CvAnalysisResult => {
  const mainRole = inferTargetRoleFromResume(resumeText, targetRole);
  const signals = extractResumeSignals(resumeText);
  const skillAnchor = signals.keywords.slice(0, 3).join(', ') || 'kỹ năng và kinh nghiệm hiện có';
  const projectAnchor = signals.projectLine;

  const strengths = [
    `CV đã định hình khá rõ hướng đi cho vai trò ${mainRole}.`,
    signals.sections.projects
      ? 'Hồ sơ đã có dấu hiệu đề cập đến dự án hoặc công việc thực tế để khai thác khi phỏng vấn.'
      : 'Nội dung hiện tại đủ để SpeakAI xây dựng bộ câu hỏi luyện tập nền tảng.',
    signals.sections.skills
      ? `CV đã xuất hiện một số cụm năng lực đáng chú ý như ${skillAnchor}.`
      : 'CV đã có khung thông tin cơ bản để tiếp tục tinh chỉnh theo vai trò mục tiêu.'
  ];

  if (signals.quantifiedBulletCount > 0) {
    strengths.push('Hồ sơ đã có ít nhất một vài tín hiệu về kết quả hoặc tác động có thể khai thác sâu hơn.');
  }

  const improvements = [
    signals.quantifiedBulletCount > 0
      ? 'Cần đẩy mạnh hơn phần kết quả đo được ở từng kinh nghiệm, thay vì chỉ xuất hiện rải rác.'
      : 'Hồ sơ đang thiếu các kết quả định lượng rõ ràng như doanh thu, tăng trưởng, hiệu suất hoặc quy mô công việc.',
    signals.sections.projects
      ? 'Nên viết rõ hơn vai trò cá nhân, bối cảnh, hành động và kết quả của từng dự án nổi bật.'
      : 'Nên bổ sung thêm 1-2 dự án hoặc trải nghiệm thực tế để nhà tuyển dụng dễ đánh giá năng lực hơn.',
    `Hãy chỉnh CV bám chặt vào vai trò ${mainRole} thay vì để nội dung dàn trải hoặc thiên về thông tin cá nhân.`,
    'Ưu tiên các gạch đầu dòng ngắn, mạnh và đi thẳng vào đóng góp cụ thể.'
  ];

  return {
    summary:
      signals.quantifiedBulletCount > 0
        ? `CV cho thấy bạn đang hướng tới ${mainRole} và đã có nền thông tin tương đối rõ về kỹ năng hoặc trải nghiệm liên quan. Điểm cần làm tốt hơn là biến các kinh nghiệm đó thành câu chuyện có vai trò, hành động và kết quả đo được để tăng sức nặng khi ứng tuyển.`
        : `CV hiện tại đã cho thấy định hướng về ${mainRole}, nhưng phần kinh nghiệm vẫn còn thiên về mô tả chung. Hồ sơ sẽ thuyết phục hơn nhiều nếu bạn bổ sung dự án, trách nhiệm cá nhân và kết quả cụ thể cho từng trải nghiệm.`,
    strengths,
    improvements,
    interviewQuestions: [
      {
        question: `Hãy giới thiệu ngắn gọn về bản thân trong vai trò ${mainRole}.`,
        purpose: 'Kiểm tra cách bạn mở đầu và định vị bản thân trước nhà tuyển dụng.'
      },
      {
        question: `Trong phần "${projectAnchor}", bạn đã trực tiếp chịu trách nhiệm phần nào và tạo ra kết quả gì?`,
        purpose: 'Đánh giá khả năng kể dự án bằng ngữ cảnh, hành động và kết quả.'
      },
      {
        question: 'Một khó khăn thực tế bạn từng gặp là gì và bạn đã xử lý ra sao?',
        purpose: 'Kiểm tra tư duy giải quyết vấn đề và khả năng phản xạ khi bị truy vấn sâu hơn.'
      },
      {
        question: 'Kỹ năng nào trong CV hiện tại bạn muốn cải thiện nhất trong 3 tháng tới?',
        purpose: 'Đo mức tự nhận thức và tinh thần học hỏi liên tục.'
      },
      {
        question: `Nếu vào vai trò ${mainRole}, 90 ngày đầu bạn sẽ ưu tiên điều gì trước?`,
        purpose: 'Đánh giá khả năng lập kế hoạch và hiểu công việc mục tiêu.'
      }
    ],
    practicePlan: [
      'Luyện phần giới thiệu bản thân trong 60-90 giây và thu âm lại để kiểm tra độ rõ, nhịp nói và độ tự tin.',
      `Chọn nội dung gần với "${projectAnchor}" rồi trả lời theo cấu trúc bối cảnh - hành động - kết quả.`,
      'Chuẩn bị trước 3 thành tích có số liệu cụ thể để dùng khi bị hỏi sâu về đóng góp cá nhân.',
      `Tập một phiên phản biện cho vai trò ${mainRole}: vì sao nhà tuyển dụng nên chọn bạn thay vì ứng viên khác.`
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

export const extractResumeText = async (file: UploadFile) => {
  if (file.mimetype.includes('pdf') || file.originalname.toLowerCase().endsWith('.pdf')) {
    const parsed = await pdfParse(file.buffer);
    return normalizeText(parsed.text);
  }

  return file.buffer.toString('utf-8').trim();
};

export const analyzeCv = async (input: { resumeText: string; targetRole: string }) => {
  const fallback = buildFallbackCvAnalysis(input.resumeText, input.targetRole);

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

const buildMetricScores = (transcript: string, durationSeconds: number, volumeSamples: VolumePoint[]) => {
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
  const clarityScore = clamp(92 - fillerWordCount * 6 - repeatCount * 3 + Math.min(10, wordCount / 18));
  const pauseScore = clamp(88 - Math.abs(pauseCount - 6) * 6 - pauseSeconds * 3);
  const confidenceScore = clamp((volumeStability + clarityScore + pauseScore + (100 - pacePenalty)) / 4);
  const totalScore = clamp((volumeStability + clarityScore + pauseScore + confidenceScore + (100 - pacePenalty)) / 5);

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
    followUpQuestions: buildContextualFollowUpQuestions(context)
  };
};

export const analyzePractice = async (input: {
  practiceType: 'presentation' | 'interview';
  transcript?: string;
  durationSeconds: number;
  volumeSamples: VolumePoint[];
  topic: string;
  audioFile?: UploadFile;
}) => {
  const manualTranscript = normalizeText(input.transcript);
  const transcription = manualTranscript
    ? { transcript: manualTranscript, warningMessage: '' }
    : await transcribeAudioSafely(input.audioFile);
  const transcript = transcription.transcript;
  const hasTranscript = Boolean(transcript);

  const metrics = hasTranscript
    ? buildMetricScores(transcript, input.durationSeconds, input.volumeSamples)
    : buildAudioFallbackMetrics(input.durationSeconds, input.volumeSamples);

  const fallback = buildFallbackPracticeFeedback({
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
    warningMessage: transcription.warningMessage
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
      pauseScore: metrics.pauseScore
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

const buildFallbackInterviewQuestion = (input: {
  difficulty: 'easy' | 'medium' | 'hard';
  targetRole: string;
  history: Array<{ question: string; answer: string }>;
}) => {
  const bank = fallbackQuestionBank[input.difficulty];
  const lastAnswer = normalizeText(input.history[input.history.length - 1]?.answer);
  const keywords = extractKeywords(`${input.targetRole} ${lastAnswer}`, 3);
  const roleLabel = normalizeText(input.targetRole) || 'vai trò mục tiêu';

  const question =
    lastAnswer && keywords[0]
      ? `Bạn có thể nói sâu hơn về "${keywords[0]}" và tác động cụ thể của bạn trong bối cảnh ${roleLabel} không?`
      : bank[input.history.length % bank.length];

  return {
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
  const fallback = buildFallbackInterviewQuestion(input);

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
            `Lịch sử hỏi đáp: ${JSON.stringify(input.history).slice(0, 7000)}`
        }
      ],
      text: {
        format: zodTextFormat(nextQuestionSchema, 'next_question')
      }
    });

    const parsed = (response.output_parsed ?? {}) as Partial<z.infer<typeof nextQuestionSchema>>;

    return {
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
