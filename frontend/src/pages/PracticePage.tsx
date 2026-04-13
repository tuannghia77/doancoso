import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  Headphones,
  MessageSquareQuote,
  Mic2,
  Save,
  ShieldCheck,
  Sparkles,
  WandSparkles
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { AudioRecorder, type RecorderPayload } from '../components/AudioRecorder';
import { RealtimePracticeRoom } from '../components/RealtimePracticeRoom';
import { StatCard } from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { InterviewQuestionResult, PracticeAnalysis } from '../types';

const emptyCapture: RecorderPayload = {
  audioBlob: null,
  audioUrl: '',
  durationSeconds: 0,
  volumeSamples: []
};

type AnalysisOutcome = {
  passed: boolean;
  label: string;
  passThreshold: number;
};

const presentationPresets = ['Giới thiệu bản thân', 'Trình bày đồ án nổi bật', 'Thuyết trình ý tưởng sản phẩm', 'Pitch cá nhân 90 giây'];
const interviewPresets = ['Kể về dự án gần đây', 'Điểm mạnh lớn nhất', 'Một lần xử lý mâu thuẫn', 'Vì sao nên chọn bạn'];

const practiceRules = ['Thu âm hoặc dán transcript', 'AI phân tích và khóa kết quả', 'Chỉ phiên hợp lệ mới cộng thưởng'];

const voiceRoomTips = [
  'Đổi chủ đề ở khung thiết lập rồi mở lại phòng để AI bám theo kịch bản mới.',
  'Nói tự nhiên theo từng lượt ngắn, AI sẽ hỏi tiếp hoặc phản biện ngay sau đó.',
  'Sau phần hội thoại trực tiếp, bạn có thể thu âm lại để chấm điểm chi tiết và lưu phiên.'
];

const liveWorkflow = [
  { title: 'Mở phòng', description: 'Hệ thống tạo phiên thoại realtime và kết nối micro ngay trong trình duyệt.' },
  { title: 'Trò chuyện', description: 'SpeakAI phản hồi bằng giọng nói, bám theo chủ đề và độ khó đang chọn.' },
  { title: 'Phân tích sâu', description: 'Chuyển sang khu ghi âm để chấm điểm, lưu lịch sử và nhận thưởng.' }
];

const difficultyLabels = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó'
} as const;

const practiceLabels = {
  presentation: 'Thuyết trình',
  interview: 'Phỏng vấn'
} as const;

const mojibakePattern = /Ã|Â|Ä|á»|Æ|â€¦|â€”|â€|Ă/;

const looksCorrupted = (value?: string) => Boolean(value && mojibakePattern.test(value));

const normalizeHeatmapNote = (score: number) => {
  if (score >= 78) return 'Đoạn tốt, có thể giữ nhịp này.';
  if (score >= 58) return 'Đoạn ổn, nên nhấn ý rõ hơn một chút.';
  return 'Đoạn cần xem lại về nhịp nói hoặc lực giọng.';
};

const buildReadableFallbackAnalysis = (
  analysis: PracticeAnalysis,
  practiceType: 'presentation' | 'interview',
  topic: string
): PracticeAnalysis => {
  const topicLabel = topic.trim() || (practiceType === 'presentation' ? 'phần trình bày hiện tại' : 'câu trả lời hiện tại');
  const strengths: string[] = [];
  const improvements: string[] = [];
  const coachNotes: string[] = [];

  if (analysis.speechRateWpm >= 110 && analysis.speechRateWpm <= 155) {
    strengths.push('Tốc độ nói đang ở mức dễ nghe và dễ theo dõi.');
  } else if (analysis.speechRateWpm > 155) {
    improvements.push('Tốc độ nói đang khá nhanh, nên chèn thêm điểm dừng sau mỗi ý chính.');
    coachNotes.push(`Với chủ đề "${topicLabel}", hãy chia nội dung thành 3 ý ngắn để giữ nhịp nói chậm và rõ hơn.`);
  } else {
    improvements.push('Tốc độ nói đang hơi chậm, nên vào thẳng ý chính sớm hơn.');
    coachNotes.push(`Khi nói lại về "${topicLabel}", hãy mở đầu bằng một câu chốt rồi đi ngay vào 2 ý minh họa chính.`);
  }

  if (analysis.volumeStability >= 68) {
    strengths.push('Âm lượng khá ổn định trong suốt phần trình bày.');
  } else {
    improvements.push('Âm lượng chưa đều, nên giữ khoảng cách micro ổn định hơn.');
    coachNotes.push('Thử luyện lại một lượt ngắn với cùng khoảng cách micro để lực giọng đều hơn.');
  }

  if (analysis.clarityScore >= 70) {
    strengths.push('Độ rõ phát âm khá tốt, câu nói đủ sáng để truyền ý chính.');
  } else {
    improvements.push('Cần nói dứt ý hơn để người nghe bắt nội dung nhanh hơn.');
    coachNotes.push('Hãy ưu tiên câu ngắn, chốt ý sớm và tránh kéo dài một ý quá lâu.');
  }

  if (analysis.pauseScore >= 65) {
    strengths.push('Khoảng dừng khá hợp lý, giúp chia nhịp bài nói tốt hơn.');
  } else {
    improvements.push('Khoảng dừng chưa tối ưu, nên dừng ngắn trước ý quan trọng thay vì ngắt giữa câu.');
    coachNotes.push('Ở lượt tiếp theo, hãy chủ động dừng nửa nhịp trước câu quan trọng để tạo điểm nhấn.');
  }

  if (!analysis.transcript.trim()) {
    strengths.unshift('SpeakAI vẫn đo được nhịp nói, âm lượng và khoảng dừng trực tiếp từ file ghi âm.');
    improvements.unshift('Chưa chép được transcript nên phần nhận xét hiện tại chưa đi sâu vào cách dùng từ và độ mạch lạc nội dung.');
    coachNotes.unshift('Hãy dán transcript hoặc thử phân tích lại khi mạng ổn định hơn để nhận góp ý đầy đủ hơn.');
  }

  if (analysis.confidenceScore < 60) {
    coachNotes.push('Hãy chuẩn bị trước 1 câu mở đầu và 1 câu chốt để giữ phong thái tự tin hơn.');
  }

  const followUpQuestions =
    practiceType === 'presentation'
      ? [
          `Nếu trình bày lại chủ đề "${topicLabel}", bạn sẽ mở đầu bằng câu nào để vào ý nhanh hơn?`,
          analysis.speechRateWpm > 155
            ? 'Bạn sẽ cắt bớt ý nào hoặc thêm điểm dừng nào để người nghe theo kịp?'
            : 'Bạn sẽ bổ sung ví dụ hoặc số liệu nào để bài nói thuyết phục hơn?',
          'Ý chính nào bạn muốn người nghe nhớ lâu nhất sau bài nói này?'
        ]
      : [
          `Nếu nhà tuyển dụng hỏi sâu hơn về "${topicLabel}", bạn sẽ trả lời bằng ví dụ cụ thể nào?`,
          analysis.speechRateWpm > 155
            ? 'Bạn sẽ rút gọn phần nào để câu trả lời ngắn gọn mà vẫn có trọng tâm?'
            : 'Bạn sẽ thêm thành tích hoặc kết quả đo đếm nào để câu trả lời thuyết phục hơn?',
          'Câu nào trong phần trả lời nên được nhấn mạnh lại để thể hiện rõ giá trị của bạn?'
        ];

  return {
    ...analysis,
    summary: !analysis.transcript.trim()
      ? 'SpeakAI chưa chép được transcript từ file ghi âm, nên kết quả hiện tại tập trung vào nhịp nói, âm lượng, khoảng dừng và độ ổn định tổng thể.'
      : practiceType === 'presentation'
        ? `Bài thuyết trình về "${topicLabel}" đã có khung cơ bản, nhưng vẫn cần tinh chỉnh nhịp nói và cách nhấn ý để thuyết phục hơn.`
        : `Câu trả lời phỏng vấn cho chủ đề "${topicLabel}" đã có nội dung cốt lõi, nhưng cần rõ ý và chắc nhịp hơn để tạo cảm giác tự tin.`,
    strengths: Array.from(new Set(strengths)).slice(0, 4),
    improvements: Array.from(new Set(improvements)).slice(0, 5),
    coachNotes: Array.from(new Set(coachNotes)).slice(0, 5),
    followUpQuestions,
    speedTimeline: analysis.speedTimeline.map((item, index) => ({
      ...item,
      label: `Đoạn ${index + 1}`
    })),
    heatmap: analysis.heatmap.map((item, index) => ({
      ...item,
      label: `Đoạn ${index + 1}`,
      note: normalizeHeatmapNote(item.score)
    }))
  };
};

export function PracticePage() {
  const { user, updateUser } = useAuth();
  const [practiceType, setPracticeType] = useState<'presentation' | 'interview'>('presentation');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [topic, setTopic] = useState('Giới thiệu dự án nổi bật của bạn');
  const [transcript, setTranscript] = useState('');
  const [capture, setCapture] = useState<RecorderPayload>(emptyCapture);
  const [analysis, setAnalysis] = useState<PracticeAnalysis | null>(null);
  const [analysisToken, setAnalysisToken] = useState('');
  const [analysisOutcome, setAnalysisOutcome] = useState<AnalysisOutcome | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [interviewQuestion, setInterviewQuestion] = useState<InterviewQuestionResult | null>(null);
  const [interviewHistory, setInterviewHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [answer, setAnswer] = useState('');
  const [questionLoading, setQuestionLoading] = useState(false);

  const practiceSummary = useMemo(
    () => [
      { label: 'Loại luyện', value: practiceLabels[practiceType] },
      { label: 'Độ khó', value: difficultyLabels[difficulty] },
      { label: 'Vai trò mục tiêu', value: user?.targetRole || 'Chưa cập nhật' }
    ],
    [difficulty, practiceType, user?.targetRole]
  );

  const topicPresets = practiceType === 'presentation' ? presentationPresets : interviewPresets;

  const displayAnalysis = useMemo(() => {
    if (!analysis) {
      return null;
    }

    const textSamples = [
      analysis.summary,
      ...analysis.strengths,
      ...analysis.improvements,
      ...analysis.coachNotes,
      ...analysis.followUpQuestions,
      ...analysis.speedTimeline.map((item) => item.label),
      ...analysis.heatmap.flatMap((item) => [item.label, item.note])
    ];

    const shouldSanitize = !analysis.transcript.trim() || textSamples.some((item) => looksCorrupted(item));

    if (shouldSanitize) {
      return buildReadableFallbackAnalysis(analysis, practiceType, topic);
    }

    return {
      ...analysis,
      speedTimeline: analysis.speedTimeline.map((item, index) => ({
        ...item,
        label: item.label?.trim() || `Đoạn ${index + 1}`
      })),
      heatmap: analysis.heatmap.map((item, index) => ({
        ...item,
        label: item.label?.trim() || `Đoạn ${index + 1}`,
        note: item.note?.trim() || normalizeHeatmapNote(item.score)
      }))
    };
  }, [analysis, practiceType, topic]);

  const invalidateAnalysis = () => {
    setAnalysis(null);
    setAnalysisToken('');
    setAnalysisOutcome(null);
    setMessage('');
  };

  const handlePracticeTypeChange = (value: 'presentation' | 'interview') => {
    setPracticeType(value);
    setInterviewQuestion(null);
    setInterviewHistory([]);
    setAnswer('');
    invalidateAnalysis();
  };

  const handleDifficultyChange = (value: 'easy' | 'medium' | 'hard') => {
    setDifficulty(value);
    invalidateAnalysis();
  };

  const handleTopicChange = (value: string) => {
    setTopic(value);
    invalidateAnalysis();
  };

  const handleTranscriptChange = (value: string) => {
    setTranscript(value);
    invalidateAnalysis();
  };

  const handleCaptureChange = (nextCapture: RecorderPayload) => {
    setCapture(nextCapture);
    invalidateAnalysis();
  };

  const handleAnalyze = async () => {
    setError('');
    setMessage('');

    if (!topic.trim()) {
      setError('Hãy nhập chủ đề bài luyện tập.');
      return;
    }

    if (!capture.audioBlob && !transcript.trim()) {
      setError('Bạn cần ghi âm hoặc dán transcript để AI có dữ liệu phân tích.');
      return;
    }

    setAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append('practiceType', practiceType);
      formData.append('difficulty', difficulty);
      formData.append('topic', topic);
      formData.append('transcript', transcript);
      formData.append('durationSeconds', String(Math.round(capture.durationSeconds)));
      formData.append('volumeSamples', JSON.stringify(capture.volumeSamples));
      if (capture.audioBlob) {
        formData.append('audio', capture.audioBlob, 'practice.webm');
      }

      const response = await api.post('/ai/practice-analysis', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setAnalysis(response.data.analysis);
      setAnalysisToken(response.data.analysisToken ?? '');
      setAnalysisOutcome(response.data.outcome ?? null);
      const notice = String(response.data.notice ?? '').trim();
      const baseMessage = response.data.analysisToken
        ? response.data.outcome?.passed
          ? 'Đã chấm xong. Phiên này có thể lưu vào lịch sử.'
          : 'Đã chấm xong. Nếu lưu lúc này hệ thống sẽ ghi nhận trạng thái chưa đạt.'
        : 'Đã tạo bản phân tích cơ bản. Bạn có thể xem kết quả ngay bên dưới.';
      setMessage(notice ? `${baseMessage} ${notice}` : baseMessage);

      if (!transcript.trim() && response.data.analysis.transcript) {
        setTranscript(response.data.analysis.transcript);
      }
    } catch (analyzeError: any) {
      setError(analyzeError.response?.data?.message ?? 'Không thể phân tích bài nói.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveSession = async () => {
    if (!analysis || !analysisToken) {
      setError('Hãy phân tích bài nói hợp lệ trước khi lưu vào lịch sử.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await api.post('/practice/sessions', {
        analysisToken
      });
      updateUser(response.data.user);
      setAnalysisToken('');
      setMessage('Đã lưu phiên. Muốn cộng thưởng tiếp, bạn cần phân tích một phiên mới.');
    } catch (saveError: any) {
      setError(saveError.response?.data?.message ?? 'Không thể lưu lịch sử luyện tập.');
    } finally {
      setSaving(false);
    }
  };

  const handleNextQuestion = async () => {
    setQuestionLoading(true);
    setError('');

    try {
      const nextHistory =
        interviewQuestion && answer.trim()
          ? [...interviewHistory, { question: interviewQuestion.question, answer }]
          : interviewHistory;

      const response = await api.post('/ai/interview/next-question', {
        difficulty,
        history: nextHistory,
        targetRole: user?.targetRole,
        cvSummary: user?.bio
      });

      setInterviewHistory(nextHistory);
      setInterviewQuestion(response.data.nextQuestion);
      setAnswer('');
    } catch (questionError: any) {
      setError(questionError.response?.data?.message ?? 'Không thể tạo câu hỏi tiếp theo.');
    } finally {
      setQuestionLoading(false);
    }
  };

  return (
    <div className="page-stack practice-shell-premium practice-shell-refined practice-shell-enterprise practice-live-shell">
      <section className="panel-card dashboard-hero dashboard-hero-premium practice-hero-banner practice-hero-live">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Practice Studio</p>
          <h3>Không gian luyện nói với AI.</h3>
          <p className="muted-text">Mở phòng thoại hoặc chuyển sang ghi âm để chấm điểm và lưu phiên.</p>
          <div className="hero-chip-row compact">
            <span className="badge-soft">
              <Headphones size={14} />
              Hội thoại giọng nói realtime
            </span>
            <span className="badge-soft">
              <Sparkles size={14} />
              AI phản hồi hoàn toàn bằng tiếng Việt
            </span>
          </div>
        </div>
        <div className="studio-summary-grid">
          {practiceSummary.map((item) => (
            <div key={item.label} className="studio-summary-chip">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="practice-live-grid">
        <RealtimePracticeRoom practiceType={practiceType} difficulty={difficulty} topic={topic} />

        <aside className="page-stack practice-live-aside">
          <article className="panel-card detail-stack elevated-surface live-support-card">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Kịch bản hiện tại</p>
                <h3>Phiên bạn sắp luyện</h3>
              </div>
              <span className="badge-soft">
                <Mic2 size={14} />
                {practiceLabels[practiceType]}
              </span>
            </div>

            <div className="practice-live-mini-grid">
              {practiceSummary.map((item) => (
                <article key={item.label} className="practice-live-mini-card">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>

            <div className="practice-live-tip-list">
              {voiceRoomTips.map((item) => (
                <article key={item} className="practice-live-tip">
                  <span className="practice-live-tip-dot" />
                  <p>{item}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="panel-card detail-stack elevated-surface live-support-card">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Luồng sử dụng</p>
                <h3>Từ hội thoại đến chấm điểm</h3>
              </div>
            </div>

            <div className="practice-flow-list">
              {liveWorkflow.map((item, index) => (
                <article key={item.title} className="practice-flow-item">
                  <strong>0{index + 1}</strong>
                  <div>
                    <h4>{item.title}</h4>
                    <p>{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </aside>
      </section>

      <section className="panel-card practice-section-intro">
        <div>
          <p className="eyebrow">Phân tích sâu</p>
          <h3>Ghi âm và chấm điểm</h3>
        </div>
        <span className="badge-soft">Lưu lịch sử, XP và trạng thái đạt/chưa đạt</span>
      </section>

      <section className="practice-workbench-grid">
        <article className="panel-card detail-stack elevated-surface studio-config-card">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Thiết lập</p>
              <h3>Phiên phân tích</h3>
            </div>
            <span className="badge-soft">
              <Mic2 size={14} />
              {capture.durationSeconds ? `${Math.round(capture.durationSeconds)} giây` : 'Chưa ghi âm'}
            </span>
          </div>

          <div className="segment-stack">
            <div className="segment-block">
              <span className="segment-label">Loại luyện</span>
              <div className="segment-control">
                {(['presentation', 'interview'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`segment-button${practiceType === item ? ' active' : ''}`}
                    onClick={() => handlePracticeTypeChange(item)}
                  >
                    {practiceLabels[item]}
                  </button>
                ))}
              </div>
            </div>

            <div className="segment-block">
              <span className="segment-label">Độ khó</span>
              <div className="segment-control">
                {(['easy', 'medium', 'hard'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`segment-button${difficulty === item ? ' active' : ''}`}
                    onClick={() => handleDifficultyChange(item)}
                  >
                    {difficultyLabels[item]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="practice-topic-grid">
            {topicPresets.map((preset) => (
              <button key={preset} type="button" className={`topic-chip-button${topic === preset ? ' active' : ''}`} onClick={() => handleTopicChange(preset)}>
                {preset}
              </button>
            ))}
          </div>

          <div className="studio-input-grid">
            <label className="input-group full-span">
              <span>Chủ đề</span>
              <input value={topic} onChange={(event) => handleTopicChange(event.target.value)} />
            </label>

            <label className="input-group full-span">
              <span>Transcript</span>
              <textarea
                rows={8}
                value={transcript}
                onChange={(event) => handleTranscriptChange(event.target.value)}
                placeholder="Dán bài nói hoặc câu trả lời vào đây"
              />
            </label>
          </div>

          <div className="studio-rule-strip">
            {practiceRules.map((item) => (
              <span key={item} className="studio-rule-pill">{item}</span>
            ))}
          </div>
        </article>

        <article className="panel-card detail-stack elevated-surface studio-recorder-card">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Ghi âm</p>
              <h3>Phân tích bài nói</h3>
            </div>
            <span className="badge-soft">
              <Save size={14} />
              {analysisToken ? 'Sẵn sàng lưu' : 'Chờ phân tích'}
            </span>
          </div>

          <AudioRecorder onCaptureChange={handleCaptureChange} />

          {analysisOutcome ? (
            <div className="studio-outcome-card">
              <div className={`status-badge ${analysisOutcome.passed ? 'success' : 'danger'}`}>
                <ShieldCheck size={15} />
                <span>{analysisOutcome.label}</span>
              </div>
              <p className="muted-text">Ngưỡng đạt: {analysisOutcome.passThreshold}+ điểm.</p>
            </div>
          ) : null}

          <div className="studio-actions">
            <button type="button" className="primary-button" onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? 'Đang phân tích...' : 'Phân tích ngay'}
            </button>
            <button type="button" className="ghost-button" onClick={handleSaveSession} disabled={saving || !analysis || !analysisToken}>
              <Save size={16} />
              {saving ? 'Đang lưu...' : analysisToken ? 'Lưu phiên' : 'Chưa đủ điều kiện lưu'}
            </button>
          </div>

          {message ? <p className="success-text">{message}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </article>

        <aside className="page-stack practice-side-stack">
          <article className="panel-card detail-stack elevated-surface studio-ai-card">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">AI hỏi đáp</p>
                <h3>Phỏng vấn nối tiếp</h3>
              </div>
              <span className="badge-soft">
                <MessageSquareQuote size={14} />
                {interviewHistory.length} lượt
              </span>
            </div>

            <button type="button" className="primary-button" onClick={handleNextQuestion} disabled={questionLoading}>
              <WandSparkles size={16} />
              {questionLoading ? 'Đang tạo...' : interviewQuestion ? 'Câu hỏi tiếp' : 'Tạo câu hỏi'}
            </button>

            {interviewQuestion ? (
              <div className="analysis-stack">
                <article className="sub-card accent-border">
                  <strong>{interviewQuestion.question}</strong>
                  <p>{interviewQuestion.reason}</p>
                  <span className="muted-text">Thử thách: {interviewQuestion.challenge}</span>
                </article>

                <label className="input-group full-span">
                  <span>Câu trả lời</span>
                  <textarea
                    rows={6}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Nhập câu trả lời để AI bám theo nội dung này"
                  />
                </label>

                <div className="tag-list">
                  {interviewQuestion.suggestedFocus.map((item) => (
                    <span key={item} className="tag-chip">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state-compact">
                <p>Chưa có câu hỏi.</p>
              </div>
            )}

            {interviewHistory.length ? (
              <div className="history-stack compact-history-stack">
                <h4>Lịch sử gần đây</h4>
                {interviewHistory.map((item, index) => (
                  <article key={`${item.question}-${index}`} className="sub-card">
                    <strong>Câu {index + 1}</strong>
                    <p>{item.question}</p>
                    <span className="muted-text">{item.answer}</span>
                  </article>
                ))}
              </div>
            ) : null}
          </article>
        </aside>
      </section>

      {displayAnalysis ? (
        <section className="page-stack analysis-shell-premium analysis-shell-refined">
          <section className="analysis-summary-banner analysis-summary-banner-pro">
            <div className="analysis-summary-chip">
              <span>Tổng điểm</span>
              <strong>{displayAnalysis.totalScore}/100</strong>
            </div>
            <div className="analysis-summary-chip">
              <span>Điểm mạnh</span>
              <strong>{displayAnalysis.strengths.length}</strong>
            </div>
            <div className="analysis-summary-chip">
              <span>Cần cải thiện</span>
              <strong>{displayAnalysis.improvements.length}</strong>
            </div>
            <div className="analysis-summary-chip">
              <span>Câu hỏi tiếp</span>
              <strong>{displayAnalysis.followUpQuestions.length}</strong>
            </div>
          </section>

          <section className="dashboard-grid four-up">
            <StatCard title="Tổng điểm" value={displayAnalysis.totalScore} hint="Điểm AI" accent="coral" />
            <StatCard title="Tốc độ" value={`${displayAnalysis.speechRateWpm} WPM`} hint="Nhịp nói" accent="cyan" />
            <StatCard title="Âm lượng" value={`${displayAnalysis.volumeStability}/100`} hint="Độ ổn định" accent="amber" />
            <StatCard title="Từ đệm / lặp" value={`${displayAnalysis.fillerWordCount} / ${displayAnalysis.repeatCount}`} hint="Càng thấp càng gọn" accent="cyan" />
          </section>

          <section className="dashboard-grid two-up align-start">
            <article className="panel-card detail-stack elevated-surface analysis-surface">
              <p className="eyebrow">Tổng kết</p>
              <h3>{displayAnalysis.summary}</h3>
              <div>
                <h4>Điểm mạnh</h4>
                <ul className="clean-list">
                  {displayAnalysis.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Cần cải thiện</h4>
                <ul className="clean-list">
                  {displayAnalysis.improvements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Gợi ý vòng sau</h4>
                <ul className="clean-list">
                  {displayAnalysis.coachNotes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </article>

            <article className="panel-card chart-card elevated-surface analysis-surface">
              <p className="eyebrow">Tốc độ nói</p>
              <h3>Biểu đồ theo đoạn</h3>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={displayAnalysis.speedTimeline}>
                    <CartesianGrid stroke="#d9e7f4" strokeDasharray="4 4" />
                    <XAxis dataKey="label" stroke="#526477" />
                    <YAxis stroke="#526477" />
                    <Tooltip />
                    <Bar dataKey="value" fill="#1cc3d6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </section>

          <section className="dashboard-grid two-up align-start">
            <article className="panel-card detail-stack elevated-surface analysis-surface">
              <p className="eyebrow">Bản đồ chất lượng</p>
              <h3>Đoạn mạnh và đoạn yếu</h3>
              <div className="heatmap-list">
                {displayAnalysis.heatmap.map((item) => (
                  <div key={item.label} className="heatmap-row">
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.note}</p>
                    </div>
                    <div className="heatmap-meter">
                      <span style={{ width: `${item.score}%` }} />
                    </div>
                    <strong>{item.score}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel-card detail-stack elevated-surface analysis-surface">
              <p className="eyebrow">Luyện sâu hơn</p>
              <h3>Câu hỏi nối tiếp</h3>
              <ul className="clean-list">
                {displayAnalysis.followUpQuestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <details className="source-details">
                <summary>Transcript</summary>
                <pre>{displayAnalysis.transcript || 'Chưa có transcript.'}</pre>
              </details>
            </article>
          </section>
        </section>
      ) : null}
    </div>
  );
}
