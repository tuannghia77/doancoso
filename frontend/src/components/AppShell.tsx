import {
  ArrowRight,
  BookOpen,
  Bot,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Mic,
  ShieldCheck,
  Sparkles,
  UserCircle2,
  Zap
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/courses', label: 'Khóa học', icon: BookOpen },
  { to: '/practice', label: 'Luyện tập AI', icon: Mic },
  { to: '/cv', label: 'Phân tích CV', icon: Bot },
  { to: '/profile', label: 'Hồ sơ cá nhân', icon: UserCircle2 }
];

const pageMeta = {
  '/dashboard': {
    label: 'Tổng quan',
    title: 'Tổng quan luyện tập',
    caption: 'Toàn bộ tiến độ trong một nơi'
  },
  '/courses': {
    label: 'Khóa học',
    title: 'Thư viện khóa học',
    caption: 'Gửi yêu cầu học và xem nội dung sau khi được duyệt'
  },
  '/practice': {
    label: 'Luyện tập',
    title: 'Luyện tập AI',
    caption: 'Phòng thoại, ghi âm và chấm điểm'
  },
  '/cv': {
    label: 'CV',
    title: 'Phòng CV',
    caption: 'CV thành dữ liệu luyện tập'
  },
  '/profile': {
    label: 'Hồ sơ',
    title: 'Hồ sơ cá nhân',
    caption: 'Ngữ cảnh cho AI'
  },
  '/admin': {
    label: 'Quản trị',
    title: 'Quản trị hệ thống',
    caption: 'Điều hành và theo dõi toàn bộ'
  },
  '/admin/courses': {
    label: 'Quản trị khóa học',
    title: 'Quản trị khóa học',
    caption: 'Tạo khóa học và duyệt yêu cầu học viên'
  }
} as const;

const getRouteKey = (pathname: string) => {
  if (pathname.startsWith('/admin/courses')) return 'admin-courses';
  if (pathname.startsWith('/courses')) return 'courses';
  if (pathname.startsWith('/practice')) return 'practice';
  if (pathname.startsWith('/cv')) return 'cv';
  if (pathname.startsWith('/profile')) return 'profile';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'dashboard';
};

const getPageMeta = (pathname: string) => {
  if (pathname.startsWith('/admin/courses')) return pageMeta['/admin/courses'];
  if (pathname.startsWith('/courses')) return pageMeta['/courses'];
  if (pathname.startsWith('/practice')) return pageMeta['/practice'];
  if (pathname.startsWith('/cv')) return pageMeta['/cv'];
  if (pathname.startsWith('/profile')) return pageMeta['/profile'];
  if (pathname.startsWith('/admin')) return pageMeta['/admin'];
  return pageMeta['/dashboard'];
};

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';
  const meta = getPageMeta(location.pathname);
  const routeKey = getRouteKey(location.pathname);
  const roleLabel = isAdmin ? 'Quản trị viên' : 'Học viên';
  const roleSubtitle = isAdmin
    ? user?.isRootAdmin
      ? 'Quản trị viên gốc'
      : 'Điều hành hệ thống'
    : user?.targetRole || 'Lộ trình cá nhân';
  const todayLabel = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit'
  }).format(new Date());

  const quickSignals = [
    `Chuỗi ${user?.streak ?? 0} ngày`,
    `${user?.weeklyXp ?? 0} XP tuần`,
    `${user?.energy ?? 0}/5 năng lượng`
  ];

  return (
    <div className={`app-shell workspace-overhaul app-shell-${routeKey}`}>
      <aside className="sidebar-card workspace-rail">
        <div className="workspace-rail-section workspace-rail-brand">
          <span className="workspace-rail-mark">SA</span>
          <div>
            <p className="eyebrow">SpeakAI</p>
            <h1>Studio</h1>
          </div>
        </div>

        <div className="workspace-rail-section workspace-rail-account">
          <div className="workspace-rail-account-head">
            <div>
              <p className="eyebrow">Tài khoản hiện tại</p>
              <h2>{roleLabel}</h2>
            </div>
            <span className="workspace-summary-level">Cấp {user?.level ?? 1}</span>
          </div>

          <p className="workspace-rail-subtitle">{roleSubtitle}</p>

          <div className="workspace-rail-signal-list">
            {quickSignals.map((item) => (
              <span key={item} className="workspace-rail-signal">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="workspace-rail-section workspace-rail-navigation">
          <p className="side-label">Điều hướng</p>
          <nav className="side-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}

            {isAdmin ? (
              <NavLink to="/admin" className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}>
                <ShieldCheck size={18} />
                <span>Quản trị hệ thống</span>
              </NavLink>
            ) : null}

            {isAdmin ? (
              <NavLink to="/admin/courses" className={({ isActive }) => `nav-pill${isActive ? ' active' : ''}`}>
                <BookOpen size={18} />
                <span>Quản trị khóa học</span>
              </NavLink>
            ) : null}
          </nav>
        </div>

        <div className="workspace-rail-section workspace-rail-actions">
          <Link to="/practice" className="primary-button large-button sidebar-primary-action">
            <Sparkles size={16} />
            Luyện ngay
          </Link>
          <Link to="/cv" className="ghost-button large-button sidebar-secondary-action">
            <Zap size={16} />
            Tối ưu CV
          </Link>
          <button type="button" className="ghost-button sidebar-logout" onClick={logout}>
            <LogOut size={16} />
            Đăng xuất
          </button>
        </div>

        <div className="workspace-rail-section workspace-rail-footer">
          <p className="eyebrow">SpeakAI</p>
          <h3>Luyện nói, phân tích CV, học khóa học và theo dõi tiến độ trong một nền tảng.</h3>
          <Link to="/courses" className="workspace-support-link">
            Mở thư viện học
            <ArrowRight size={15} />
          </Link>
        </div>
      </aside>

      <div className="main-column workspace-stage">
        <header className="topbar-card workspace-stage-header">
          <div className="workspace-stage-title">
            <p className="eyebrow">{meta.label}</p>
            <h2>{meta.title}</h2>
            <p>{meta.caption}</p>
          </div>

          <div className="workspace-stage-tools">
            <ThemeToggle />

            <Link to="/practice" className="topbar-command-pill">
              <Sparkles size={16} />
              <span>Mở phiên luyện</span>
            </Link>

            <div className="workspace-stage-chip">
              <CalendarDays size={16} />
              <div>
                <span>Hôm nay</span>
                <strong>{todayLabel}</strong>
              </div>
            </div>
          </div>
        </header>

        <section className="workspace-stage-body">
          <main className="main-content">
            <Outlet />
          </main>
        </section>
      </div>
    </div>
  );
}
