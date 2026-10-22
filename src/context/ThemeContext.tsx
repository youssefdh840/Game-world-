import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'navy' | 'black';

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  isPureBlack: boolean;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'mapia_theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'black' || saved === 'pure_black') {
          return 'black';
        }
        if (saved === 'navy' || saved === 'dark') {
          return 'navy';
        }
      } catch {
        // ignore
      }
    }
    // Default to Classic Navy as per specifications
    return 'navy';
  });

  const applyThemeToDOM = (mode: ThemeMode) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const body = document.body;

    // Both themes are dark aesthetics; remove light mode completely
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.colorScheme = 'dark';

    if (mode === 'black') {
      root.classList.add('theme-black');
      root.classList.remove('theme-navy');
      root.style.backgroundColor = '#000000';
      body.style.backgroundColor = '#000000';
      body.classList.remove('bg-[#0B0F19]', 'bg-slate-50', 'text-slate-900');
      body.classList.add('bg-black', 'text-white');
    } else {
      root.classList.add('theme-navy');
      root.classList.remove('theme-black');
      root.style.backgroundColor = '#0B0F19';
      body.style.backgroundColor = '#0B0F19';
      body.classList.remove('bg-black', 'bg-slate-50', 'text-slate-900');
      body.classList.add('bg-[#0B0F19]', 'text-slate-100');
    }

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', mode === 'black' ? '#000000' : '#0B0F19');
    }

    try {
      window.dispatchEvent(new CustomEvent('mapia_theme_change', { detail: { theme: mode } }));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    applyThemeToDOM(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'navy' ? 'black' : 'navy'));
  };

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: true, // both Classic Navy and Pure Black are dark gaming themes
        isPureBlack: theme === 'black',
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
