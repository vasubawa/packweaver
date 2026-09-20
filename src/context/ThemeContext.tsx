import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ThemeMode = 'light' | 'dark';
type AccentColor = 'packweaver' | 'modrinth' | 'curseforge' | 'deepslate';

interface ThemeContextType {
  theme: ThemeMode;
  accent: AccentColor;
  setTheme: (theme: ThemeMode) => void;
  setAccent: (accent: AccentColor) => void;
  toggleTheme: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface AccentDefinition {
  primary: string;
  hover: string;
  soft: string;
}

const ACCENT_MAP: Record<ThemeMode, Record<AccentColor, AccentDefinition>> = {
  light: {
    packweaver: { primary: '#d97355', hover: '#c55a3a', soft: 'rgba(217,115,85,0.1)' },
    modrinth: { primary: '#16a34a', hover: '#15803d', soft: 'rgba(22,163,74,0.1)' },
    curseforge: { primary: '#ea580c', hover: '#c2410c', soft: 'rgba(234,88,12,0.1)' },
    deepslate: { primary: '#64748b', hover: '#475569', soft: 'rgba(100,116,139,0.1)' },
  },
  dark: {
    packweaver: { primary: '#e6826a', hover: '#f0ad9c', soft: '#2d1f1a' },
    modrinth: { primary: '#1bd96a', hover: '#4ade80', soft: 'rgba(27,217,106,0.12)' },
    curseforge: { primary: '#f16436', hover: '#fb8a63', soft: 'rgba(241,100,54,0.12)' },
    deepslate: { primary: '#94a3b8', hover: '#cbd5e1', soft: 'rgba(148,163,184,0.12)' },
  },
};

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

function isAccentColor(value: string | null): value is AccentColor {
  return (
    value === 'packweaver' ||
    value === 'modrinth' ||
    value === 'curseforge' ||
    value === 'deepslate'
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme');
    return isThemeMode(saved) ? saved : 'dark';
  });

  const [accent, setAccentState] = useState<AccentColor>(() => {
    const saved = localStorage.getItem('accent');
    return isAccentColor(saved) ? saved : 'packweaver';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const colors = ACCENT_MAP[theme][accent];
    document.documentElement.style.setProperty('--accent', colors.primary);
    document.documentElement.style.setProperty('--accent-hover', colors.hover);
    document.documentElement.style.setProperty('--accent-soft', colors.soft);
    localStorage.setItem('accent', accent);
  }, [accent, theme]);

  const toggleTheme = () => setThemeState(t => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider
      value={{ theme, accent, setTheme: setThemeState, setAccent: setAccentState, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
