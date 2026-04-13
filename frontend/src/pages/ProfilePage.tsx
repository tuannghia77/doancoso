import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Mail,
  Sparkles,
  Target,
  UserRound,
  WandSparkles,
  Zap
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

const experienceLevels = ['Mới bắt đầu', 'Sơ cấp', 'Trung cấp', 'Nâng cao'];

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    name: '',
    bio: '',
    targetRole: '',
    experienceLevel: '',
    skills: '',
    avatarUrl: ''
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    setForm({
      name: user.name,
      bio: user.bio,
      targetRole: user.targetRole,
      experienceLevel: user.experienceLevel,
      skills: user.skills.join(', '),
      avatarUrl: user.avatarUrl
    });
  }, [user]);

  const completion = useMemo(() => {
    const values = [form.name, form.bio, form.targetRole, form.experienceLevel, form.skills, form.avatarUrl];
    const filled = values.filter((item) => item.trim()).length;
    return Math.round((filled / values.length) * 100);
  }, [form]);

  const parsedSkills = useMemo(
    () => form.skills.split(',').map((item) => item.trim()).filter(Boolean),
    [form.skills]
  );

  const readinessLabel = completion >= 85 ? 'Sẵn sàng cao' : completion >= 60 ? 'Đang hoàn thiện tốt' : 'Cần bổ sung thêm';
  const aiPreview = form.bio.trim() || 'Thêm mô tả ngắn để AI hiểu rõ bối cảnh và mục tiêu của bạn.';

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await api.patch('/users/profile', form);
      updateUser(response.data.user);
      setMessage(response.data.message);
    } catch (submitError: any) {
      setError(submitError.response?.data?.message ?? 'Không thể cập nhật hồ sơ.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-stack profile-shell profile-shell-refined profile-shell-enterprise">
      <section className="profile-command-grid">
        <article className="panel-card profile-command-card profile-command-card-main">
          <div className="profile-command-head">
            <div className="profile-banner-main">
              <div className="profile-avatar-ring profile-avatar-ring-large">
                {form.avatarUrl ? <img src={form.avatarUrl} alt={form.name || 'Avatar'} className="profile-avatar-image" /> : <UserRound size={38} />}
              </div>
              <div>
                <p className="eyebrow">Hồ sơ cá nhân</p>
                <h3>{form.name || 'Thiết lập hồ sơ của bạn'}</h3>
                <p className="muted-text">Hồ sơ rõ hơn để AI cá nhân hóa đúng hơn.</p>
              </div>
            </div>
            <span className="badge-soft">
              <Mail size={14} />
              {user?.email}
            </span>
          </div>

          <div className="profile-command-metrics">
            <div className="profile-command-metric">
              <span>Độ hoàn thiện</span>
              <strong>{completion}%</strong>
            </div>
            <div className="profile-command-metric">
              <span>Vai trò mục tiêu</span>
              <strong>{form.targetRole || 'Chưa cập nhật'}</strong>
            </div>
            <div className="profile-command-metric">
              <span>Kỹ năng</span>
              <strong>{parsedSkills.length}</strong>
            </div>
            <div className="profile-command-metric">
              <span>Trạng thái</span>
              <strong>{readinessLabel}</strong>
            </div>
          </div>

          <div className="profile-command-actions">
            <Link to="/practice" className="primary-button large-button">
              <Zap size={16} />
              Luyện ngay
            </Link>
            <Link to="/cv" className="ghost-button large-button">
              <ArrowRight size={16} />
              Mở Phòng CV
            </Link>
          </div>
        </article>

        <article className="panel-card profile-context-card">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Ngữ cảnh AI</p>
              <h3>Ngữ cảnh hiện tại</h3>
            </div>
            <span className="badge-soft">
              <WandSparkles size={14} />
              Hồ sơ cá nhân hóa
            </span>
          </div>

          <div className="profile-context-list">
            <div className="profile-context-row">
              <span>Vai trò</span>
              <strong>{form.targetRole || 'Chưa cập nhật'}</strong>
            </div>
            <div className="profile-context-row">
              <span>Kinh nghiệm</span>
              <strong>{form.experienceLevel || 'Chưa cập nhật'}</strong>
            </div>
            <div className="profile-context-row">
              <span>Kỹ năng nổi bật</span>
              <strong>{parsedSkills.slice(0, 3).join(', ') || 'Chưa cập nhật'}</strong>
            </div>
          </div>

          <article className="sub-card profile-preview-card">
            <strong>Tóm tắt AI</strong>
            <p>{aiPreview}</p>
          </article>
        </article>
      </section>

      <div className="page-grid narrow-grid profile-grid-advanced profile-grid-enterprise">
        <section className="panel-card elevated-surface profile-editor-card">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Chỉnh sửa</p>
              <h3>Thông tin hồ sơ</h3>
            </div>
            <span className="badge-soft">
              <BadgeCheck size={14} />
              Hồ sơ SpeakAI
            </span>
          </div>

          <form className="profile-form profile-form-enterprise" onSubmit={handleSubmit}>
            <label className="input-group">
              <span>Họ tên</span>
              <input value={form.name} onChange={(event) => handleChange('name', event.target.value)} />
            </label>

            <label className="input-group">
              <span>Vị trí mục tiêu</span>
              <input
                value={form.targetRole}
                onChange={(event) => handleChange('targetRole', event.target.value)}
                placeholder="Ví dụ: Frontend Intern"
              />
            </label>

            <div className="input-group full-span">
              <span>Mức kinh nghiệm</span>
              <div className="segment-control profile-segment-control">
                {experienceLevels.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`segment-button${form.experienceLevel === item ? ' active' : ''}`}
                    onClick={() => handleChange('experienceLevel', item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <label className="input-group full-span">
              <span>Kỹ năng</span>
              <input
                value={form.skills}
                onChange={(event) => handleChange('skills', event.target.value)}
                placeholder="React, TypeScript, Giao tiếp"
              />
            </label>

            <label className="input-group full-span">
              <span>Avatar URL</span>
              <input
                value={form.avatarUrl}
                onChange={(event) => handleChange('avatarUrl', event.target.value)}
                placeholder="https://..."
              />
            </label>

            <label className="input-group full-span">
              <span>Giới thiệu</span>
              <textarea
                value={form.bio}
                onChange={(event) => handleChange('bio', event.target.value)}
                rows={6}
                placeholder="Mô tả ngắn về mục tiêu, thế mạnh và loại cơ hội bạn đang hướng tới"
              />
            </label>

            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </form>

          {message ? <p className="success-text">{message}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <section className="page-stack profile-side-stack-enterprise">
          <article className="panel-card detail-stack elevated-surface profile-side-card profile-side-card-premium">
            <p className="eyebrow">Tình trạng hiện tại</p>
            <h3>Chỉ số cá nhân</h3>
            <div className="info-list compact-info-list profile-info-grid">
              <div>
                <span>Chuỗi ngày</span>
                <strong>{user?.streak ?? 0} ngày</strong>
              </div>
              <div>
                <span>Năng lượng</span>
                <strong>{user?.energy ?? 0}/5</strong>
              </div>
              <div>
                <span>Tổng XP</span>
                <strong>{user?.totalXp ?? 0}</strong>
              </div>
              <div>
                <span>Cấp hiện tại</span>
                <strong>Cấp {user?.level ?? 1}</strong>
              </div>
            </div>
          </article>

          <article className="panel-card detail-stack elevated-surface profile-side-card profile-side-card-premium">
            <p className="eyebrow">Checklist</p>
            <h3>Ưu tiên tiếp theo</h3>
            <div className="profile-insight-list compact-insight-list">
              <div className="profile-insight-item">
                <Target size={18} />
                <p>{form.targetRole ? 'Đã có vai trò mục tiêu.' : 'Thêm vai trò mục tiêu để AI đặt câu hỏi đúng hướng.'}</p>
              </div>
              <div className="profile-insight-item">
                <BriefcaseBusiness size={18} />
                <p>{parsedSkills.length >= 3 ? 'Bộ kỹ năng đã đủ rõ.' : 'Nên thêm ít nhất 3 kỹ năng nổi bật.'}</p>
              </div>
              <div className="profile-insight-item">
                <Sparkles size={18} />
                <p>{form.bio.trim() ? 'Đã có mô tả bối cảnh cá nhân.' : 'Bổ sung phần giới thiệu để AI phản hồi sát hơn.'}</p>
              </div>
            </div>
          </article>

          <article className="panel-card detail-stack elevated-surface profile-side-card profile-side-card-premium">
            <p className="eyebrow">Kỹ năng</p>
            <h3>Kỹ năng hiện có</h3>
            <div className="tag-list profile-tag-cloud">
              {parsedSkills.length ? (
                parsedSkills.map((item) => (
                  <span key={item} className="tag-chip">
                    {item}
                  </span>
                ))
              ) : (
                <span className="muted-text">Chưa có kỹ năng nào.</span>
              )}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

