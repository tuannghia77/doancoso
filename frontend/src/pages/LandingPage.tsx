import {
  ArrowRight,
  AudioLines,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CheckCheck,
  FileSearch,
  Mic2,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UsersRound
} from 'lucide-react';
import { Link } from 'react-router-dom';

const heroNotes = [
  { label: 'Chế độ', value: 'Phòng thoại AI và ghi âm chấm điểm' },
  { label: 'Ngôn ngữ', value: 'Phản hồi tiếng Việt có dấu' },
  { label: 'Luồng', value: 'Nói trực tiếp → chấm điểm → lưu lịch sử' }
];

const quickButtons = [
  { icon: Mic2, title: 'Phòng thoại AI', subtitle: 'Nói trực tiếp với AI' },
  { icon: AudioLines, title: 'Chấm bài nói', subtitle: 'Tốc độ, âm lượng, độ rõ' },
  { icon: FileSearch, title: 'Phân tích CV', subtitle: 'Điểm mạnh và câu hỏi gợi ý' },
  { icon: BarChart3, title: 'Theo dõi tiến độ', subtitle: 'Mục tiêu ngày và lịch sử' }
];

const featureCards = [
  {
    icon: Mic2,
    title: 'Phòng hội thoại realtime',
    description: 'Mở phiên luyện để nói chuyện với AI bằng giọng nói và nhận phản hồi ngay trong cuộc hội thoại.'
  },
  {
    icon: AudioLines,
    title: 'Ghi âm và chấm bài nói',
    description: 'Thu âm, nghe lại, xem tốc độ nói, độ rõ phát âm, khoảng dừng và các đoạn cần cải thiện.'
  },
  {
    icon: FileSearch,
    title: 'Phân tích CV',
    description: 'Biến CV thành điểm mạnh, điểm cần cải thiện, câu hỏi phỏng vấn và kế hoạch luyện tập cá nhân hóa.'
  },
  {
    icon: BriefcaseBusiness,
    title: 'Câu hỏi phỏng vấn nối tiếp',
    description: 'AI hỏi tiếp theo câu trả lời trước, tạo tình huống phản biện và thay đổi độ khó theo mục tiêu luyện tập.'
  },
  {
    icon: Target,
    title: 'Mục tiêu ngày',
    description: 'Hoàn thành nhiệm vụ để nhận thưởng XP, giữ nhịp luyện đều và mở khóa năng lượng cho các phiên tiếp theo.'
  },
  {
    icon: Trophy,
    title: 'Bảng xếp hạng và tiến độ tuần',
    description: 'Theo dõi xếp hạng XP tuần, lịch sử phiên luyện và mức chênh lệch so với tuần trước.'
  }
];

const introPoints = [
  'Luyện thuyết trình và phỏng vấn trong cùng một nền tảng.',
  'AI phản hồi bằng tiếng Việt có dấu theo đúng chủ đề đang chọn.',
  'Lưu lịch sử và theo dõi tiến độ trong cùng một luồng sử dụng.'
];

const audiences = [
  {
    title: 'Sinh viên chuẩn bị bảo vệ đồ án',
    description: 'Luyện mở bài, trình bày ý chính và trả lời phản biện rõ ràng hơn.',
    image:
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80'
  },
  {
    title: 'Ứng viên đang chuẩn bị phỏng vấn',
    description: 'Tập phản xạ, kể ví dụ chặt chẽ và giữ nhịp trả lời tự tin hơn.',
    image:
      'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=900&q=80'
  },
  {
    title: 'Người đi làm muốn nói chắc hơn',
    description: 'Cải thiện kỹ năng trình bày, pitching và giao tiếp chuyên nghiệp.',
    image:
      'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80'
  }
];

export function LandingPage() {
  return (
    <div className="landing-page landing-home-rebuild">
      <section className="landing-home-hero">
        <div className="landing-home-overlay" />

        <header className="landing-home-topbar">
          <div className="landing-home-brand">
            <span className="landing-home-brand-mark">SA</span>
            <div>
              <p>SpeakAI</p>
              <strong>Hệ thống luyện thuyết trình và phỏng vấn ảo tích hợp AI</strong>
            </div>
          </div>

          <nav className="landing-home-nav" aria-label="Điều hướng chính">
            <a href="#chuc-nang">Chức năng</a>
            <a href="#doi-tuong">Đối tượng</a>
            <a href="#bat-dau">Bắt đầu</a>
          </nav>

          <div className="landing-home-actions">
            <Link to="/login" className="ghost-button large-button">
              Đăng nhập
            </Link>
            <Link to="/register" className="primary-button large-button">
              Đăng ký miễn phí
            </Link>
          </div>
        </header>

        <div className="landing-home-hero-body">
          <div className="landing-home-copy">
            <p className="eyebrow">SpeakAI Studio</p>
            <h1>Không gian luyện nói với AI.</h1>
            <p className="landing-home-lead">
              Mở phòng thoại, ghi âm chấm điểm, phân tích CV và theo dõi tiến độ trong một hệ thống gọn và rõ ràng.
            </p>

            <div className="landing-home-cta-row">
              <Link to="/register" className="primary-button large-button">
                <Sparkles size={18} />
                Bắt đầu ngay
              </Link>
              <Link to="/login" className="ghost-button large-button">
                Xem không gian luyện tập
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>

          <div className="landing-home-sidepanel">
            {heroNotes.map((item, index) => (
              <div key={item.label} className={`landing-home-mini-card${index === heroNotes.length - 1 ? ' accent' : ''}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-home-quick-grid">
          {quickButtons.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="landing-home-quick-card">
                <span className="landing-home-quick-icon">
                  <Icon size={18} />
                </span>
                <strong>{item.title}</strong>
                <p>{item.subtitle}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="landing-home-intro">
        <div className="landing-home-intro-media">
          <img
            src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80"
            alt="Người đang trình bày trước nhóm"
            loading="lazy"
          />
        </div>

        <div className="landing-home-intro-copy">
          <p className="eyebrow">Giới thiệu nhanh</p>
          <h2>Luyện tập, nhận phản hồi và theo dõi tiến độ trong một nơi.</h2>
          <div className="landing-home-intro-list">
            {introPoints.map((item) => (
              <div key={item} className="landing-home-intro-item">
                <ShieldCheck size={18} />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="chuc-nang" className="landing-home-feature-section">
        <div className="landing-home-section-head">
          <p className="eyebrow">Các chức năng hiện có</p>
          <h2>Tất cả tính năng chính được gom lại rõ ràng ngay dưới phần giới thiệu.</h2>
        </div>

        <div className="landing-home-feature-grid">
          {featureCards.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="landing-home-feature-card">
                <span className="landing-home-feature-icon">
                  <Icon size={20} />
                </span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="doi-tuong" className="landing-home-audience-section">
        <div className="landing-home-section-head centered">
          <p className="eyebrow">Phù hợp với ai</p>
          <h2>Ba nhóm người dùng phù hợp nhất với SpeakAI.</h2>
        </div>

        <div className="landing-home-audience-grid">
          {audiences.map((item) => (
            <article key={item.title} className="landing-home-audience-card">
              <img src={item.image} alt={item.title} loading="lazy" />
              <div className="landing-home-audience-copy">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="bat-dau" className="landing-home-cta">
        <div>
          <p className="eyebrow">Sẵn sàng bắt đầu</p>
          <h2>Tạo tài khoản để mở phiên luyện đầu tiên và bắt đầu xây nhịp luyện của riêng bạn.</h2>
        </div>

        <div className="landing-home-cta-actions">
          <Link to="/register" className="primary-button large-button">
            <UsersRound size={18} />
            Tạo tài khoản
          </Link>
          <Link to="/login" className="ghost-button large-button">
            Tôi đã có tài khoản
          </Link>
        </div>
      </section>
    </div>
  );
}
