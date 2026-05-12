import { ArrowRight, Award, Bot, Clock3, Mic2, Sparkles, Target, TrendingUp, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { DashboardData, DailyGoal } from '../types';

const formatSessionDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));

const formatDifficulty = (difficulty: string) => {
  if (difficulty === 'easy') return 'Dễ';
  if (difficulty === 'medium') return 'Trung bình';
  if (difficulty === 'hard') return 'Khó';
  return difficulty;
};

const getGoalProgress = (goal: DailyGoal) => Math.min(100, Math.round((goal.current / goal.target) * 100));

export function DashboardPage() {
  const { updateUser } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/users/dashboard');
      setDashboard(response.data);
      updateUser(response.data.user);
    } catch (loadError: any) {
      setError(loadError.response?.data?.message ?? 'Không thể tải dữ liệu tổng quan lúc này.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const handleClaimGoal = async (goalKey: string) => {
    try {
      await api.post(`/users/goals/${goalKey}/claim`);
      await loadDashboard();
    } catch (claimError: any) {
      setError(claimError.response?.data?.message ?? 'Không thể nhận thưởng.');
    }
  };

  if (loading) {
    return <div className="panel-card">Đang tải dashboard...</div>;
  }

  if (!dashboard) {
    return <div className="panel-card error-text">{error || 'Không có dữ liệu tổng quan.'}</div>;
  }

  const completedGoals = dashboard.user.dailyGoals.filter((goal) => goal.claimed || goal.completed).length;
  const openGoals = dashboard.user.dailyGoals.filter((goal) => !goal.claimed).length;
  const weeklyDelta = `${dashboard.progress.differencePercent >= 0 ? '+' : ''}${dashboard.progress.differencePercent}%`;
  const topGoal = [...dashboard.user.dailyGoals]
    .filter((goal) => !goal.claimed)
    .sort((a, b) => getGoalProgress(b) - getGoalProgress(a))[0] ?? null;
  const topGoalProgress = topGoal ? getGoalProgress(topGoal) : 100;
  const averageRecentScore = dashboard.recentSessions.length
    ? Math.round(
        dashboard.recentSessions.reduce((total, session) => total + session.totalScore, 0) / dashboard.recentSessions.length
      )
    : 0;
  const latestSession = dashboard.recentSessions[0] ?? null;
  const trendLabel =
    dashboard.progress.trend === 'up'
      ? 'Đang tăng'
      : dashboard.progress.trend === 'down'
        ? 'Giảm nhẹ'
        : 'Ổn định';

  const bannerStats = [
    { label: 'Phiên đã lưu', value: dashboard.overview.totalSessions },
    { label: 'Phút hôm nay', value: dashboard.overview.minutesToday },
    { label: 'Điểm gần đây', value: `${averageRecentScore}/100` }
  ];

  const quickActions = [
    {
      title: 'Luyện ngay',
      description: 'Mở phòng thoại hoặc ghi âm một phiên mới.',
      to: '/practice',
      icon: Mic2
    },
    {
      title: 'Phân tích CV',
      description: 'Sinh câu hỏi và lộ trình luyện tập từ hồ sơ.',
      to: '/cv',
      icon: Bot
    },
    {
      title: 'Hoàn thiện hồ sơ',
      description: 'Cập nhật ngữ cảnh để AI cá nhân hóa tốt hơn.',
      to: '/profile',
      icon: UserRound
    }
  ] as const;

  const snapshotStats = [
    { label: 'Phút tuần này', value: `${dashboard.progress.thisWeekMinutes} phút` },
    { label: 'So với tuần trước', value: weeklyDelta },
    { label: 'Nhịp hiện tại', value: trendLabel }
  ];

  const commandSummary = topGoal
    ? `Ưu tiên hôm nay là "${topGoal.title}". Hoàn tất để giữ nhịp luyện tập trong ngày.`
    : 'Bạn đã hoàn tất toàn bộ mục tiêu ngày. Có thể mở thêm một phiên để tăng chất lượng luyện tập.';

  return (
    <div className="page-stack dashboard-rebuild-shell">
      {error ? <p className="error-text">{error}</p> : null}

      <section className="panel-card dashboard-rebuild-hero">
        <div className="dashboard-rebuild-hero-copy">
          <p className="eyebrow">Bảng điều khiển</p>
          <h3>Trung tâm luyện tập</h3>
          <p>{commandSummary}</p>

          <div className="dashboard-rebuild-hero-actions">
            {quickActions.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.title} to={item.to} className="dashboard-rebuild-launch">
                  <span className="dashboard-rebuild-launch-icon">
                    <Icon size={18} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              );
            })}
          </div>
        </div>

        <aside className="dashboard-rebuild-hero-side">
          <div className="dashboard-rebuild-focus">
            <div className="dashboard-rebuild-focus-top">
              <p className="eyebrow">Mục tiêu hôm nay</p>
              <span className="badge-soft">
                <Target size={14} />
                {completedGoals}/{dashboard.user.dailyGoals.length}
              </span>
            </div>
            <h4>{topGoal ? topGoal.title : 'Đã hoàn tất mọi mục tiêu'}</h4>
            <div className="priority-progress">
              <span style={{ width: `${topGoalProgress}%` }} />
            </div>
            <div className="dashboard-rebuild-focus-meta">
              <span>{topGoal ? `${topGoal.current}/${topGoal.target}` : 'Hoàn tất'}</span>
              <strong>
                {topGoal ? `+${topGoal.rewardXp} XP${topGoal.rewardEnergy ? ` • +${topGoal.rewardEnergy} NL` : ''}` : 'Đã nhận'}
              </strong>
            </div>
          </div>

          <div className="dashboard-rebuild-statline">
            {bannerStats.map((item) => (
              <article key={item.label} className="dashboard-rebuild-stat">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="dashboard-rebuild-main">
        <article className="panel-card dashboard-rebuild-missions">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Mục tiêu ngày</p>
              <h3>Danh sách cần hoàn thành</h3>
            </div>
            <span className="badge-soft">
              <Sparkles size={14} />
              {openGoals} nhiệm vụ mở
            </span>
          </div>

          <div className="dashboard-rebuild-goal-list">
            {dashboard.user.dailyGoals.map((goal) => {
              const progress = getGoalProgress(goal);
              return (
                <div key={goal.key} className="dashboard-rebuild-goal-row">
                  <div className="dashboard-rebuild-goal-copy">
                    <div className="dashboard-rebuild-goal-head">
                      <h4>{goal.title}</h4>
                      <span className={`status-badge ${goal.claimed ? 'dark' : goal.completed ? 'success' : 'pending'}`}>
                        {goal.claimed ? 'Đã nhận' : goal.completed ? 'Sẵn sàng' : `${goal.current}/${goal.target}`}
                      </span>
                    </div>
                    <p>{goal.description}</p>
                    <div className="goal-progress-track">
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <div className="goal-card-meta">
                      <span className="tag-chip">+{goal.rewardXp} XP</span>
                      {goal.rewardEnergy > 0 ? <span className="tag-chip">+{goal.rewardEnergy} năng lượng</span> : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    className={goal.claimed ? 'ghost-button' : 'primary-button'}
                    disabled={!goal.completed || goal.claimed}
                    onClick={() => handleClaimGoal(goal.key)}
                  >
                    {goal.claimed ? 'Đã nhận' : goal.completed ? 'Nhận thưởng' : 'Đang làm'}
                  </button>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel-card dashboard-rebuild-sideboard">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Nhìn nhanh</p>
              <h3>Trạng thái tuần này</h3>
            </div>
            <span className="badge-soft">
              <Award size={14} />
              {averageRecentScore}/100
            </span>
          </div>

          <div className="dashboard-rebuild-snapshot">
            {snapshotStats.map((item) => (
              <article key={item.label} className="dashboard-rebuild-snapshot-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>

          <div className="dashboard-rebuild-leaderboard">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Bảng xếp hạng</p>
                <h3>Top XP tuần</h3>
              </div>
            </div>

            {dashboard.leaderboard.length ? (
              <div className="leaderboard-list leaderboard-list-enhanced leaderboard-list-pro">
                {dashboard.leaderboard.map((entry) => (
                  <div key={entry.id} className="leaderboard-row leaderboard-row-enhanced leaderboard-row-compact leaderboard-row-elite">
                    <strong>#{entry.rank}</strong>
                    <div>
                      <p>{entry.name}</p>
                      <span>{entry.targetRole || 'Chưa cập nhật vai trò'}</span>
                    </div>
                    <div className="leaderboard-meta">
                      <span>{entry.weeklyXp} XP</span>
                      <span>{entry.streak} ngày</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-text">Chưa có dữ liệu xếp hạng.</p>
            )}
          </div>
        </article>
      </section>

      <section className="panel-card dashboard-rebuild-analytics">
        <div className="dashboard-rebuild-analytics-head">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Phân tích tuần</p>
              <h3>Tiến độ và chất lượng luyện tập</h3>
            </div>
            <span className="badge-soft">
              <TrendingUp size={14} />
              {weeklyDelta}
            </span>
          </div>

          <div className="dashboard-rebuild-analytics-note">
            <span>Phiên gần nhất</span>
            <strong>{latestSession ? latestSession.topic : 'Chưa có phiên nào'}</strong>
          </div>
        </div>

        <div className="dashboard-rebuild-chart-grid">
          <article className="dashboard-rebuild-chart-card">
            <p className="eyebrow">Thời lượng 7 ngày</p>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dashboard.weeklyTimeline}>
                  <defs>
                    <linearGradient id="minutesFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#34d6ff" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#34d6ff" stopOpacity={0.06} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#d9e7f4" strokeDasharray="4 4" />
                  <XAxis dataKey="day" stroke="#526477" />
                  <YAxis stroke="#526477" />
                  <Tooltip />
                  <Area type="monotone" dataKey="minutes" stroke="#34d6ff" fill="url(#minutesFill)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="dashboard-rebuild-chart-card">
            <p className="eyebrow">XP theo ngày</p>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dashboard.weeklyTimeline}>
                  <CartesianGrid stroke="#d9e7f4" strokeDasharray="4 4" />
                  <XAxis dataKey="day" stroke="#526477" />
                  <YAxis stroke="#526477" />
                  <Tooltip />
                  <Bar dataKey="xp" fill="#7b61ff" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </div>
      </section>

      <section className="panel-card dashboard-rebuild-history">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">Phiên gần đây</p>
            <h3>Lịch sử luyện tập</h3>
          </div>
        </div>

        <div className="dashboard-rebuild-history-list">
          {dashboard.recentSessions.length ? (
            dashboard.recentSessions.map((session) => (
              <article key={session.id} className="dashboard-rebuild-history-item">
                <div className="dashboard-rebuild-history-main">
                  <div className="session-card-tags">
                    <span className="tag-chip">{session.practiceType === 'presentation' ? 'Thuyết trình' : 'Phỏng vấn'}</span>
                    <span className="tag-chip">{formatDifficulty(session.difficulty)}</span>
                    <span className="tag-chip">{Math.round(session.durationSeconds)} giây</span>
                  </div>
                  <h4>{session.topic}</h4>
                  <p>{formatSessionDate(session.createdAt)}</p>
                </div>

                <div className="dashboard-rebuild-history-side">
                  <strong>{session.totalScore}/100</strong>
                  <span>+{session.xpEarned} XP</span>
                </div>
              </article>
            ))
          ) : (
            <p className="muted-text">Chưa có phiên luyện nào được lưu.</p>
          )}
        </div>
      </section>
    </div>
  );
}
