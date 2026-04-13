import { ArrowRight, CircleHelp, Rocket, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { useAuth } from '../context/AuthContext';

const onboardingMetrics = [
  { label: 'Hôm nay', value: 'Mục tiêu ngày' },
  { label: 'Luyện tập', value: 'Luyện nói với AI' },
  { label: 'CV', value: 'Phân tích CV' }
];

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await register(name, email, password);
      navigate('/dashboard');
    } catch (submitError: any) {
      setError(submitError.response?.data?.message ?? 'Đăng ký thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page auth-page-gradient auth-page-immersive auth-page-enterprise">
      <div className="auth-layout auth-layout-refined auth-layout-clean">
        <section className="auth-showcase register-showcase auth-showcase-minimal">
          <div>
            <p className="eyebrow">Tạo tài khoản</p>
            <h1>Mở không gian luyện tập của riêng bạn.</h1>
            <p className="muted-text auth-showcase-copy">Tạo tài khoản xong là có thể bắt đầu phiên đầu tiên.</p>
          </div>

          <div className="auth-metric-strip">
            {onboardingMetrics.map((item) => (
              <article key={item.label} className="auth-metric-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>

          <div className="auth-showcase-grid compact-showcase-grid auth-showcase-grid-clean">
            <article className="auth-showcase-card emphasis auth-showcase-card-clean">
              <Rocket size={22} />
              <strong>Vào ngay dashboard</strong>
              <p>Bắt đầu luyện ngay sau khi đăng ký.</p>
            </article>
            <article className="auth-showcase-card auth-showcase-card-clean">
              <CircleHelp size={22} />
              <strong>AI bám theo mục tiêu</strong>
              <p>Câu hỏi và feedback bám theo mục tiêu của bạn.</p>
            </article>
          </div>
        </section>

        <form className="auth-card auth-card-modern auth-card-clean" onSubmit={handleSubmit}>
          <div className="auth-card-header compact-auth-header">
            <p className="eyebrow">SpeakAI</p>
            <h2>Tạo không gian</h2>
          </div>

          <label className="input-group">
            <span>Họ tên</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>

          <label className="input-group">
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>

          <label className="input-group">
            <span>Mật khẩu</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={6}
              required
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'Đang tạo tài khoản...' : 'Đăng ký'}
            <ArrowRight size={16} />
          </button>

          <div className="auth-footer-links auth-footer-grid auth-compact-links">
            <Link to="/login">Đã có tài khoản? Đăng nhập</Link>
          </div>

          <div className="auth-mini-note compact-note">
            <Sparkles size={15} />
            <span>Bắt đầu với streak, mục tiêu ngày và phòng luyện AI.</span>
          </div>
        </form>
      </div>
    </div>
  );
}


