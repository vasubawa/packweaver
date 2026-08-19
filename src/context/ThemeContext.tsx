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

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const ACCENT_MAP: Record<AccentColor, { primary: string; hover: string; soft: string }> = {
  packweaver: { primary: '#d97355', hover: '#c55a3a', soft: 'rgba(217,115,85,0.08)' },
  modrinth: { primary: '#1bd96a', hover: '#18c45e', soft: 'rgba(27,217,106,0.08)' },
  curseforge: { primary: '#f16436', hover: '#d95a30', soft: 'rgba(241,100,54,0.08)' },
  deepslate: { primary: '#64748b', hover: '#475569', soft: 'rgba(100,116,139,0.08)' },
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as ThemeMode) || 'dark';
  });
  
  const [accent, setAccentState] = useState<AccentColor>(() => {
    const saved = localStorage.getItem('accent');
    return (saved as AccentColor) || 'packweaver';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const colors = ACCENT_MAP[accent];
    document.documentElement.style.setProperty('--accent', colors.primary);
    document.documentElement.style.setProperty('--accent-hover', colors.hover);
    document.documentElement.style.setProperty('--accent-soft', colors.soft);
    localStorage.setItem('accent', accent);
  }, [accent]);

  const toggleTheme = () => setThemeState(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, accent, setTheme: setThemeState, setAccent: setAccentState, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
