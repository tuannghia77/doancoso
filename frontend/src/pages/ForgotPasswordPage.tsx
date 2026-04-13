import { CheckCircle2, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../lib/api';

const stepLabels = [
  { key: 'request', label: 'Gửi OTP', icon: Mail },
  { key: 'verify', label: 'Xác thực', icon: ShieldCheck },
  { key: 'reset', label: 'Mật khẩu mới', icon: KeyRound }
] as const;

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [debugCode, setDebugCode] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'request' | 'verify' | 'reset'>('request');
  const [loading, setLoading] = useState(false);

  const currentStepIndex = stepLabels.findIndex((item) => item.key === step);

  const handleRequestOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setStatusMessage('');

    try {
      const response = await api.post('/auth/forgot-password/request', { email });
      setDebugCode(response.data.debugCode ?? '');
      setStatusMessage(
        response.data.deliveryMode === 'console'
          ? 'SMTP chưa được cấu hình. Hệ thống đang trả mã OTP ở chế độ debug để bạn kiểm thử.'
          : 'Mã OTP đã được gửi qua email. Vui lòng kiểm tra hộp thư của bạn.'
      );
      setStep('verify');
    } catch (requestError: any) {
      setError(requestError.response?.data?.message ?? 'Không thể tạo mã OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setStatusMessage('');

    try {
      const response = await api.post('/auth/forgot-password/verify', { email, code });
      setStatusMessage(response.data.message);
      setStep('reset');
    } catch (verifyError: any) {
      setError(verifyError.response?.data?.message ?? 'OTP không hợp lệ.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setStatusMessage('');

    try {
      const response = await api.post('/auth/forgot-password/reset', {
        email,
        code,
        newPassword
      });
      setStatusMessage(response.data.message);
      setStep('request');
      setCode('');
      setNewPassword('');
    } catch (resetError: any) {
      setError(resetError.response?.data?.message ?? 'Không thể đặt lại mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page auth-page-gradient auth-page-immersive auth-page-enterprise">
      <div className="auth-layout auth-layout-wide auth-layout-refined auth-layout-clean">
        <section className="auth-showcase forgot-showcase auth-showcase-minimal">
          <div>
            <p className="eyebrow">Khôi phục mật khẩu</p>
            <h1>Khôi phục tài khoản trong ba bước rõ ràng.</h1>
            <p className="muted-text auth-showcase-copy">Gửi mã OTP, xác thực và đặt mật khẩu mới.</p>
          </div>

          <div className="auth-stepper auth-stepper-vertical auth-stepper-clean">
            {stepLabels.map((item, index) => {
              const Icon = item.icon;
              const state = index < currentStepIndex ? 'done' : index === currentStepIndex ? 'active' : 'idle';

              return (
                <div key={item.key} className={`auth-step-pill ${state}`}>
                  <div className="auth-step-icon">
                    {state === 'done' ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                  </div>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{index === 0 ? 'Email' : index === 1 ? 'Mã OTP' : 'Mật khẩu mới'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="auth-card auth-card-modern auth-card-wide auth-card-clean">
          <div className="auth-card-header compact-auth-header">
            <p className="eyebrow">SpeakAI</p>
            <h2>Đặt lại mật khẩu</h2>
          </div>

          {step === 'request' ? (
            <form onSubmit={handleRequestOtp} className="stack-gap">
              <label className="input-group">
                <span>Email đã đăng ký</span>
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
              </label>
              <button className="primary-button" type="submit" disabled={loading}>
                {loading ? 'Đang gửi...' : 'Gửi mã OTP'}
              </button>
            </form>
          ) : null}

          {step === 'verify' ? (
            <form onSubmit={handleVerifyOtp} className="stack-gap">
              <label className="input-group">
                <span>Mã OTP 6 số</span>
                <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" required />
              </label>
              <button className="primary-button" type="submit" disabled={loading}>
                {loading ? 'Đang xác thực...' : 'Xác thực OTP'}
              </button>
            </form>
          ) : null}

          {step === 'reset' ? (
            <form onSubmit={handleResetPassword} className="stack-gap">
              <label className="input-group">
                <span>Mật khẩu mới</span>
                <input
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  type="password"
                  minLength={6}
                  required
                />
              </label>
              <button className="primary-button" type="submit" disabled={loading}>
                {loading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
              </button>
            </form>
          ) : null}

          {debugCode ? (
            <p className="info-banner">
              Mã OTP debug: <strong>{debugCode}</strong>
            </p>
          ) : null}
          {statusMessage ? <p className="success-text">{statusMessage}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}

          <div className="auth-footer-links auth-footer-grid auth-compact-links">
            <Link to="/login">Quay lại đăng nhập</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
