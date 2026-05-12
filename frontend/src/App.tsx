import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ThemeToggle } from './components/ThemeToggle';
import { useAuth } from './context/AuthContext';
import { AdminCoursesPage } from './pages/AdminCoursesPage';
import { AdminPage } from './pages/AdminPage';
import { CoursesPage } from './pages/CoursesPage';
import { CvAnalyzerPage } from './pages/CvAnalyzerPage';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { PracticePage } from './pages/PracticePage';
import { ProfilePage } from './pages/ProfilePage';
import { RegisterPage } from './pages/RegisterPage';

function HomeRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="full-page-loader">SpeakAI đang tải dữ liệu...</div>;
  }

  return user ? <Navigate to="/dashboard" replace /> : <LandingPage />;
}

function AuthThemeToggle() {
  const location = useLocation();
  const shouldShow = ['/login', '/register', '/forgot-password'].includes(location.pathname);

  return shouldShow ? <ThemeToggle variant="floating" /> : null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthThemeToggle />
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/cv" element={<CvAnalyzerPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute adminOnly />}>
          <Route element={<AppShell />}>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/courses" element={<AdminCoursesPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
