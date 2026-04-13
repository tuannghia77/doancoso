import { Activity, Ban, Crown, Power, ShieldCheck, Users, Waves } from 'lucide-react';
import { useEffect, useState } from 'react';

import { StatCard } from '../components/StatCard';
import { api } from '../lib/api';

type AdminOverview = {
  stats: {
    usersCount: number;
    adminsCount: number;
    disabledUsersCount: number;
    sessionsThisWeek: number;
  };
  topUsers: Array<{
    id: string;
    name: string;
    email: string;
    weeklyXp: number;
    streak: number;
    energy: number;
    isDisabled: boolean;
  }>;
  recentUsers: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
    totalXp: number;
    isDisabled: boolean;
    isRootAdmin: boolean;
  }>;
  recentSessions: Array<{
    id: string;
    practiceType: string;
    topic: string;
    totalScore: number;
    xpEarned: number;
    createdAt: string;
    user: { name?: string; email?: string };
  }>;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  streak: number;
  totalXp: number;
  weeklyXp: number;
  energy: number;
  targetRole: string;
  createdAt: string;
  isDisabled: boolean;
  disabledAt?: string | null;
  disabledReason: string;
  isRootAdmin: boolean;
};

const getRoleLabel = (role: string) => (role === 'admin' ? 'Quản trị viên' : 'Thành viên');
const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));

export function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState('');

  const loadAdminData = async () => {
    setLoading(true);
    setError('');

    try {
      const [overviewResponse, usersResponse, sessionsResponse] = await Promise.all([
        api.get('/admin/overview'),
        api.get('/admin/users'),
        api.get('/admin/sessions')
      ]);

      setOverview(overviewResponse.data);
      setUsers(usersResponse.data.users);
      setSessions(sessionsResponse.data.sessions);
    } catch (loadError: any) {
      setError(loadError.response?.data?.message ?? 'Không thể tải dữ liệu quản trị.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, []);

  const handleToggleStatus = async (user: AdminUser) => {
    if (user.isRootAdmin) {
      setError('Không thể vô hiệu hóa tài khoản quản trị viên gốc.');
      return;
    }

    let reason = '';
    if (!user.isDisabled) {
      reason = window.prompt('Nhập lý do vô hiệu hóa tài khoản này:')?.trim() ?? '';
    }

    setProcessingId(user.id);
    setError('');
    setMessage('');

    try {
      const response = await api.patch(`/admin/users/${user.id}/status`, {
        isDisabled: !user.isDisabled,
        reason
      });
      setMessage(response.data.message);
      await loadAdminData();
    } catch (toggleError: any) {
      setError(toggleError.response?.data?.message ?? 'Không thể cập nhật trạng thái tài khoản.');
    } finally {
      setProcessingId('');
    }
  };

  if (loading) {
    return <div className="panel-card">Đang tải trung tâm quản trị...</div>;
  }

  if (!overview) {
    return <div className="panel-card error-text">{error || 'Không có dữ liệu quản trị.'}</div>;
  }

  const disableRate = overview.stats.usersCount
    ? Math.round((overview.stats.disabledUsersCount / overview.stats.usersCount) * 100)
    : 0;
  const sessionDensity = overview.stats.usersCount
    ? (overview.stats.sessionsThisWeek / overview.stats.usersCount).toFixed(1)
    : '0.0';
  const adminCoverage = overview.stats.usersCount
    ? Math.round((overview.stats.adminsCount / overview.stats.usersCount) * 100)
    : 0;

  const moderationSignals = [
    `${overview.stats.disabledUsersCount} tài khoản đang bị khóa cần theo dõi trạng thái.`,
    `${overview.stats.sessionsThisWeek} phiên trong tuần đang phản ánh mức độ sử dụng hiện tại.`,
    `${overview.topUsers.length} tài khoản top XP cần được quan sát để phát hiện tăng trưởng bất thường.`
  ];

  const topOperator = overview.topUsers[0];
  const recentSessionCards = sessions.slice(0, 4);
  const statusTone = disableRate > 20 ? 'Cần chú ý' : sessionDensity === '0.0' ? 'Yên ắng' : 'Ổn định';

  return (
    <div className="page-stack admin-shell-premium admin-shell-refined admin-shell-enterprise admin-shell-control">
      {message ? <p className="success-text">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <section className="admin-command-stage">
        <article className="panel-card dashboard-hero admin-hero admin-hero-compact admin-hero-enterprise admin-hero-control">
          <div className="dashboard-hero-copy">
            <p className="eyebrow">Trung tâm điều hành</p>
            <h3>Điều hành hệ thống SpeakAI.</h3>
            <div className="hero-chip-row compact">
              <span className="badge-soft">
                <Users size={14} />
                {overview.stats.usersCount} thành viên
              </span>
              <span className="badge-soft">
                <ShieldCheck size={14} />
                {overview.stats.adminsCount} quản trị viên
              </span>
              <span className="badge-soft">
                <Activity size={14} />
                {statusTone}
              </span>
            </div>
          </div>
          <div className="hero-scoreboard hero-scoreboard-admin admin-scoreboard-extended">
            <div className="scoreboard-card glow">
              <span>Đang khóa</span>
              <strong>{overview.stats.disabledUsersCount}</strong>
            </div>
            <div className="scoreboard-card">
              <span>Phiên tuần</span>
              <strong>{overview.stats.sessionsThisWeek}</strong>
            </div>
            <div className="scoreboard-card">
              <span>Mật độ</span>
              <strong>{sessionDensity}</strong>
            </div>
          </div>
        </article>

        <article className="panel-card admin-side-status-card">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Tài khoản nổi bật</p>
              <h3>{topOperator ? topOperator.name : 'Chưa có dữ liệu'}</h3>
            </div>
            <span className="badge-soft">
              <Crown size={14} />
              Top XP tuần
            </span>
          </div>

          {topOperator ? (
            <div className="admin-spotlight-card">
              <div className="admin-spotlight-row">
                <span>Email</span>
                <strong>{topOperator.email}</strong>
              </div>
              <div className="admin-spotlight-row">
                <span>XP tuần</span>
                <strong>{topOperator.weeklyXp}</strong>
              </div>
              <div className="admin-spotlight-row">
                <span>Chuỗi ngày</span>
                <strong>{topOperator.streak} ngày</strong>
              </div>
            </div>
          ) : (
            <p className="muted-text">Chưa có dữ liệu nổi bật.</p>
          )}
        </article>
      </section>

      <section className="dashboard-grid four-up">
        <StatCard title="Thành viên" value={overview.stats.usersCount} hint="Tổng tài khoản" accent="cyan" />
        <StatCard title="Quản trị viên" value={overview.stats.adminsCount} hint="Tài khoản điều hành" accent="amber" />
        <StatCard title="Đang khóa" value={overview.stats.disabledUsersCount} hint="Tài khoản bị vô hiệu" accent="coral" />
        <StatCard title="Độ phủ quản trị" value={`${adminCoverage}%`} hint="Theo tổng tài khoản" accent="cyan" />
      </section>

      <section className="admin-command-grid admin-command-grid-control">
        <article className="panel-card admin-command-card admin-command-card-main">
          <div className="admin-command-head">
            <div>
              <p className="eyebrow">Tín hiệu hệ thống</p>
              <h3>Những chỉ báo cần xem hôm nay.</h3>
            </div>
            <span className="badge-soft">
              <Activity size={14} />
              Dữ liệu vận hành
            </span>
          </div>

          <div className="admin-health-grid">
            <div className="admin-health-card">
              <span>Tỷ lệ vô hiệu hóa</span>
              <strong>{disableRate}%</strong>
            </div>
            <div className="admin-health-card">
              <span>Mật độ phiên</span>
              <strong>{sessionDensity}</strong>
            </div>
            <div className="admin-health-card">
              <span>Độ phủ quản trị</span>
              <strong>{adminCoverage}%</strong>
            </div>
          </div>
        </article>

        <article className="panel-card admin-command-card admin-command-card-side">
          <div className="admin-command-head compact">
            <div>
              <p className="eyebrow">Ưu tiên moderation</p>
              <h3>Việc cần xử lý</h3>
            </div>
          </div>
          <div className="admin-signal-list">
            {moderationSignals.map((item) => (
              <div key={item} className="admin-signal-row">
                <Waves size={16} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-live-grid">
        <article className="panel-card detail-stack elevated-surface">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Hiệu suất nổi bật</p>
              <h3>Top XP tuần</h3>
            </div>
            <span className="badge-soft">
              <Crown size={14} />
              Xếp hạng động
            </span>
          </div>
          <div className="leaderboard-list leaderboard-list-enhanced leaderboard-list-pro">
            {overview.topUsers.map((item, index) => (
              <div key={item.id} className="leaderboard-row leaderboard-row-enhanced leaderboard-row-compact leaderboard-row-elite">
                <strong>#{index + 1}</strong>
                <div>
                  <p>{item.name}</p>
                  <span>{item.email}</span>
                </div>
                <div className="leaderboard-meta">
                  <span>{item.weeklyXp} XP</span>
                  <span className={item.isDisabled ? 'status-badge danger' : 'status-badge success'}>
                    {item.isDisabled ? 'Đang khóa' : 'Hoạt động'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card detail-stack elevated-surface admin-session-feed-card">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Phiên gần đây</p>
              <h3>Dòng hoạt động</h3>
            </div>
          </div>
          <div className="admin-session-feed">
            {recentSessionCards.length ? (
              recentSessionCards.map((item) => (
                <article key={item.id} className="admin-session-row">
                  <div>
                    <strong>{item.user?.name || item.user?.email || 'Không xác định'}</strong>
                    <p>{item.topic}</p>
                  </div>
                  <div className="admin-session-meta">
                    <span>{item.practiceType === 'presentation' ? 'Thuyết trình' : 'Phỏng vấn'}</span>
                    <strong>{item.totalScore}/100</strong>
                    <span>{formatShortDate(item.createdAt)}</span>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted-text">Chưa có phiên gần đây.</p>
            )}
          </div>
        </article>
      </section>

      <section className="dashboard-grid two-up align-start">
        <article className="panel-card detail-stack elevated-surface">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Tài khoản mới</p>
              <h3>Người dùng vừa tham gia</h3>
            </div>
            <span className="badge-soft">
              <Users size={14} />
              Theo thời gian tạo
            </span>
          </div>
          <div className="simple-table simple-table-enhanced">
            {overview.recentUsers.map((item) => (
              <div key={item.id} className="table-row compact">
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.email}</p>
                </div>
                <span>{item.isRootAdmin ? 'Admin gốc' : getRoleLabel(item.role)}</span>
                <strong>{item.isRootAdmin ? 'Bảo vệ' : item.isDisabled ? 'Đang khóa' : 'Hoạt động'}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card detail-stack elevated-surface ops-card ops-card-minimal">
          <p className="eyebrow">An toàn</p>
          <h3>Giới hạn đang bật</h3>
          <div className="profile-insight-list compact-insight-list">
            <div className="profile-insight-item">
              <ShieldCheck size={18} />
              <p>Admin gốc được bảo vệ tuyệt đối.</p>
            </div>
            <div className="profile-insight-item">
              <Ban size={18} />
              <p>Không thể tự vô hiệu hóa từ giao diện.</p>
            </div>
            <div className="profile-insight-item">
              <Waves size={18} />
              <p>Phiên luyện chỉ cộng thưởng khi hợp lệ.</p>
            </div>
          </div>
        </article>
      </section>

      <section className="panel-card detail-stack elevated-surface">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">Điều khiển người dùng</p>
            <h3>Quản lý tài khoản</h3>
          </div>
          <span className="badge-soft">
            <Ban size={14} />
            Quản trị viên gốc được bảo vệ
          </span>
        </div>

        <div className="admin-user-list admin-user-list-enterprise admin-user-list-control">
          {users.map((item) => (
            <article key={item.id} className="admin-user-card admin-user-card-premium admin-user-card-minimal admin-user-card-control">
              <div className="admin-user-main">
                <div>
                  <div className="admin-user-title">
                    <strong>{item.name}</strong>
                    <span className={item.isRootAdmin ? 'status-badge dark' : item.isDisabled ? 'status-badge danger' : 'status-badge success'}>
                      {item.isRootAdmin ? 'Quản trị viên gốc' : item.isDisabled ? 'Đã vô hiệu hóa' : 'Đang hoạt động'}
                    </span>
                  </div>
                  <p>{item.email}</p>
                  <div className="admin-user-summary">
                    <span className="tag-chip">{getRoleLabel(item.role)}</span>
                    {item.targetRole ? <span className="tag-chip">{item.targetRole}</span> : null}
                    <span className="tag-chip">{item.totalXp} XP</span>
                    <span className="tag-chip">{item.weeklyXp} XP tuần</span>
                    <span className="tag-chip">{item.energy}/5 năng lượng</span>
                    <span className="tag-chip">Tạo lúc {formatShortDate(item.createdAt)}</span>
                  </div>
                  {item.disabledReason ? <p className="muted-text">Lý do: {item.disabledReason}</p> : null}
                </div>
                <div className="admin-user-actions">
                  <button
                    type="button"
                    className={item.isDisabled ? 'primary-button' : 'danger-button'}
                    disabled={item.isRootAdmin || processingId === item.id}
                    onClick={() => handleToggleStatus(item)}
                  >
                    <Power size={16} />
                    {processingId === item.id ? 'Đang cập nhật...' : item.isDisabled ? 'Kích hoạt lại' : 'Vô hiệu hóa'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

