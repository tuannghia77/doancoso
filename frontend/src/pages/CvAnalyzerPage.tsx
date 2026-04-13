import { ArrowRight, Brain, CheckCheck, FileSearch, Sparkles, Upload, WandSparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../lib/api';
import type { CvAnalysisResult } from '../types';

const cvChecklist = ['Vai trò mục tiêu rõ ràng', 'Mỗi dự án có kết quả đo được', 'Kỹ năng bám sát vị trí ứng tuyển'];
const corruptedPattern = /Ã|Â|Ä|á»|Æ|â€|Ă/;
const personalFieldPattern =
  /^(họ và tên|họ tên|full name|tên|name|ngày sinh|date of birth|dob|giới tính|gender|số điện thoại|phone|mobile|email|địa chỉ|address|linkedin|github|facebook|website|quốc tịch|nationality)\b/i;
const roleKeywordPattern =
  /\b(intern|executive|developer|engineer|analyst|manager|specialist|designer|marketer|marketing|sales|business|product|account|consultant|coordinator|assistant|lead|head|officer|tester|qa|support|recruiter|content|seo|hr|operations?)\b/i;
const projectPattern = /(dự án|project|campaign|portfolio|case study)/i;
const sectionPatterns = {
  skills: /(kỹ năng|skills|technical skills|core skills)/i,
  projects: /(dự án|project|projects|portfolio)/i
};

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const looksCorrupted = (value?: string) => Boolean(value && corruptedPattern.test(value));

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

const extractKeywords = (text: string, limit = 6) =>
  Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((word) => word.length >= 3)
    )
  ).slice(0, limit);

const inferTargetRoleFromResume = (resumeText: string, targetRole: string) => {
  const explicitRole = normalizeText(targetRole);
  if (explicitRole) {
    return explicitRole;
  }

  const roleLine = normalizeResumeLines(resumeText).find((line) => !isPersonalInfoLine(line) && roleKeywordPattern.test(line));
  return roleLine || 'vị trí ứng tuyển hiện tại';
};

const buildReadableFallbackCvAnalysis = (resumeSource: string, targetRole: string): CvAnalysisResult => {
  const lines = normalizeResumeLines(resumeSource);
  const contentLines = lines.filter((line) => !isPersonalInfoLine(line));
  const contentText = contentLines.join('\n');
  const roleLabel = inferTargetRoleFromResume(resumeSource, targetRole);
  const keywords = extractKeywords(contentText, 8).filter((word) => !/^(tên|name|nam|nữ|male|female)$/i.test(word));
  const keywordLabel = keywords.slice(0, 3).join(', ') || 'kỹ năng và kinh nghiệm hiện có';
  const projectAnchor = contentLines.find((line) => projectPattern.test(line)) || 'một trải nghiệm gần đây';
  const quantifiedSignals =
    (contentText.match(/\b\d+(?:[.,]\d+)?\s*(%|triệu|tỷ|k|khách|khách hàng|users?|người|tháng|năm|months?|years?)\b/gi)?.length ?? 0) +
    (contentText.match(/\b(tăng|giảm|cải thiện|đạt|vượt|mở rộng|tối ưu)\b/gi)?.length ?? 0);

  return {
    summary:
      quantifiedSignals > 0
        ? `CV cho thấy bạn đang hướng tới ${roleLabel} và đã có nền thông tin tương đối rõ về kỹ năng hoặc trải nghiệm liên quan. Điểm cần làm tốt hơn là biến các kinh nghiệm đó thành câu chuyện có vai trò, hành động và kết quả đo được để tăng sức nặng khi ứng tuyển.`
        : `CV hiện tại đã cho thấy định hướng về ${roleLabel}, nhưng phần kinh nghiệm vẫn còn thiên về mô tả chung. Hồ sơ sẽ thuyết phục hơn nhiều nếu bạn bổ sung dự án, trách nhiệm cá nhân và kết quả cụ thể cho từng trải nghiệm.`,
    strengths: [
      `CV đã định hình khá rõ hướng đi cho vai trò ${roleLabel}.`,
      sectionPatterns.projects.test(contentText)
        ? 'Hồ sơ đã có dấu hiệu đề cập đến dự án hoặc công việc thực tế để khai thác khi phỏng vấn.'
        : 'Nội dung hiện tại đủ để SpeakAI xây dựng bộ câu hỏi luyện tập nền tảng.',
      sectionPatterns.skills.test(contentText)
        ? `CV đã xuất hiện một số cụm năng lực đáng chú ý như ${keywordLabel}.`
        : 'CV đã có khung thông tin cơ bản để tiếp tục tinh chỉnh theo vai trò mục tiêu.',
      quantifiedSignals > 0
        ? 'Hồ sơ đã có một vài tín hiệu về kết quả hoặc tác động có thể khai thác sâu hơn.'
        : 'Hồ sơ có thể mạnh hơn nhiều nếu bổ sung thêm kết quả đo được cho từng trải nghiệm.'
    ],
    improvements: [
      quantifiedSignals > 0
        ? 'Cần đẩy mạnh hơn phần kết quả đo được ở từng kinh nghiệm, thay vì chỉ xuất hiện rải rác.'
        : 'Hồ sơ đang thiếu các kết quả định lượng rõ ràng như doanh thu, tăng trưởng, hiệu suất hoặc quy mô công việc.',
      sectionPatterns.projects.test(contentText)
        ? 'Nên viết rõ hơn vai trò cá nhân, bối cảnh, hành động và kết quả của từng dự án nổi bật.'
        : 'Nên bổ sung thêm 1-2 dự án hoặc trải nghiệm thực tế để nhà tuyển dụng dễ đánh giá năng lực hơn.',
      `Hãy chỉnh CV bám chặt vào vai trò ${roleLabel} thay vì để nội dung dàn trải hoặc thiên về thông tin cá nhân.`,
      'Ưu tiên các gạch đầu dòng ngắn, mạnh và đi thẳng vào đóng góp cụ thể.'
    ],
    interviewQuestions: [
      {
        question: `Hãy giới thiệu ngắn gọn về bản thân trong vai trò ${roleLabel}.`,
        purpose: 'Kiểm tra cách bạn mở đầu và định vị bản thân trước nhà tuyển dụng.'
      },
      {
        question: `Trong phần "${projectAnchor}", bạn đã trực tiếp chịu trách nhiệm phần nào và tạo ra kết quả gì?`,
        purpose: 'Đánh giá khả năng kể kinh nghiệm bằng bối cảnh, hành động và kết quả.'
      },
      {
        question: 'Một khó khăn thực tế bạn từng gặp là gì và bạn đã xử lý ra sao?',
        purpose: 'Kiểm tra tư duy giải quyết vấn đề và khả năng phản xạ khi bị truy vấn sâu hơn.'
      },
      {
        question: `Nếu vào vai trò ${roleLabel}, 90 ngày đầu bạn sẽ ưu tiên điều gì trước?`,
        purpose: 'Đánh giá khả năng lập kế hoạch và hiểu công việc mục tiêu.'
      }
    ],
    practicePlan: [
      'Luyện phần giới thiệu bản thân trong 60-90 giây và thu âm lại để kiểm tra độ rõ, nhịp nói và độ tự tin.',
      `Chọn nội dung gần với "${projectAnchor}" rồi trả lời theo cấu trúc bối cảnh - hành động - kết quả.`,
      'Chuẩn bị trước 3 thành tích có số liệu cụ thể để dùng khi bị hỏi sâu về đóng góp cá nhân.',
      `Tập một phiên phản biện cho vai trò ${roleLabel}: vì sao nhà tuyển dụng nên chọn bạn thay vì ứng viên khác.`
    ]
  };
};

export function CvAnalyzerPage() {
  const [targetRole, setTargetRole] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<CvAnalysisResult | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const displayAnalysis = useMemo(() => {
    if (!analysis) {
      return null;
    }

    const samples = [
      analysis.summary,
      ...analysis.strengths,
      ...analysis.improvements,
      ...analysis.practicePlan,
      ...analysis.interviewQuestions.flatMap((item) => [item.question, item.purpose])
    ];

    if (samples.some((item) => looksCorrupted(item))) {
      return buildReadableFallbackCvAnalysis(extractedText || resumeText, targetRole);
    }

    return {
      ...analysis,
      summary: normalizeText(analysis.summary),
      strengths: analysis.strengths.map((item) => normalizeText(item)).filter(Boolean),
      improvements: analysis.improvements.map((item) => normalizeText(item)).filter(Boolean),
      interviewQuestions: analysis.interviewQuestions.map((item) => ({
        question: normalizeText(item.question),
        purpose: normalizeText(item.purpose)
      })),
      practicePlan: analysis.practicePlan.map((item) => normalizeText(item)).filter(Boolean)
    };
  }, [analysis, extractedText, resumeText, targetRole]);

  const summaryStats = useMemo(
    () => [
      { label: 'Điểm mạnh', value: displayAnalysis?.strengths.length ?? 0 },
      { label: 'Cần cải thiện', value: displayAnalysis?.improvements.length ?? 0 },
      { label: 'Câu hỏi', value: displayAnalysis?.interviewQuestions.length ?? 0 },
      { label: 'Bài tập', value: displayAnalysis?.practicePlan.length ?? 0 }
    ],
    [displayAnalysis]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file && !resumeText.trim()) {
      setError('Vui lòng tải CV lên hoặc dán nội dung CV để bắt đầu phân tích.');
      setMessage('');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('targetRole', targetRole);
      formData.append('resumeText', resumeText);
      if (file) {
        formData.append('cv', file);
      }

      const response = await api.post('/ai/cv-analysis', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const notice = normalizeText(response.data.notice);

      setAnalysis(response.data.analysis);
      setExtractedText(String(response.data.extractedText ?? ''));
      setMessage(notice || 'Đã phân tích CV thành công.');
    } catch (submitError: any) {
      setError(submitError.response?.data?.message ?? 'Không thể phân tích CV.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-stack cv-shell cv-shell-refined cv-shell-enterprise">
      <section className="cv-command-grid">
        <article className="panel-card cv-command-card cv-command-card-main">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Phòng CV</p>
              <h3>Phân tích CV và tạo lộ trình luyện tập.</h3>
            </div>
            <span className="badge-soft">
              <Brain size={14} />
              Phân tích hoàn toàn bằng tiếng Việt
            </span>
          </div>

          <div className="cv-command-metrics">
            {summaryStats.map((item) => (
              <div key={item.label} className="cv-command-metric">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="cv-command-actions">
            <span className="studio-rule-pill">PDF, TXT, MD hoặc văn bản dán trực tiếp</span>
            <span className="studio-rule-pill">Tự sinh câu hỏi và kế hoạch luyện</span>
          </div>
        </article>

        <article className="panel-card cv-quick-card">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Trước khi gửi</p>
              <h3>Checklist CV</h3>
            </div>
          </div>
          <div className="profile-insight-list compact-insight-list">
            {cvChecklist.map((item) => (
              <div key={item} className="profile-insight-item">
                <CheckCheck size={18} />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <div className="page-grid two-up cv-lab-grid cv-lab-grid-enterprise">
        <section className="panel-card elevated-surface cv-form-card cv-form-card-enterprise">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Nguồn dữ liệu</p>
              <h3>Gửi CV</h3>
            </div>
            <span className="badge-soft">
              <FileSearch size={14} />
              Theo vị trí mục tiêu
            </span>
          </div>

          <form className="stack-gap" onSubmit={handleSubmit}>
            <label className="input-group">
              <span>Vị trí mục tiêu</span>
              <input
                value={targetRole}
                onChange={(event) => setTargetRole(event.target.value)}
                placeholder="Ví dụ: Business Analyst Intern"
              />
            </label>

            <label className="cv-upload-zone">
              <input type="file" accept=".pdf,.txt,.md" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              <div className="cv-upload-content">
                <Upload size={20} />
                <strong>{file ? file.name : 'Chọn file CV'}</strong>
                <span>{file ? 'Đã sẵn sàng để phân tích.' : 'Kéo thả hoặc bấm để chọn file PDF, TXT, MD.'}</span>
              </div>
            </label>

            <label className="input-group full-span">
              <span>Nội dung CV</span>
              <textarea
                rows={11}
                value={resumeText}
                onChange={(event) => setResumeText(event.target.value)}
                placeholder="Dán CV dạng văn bản nếu không tải file"
              />
            </label>

            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? 'Đang phân tích...' : 'Phân tích CV'}
            </button>
          </form>

          {message ? <p className="success-text">{message}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <section className="page-stack cv-results-stack">
          <article className="panel-card detail-stack elevated-surface cv-result-shell">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Kết quả AI</p>
                <h3>Kết quả phân tích</h3>
              </div>
              <span className="badge-soft">
                <Sparkles size={14} />
                Phân tích SpeakAI
              </span>
            </div>

            {displayAnalysis ? (
              <div className="analysis-stack cv-results-grid-enterprise">
                <article className="sub-card analysis-spotlight cv-spotlight-card">
                  <strong>Tóm tắt</strong>
                  <p>{displayAnalysis.summary}</p>
                </article>

                <div className="cv-two-column-list">
                  <article className="sub-card">
                    <strong>Điểm mạnh</strong>
                    <ul className="clean-list">
                      {displayAnalysis.strengths.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>

                  <article className="sub-card">
                    <strong>Cần cải thiện</strong>
                    <ul className="clean-list">
                      {displayAnalysis.improvements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                </div>

                <article className="sub-card">
                  <strong>Câu hỏi gợi ý</strong>
                  <div className="question-stack">
                    {displayAnalysis.interviewQuestions.map((item) => (
                      <article key={item.question} className="sub-card cv-question-card">
                        <strong>{item.question}</strong>
                        <p>{item.purpose}</p>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="sub-card cv-plan-card">
                  <div className="section-heading compact-heading">
                    <div>
                      <strong>Kế hoạch luyện</strong>
                    </div>
                    <Link to="/practice" className="ghost-button small-button-inline">
                      <ArrowRight size={14} />
                      Mở phòng luyện
                    </Link>
                  </div>
                  <ul className="clean-list">
                    {displayAnalysis.practicePlan.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <details className="source-details">
                  <summary>Nội dung CV đã đọc</summary>
                  <pre>{extractedText}</pre>
                </details>
              </div>
            ) : (
              <div className="empty-state-compact cv-empty-state">
                <WandSparkles size={18} />
                <p>Chưa có dữ liệu. Tải CV để bắt đầu.</p>
              </div>
            )}
          </article>
        </section>
      </div>
    </div>
  );
}
