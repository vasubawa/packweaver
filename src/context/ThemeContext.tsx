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
    packweaver: { primary: '#b86b2c', hover: '#9a5824', soft: '#f3e8dc' },
    modrinth: { primary: '#15803d', hover: '#166534', soft: 'rgba(21,128,61,0.1)' },
    curseforge: { primary: '#c2410c', hover: '#9a3412', soft: 'rgba(194,65,12,0.1)' },
    deepslate: { primary: '#5c6570', hover: '#3d4656', soft: 'rgba(92,101,112,0.1)' },
  },
  dark: {
    packweaver: { primary: '#e09a5a', hover: '#ebb07a', soft: '#2a2118' },
    modrinth: { primary: '#1bd96a', hover: '#4ade80', soft: 'rgba(27,217,106,0.12)' },
    curseforge: { primary: '#f16436', hover: '#fb8a63', soft: 'rgba(241,100,54,0.12)' },
    deepslate: { primary: '#8b95a3', hover: '#b8c0cc', soft: 'rgba(139,149,163,0.12)' },
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
