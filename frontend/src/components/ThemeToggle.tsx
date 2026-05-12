import { Moon, Sun } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';

type ThemeToggleProps = {
  variant?: 'inline' | 'floating';
};

export function ThemeToggle({ variant = 'inline' }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle-${variant}${isDark ? ' is-dark' : ''}`}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb">
          <Icon size={15} />
        </span>
      </span>
      <span className="theme-toggle-label">{isDark ? 'Tối' : 'Sáng'}</span>
    </button>
  );
}
