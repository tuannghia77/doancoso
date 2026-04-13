import { ArrowRight, LockKeyhole, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { useAuth } from '../context/AuthContext';

const metrics = [
  { label: 'Nhịp', value: 'Chuỗi ngày' },
  { label: 'Lịch sử', value: 'Lịch sử luyện' },
  { label: 'AI', value: 'Phản hồi cá nhân hóa' }
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (submitError: any) {
      setError(submitError.response?.data?.message ?? 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page auth-page-gradient auth-page-immersive auth-page-enterprise">
      <div className="auth-layout auth-layout-refined auth-layout-clean">
        <section className="auth-showcase auth-showcase-minimal">
          <div>
            <p className="eyebrow">Đăng nhập SpeakAI</p>
            <h1>Tiếp tục lộ trình luyện nói của bạn.</h1>
            <p className="muted-text auth-showcase-copy">Mở lại dashboard, nhiệm vụ và các phiên gần đây.</p>
          </div>

          <div className="auth-metric-strip">
            {metrics.map((item) => (
              <article key={item.label} className="auth-metric-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>

          <article className="auth-showcase-card emphasis auth-showcase-card-clean">
            <LockKeyhole size={22} />
            <strong>Đăng nhập an toàn</strong>
            <p>Vào thẳng không gian luyện tập cá nhân.</p>
          </article>
        </section>

        <form className="auth-card auth-card-modern auth-card-clean" onSubmit={handleSubmit}>
          <div className="auth-card-header compact-auth-header">
            <p className="eyebrow">SpeakAI</p>
            <h2>Tiếp tục</h2>
          </div>

          <label className="input-group">
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>

          <label className="input-group">
            <span>Mật khẩu</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'Đang xử lý...' : 'Đăng nhập'}
            <ArrowRight size={16} />
          </button>

          <div className="auth-footer-links auth-footer-grid auth-compact-links">
            <Link to="/forgot-password">Quên mật khẩu?</Link>
            <Link to="/register">Tạo tài khoản mới</Link>
          </div>

          <div className="auth-mini-note compact-note">
            <Sparkles size={15} />
            <span>Toàn bộ phản hồi AI sẽ được giữ trong không gian cá nhân của bạn.</span>
          </div>
        </form>
      </div>
    </div>
  );
}



