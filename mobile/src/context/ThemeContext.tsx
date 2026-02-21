import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ThemeColors {
  // surfaces
  bg: string;
  bgAlt: string;
  card: string;
  cardAlt: string;
  // borders
  border: string;
  borderFaint: string;
  inputBorder: string;
  // typography
  text: string;
  textSub: string;
  textMuted: string;
  // brand
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryMid: string;
  // semantic
  danger: string;
  dangerDark: string;
  dangerBg: string;
  warning: string;
  warningDark: string;
  warningBg: string;
  info: string;
  infoBg: string;
  // karma
  upvote: string;
  downvote: string;
  // misc
  inputBg: string;
  tabBar: string;
  headerBg: string;
  shadow: string;
  overlay: string;
}

const light: ThemeColors = {
  bg: '#f6f8fc',
  bgAlt: '#eef2f7',
  card: '#ffffff',
  cardAlt: '#f8fafc',
  border: '#e2e8f0',
  borderFaint: '#f1f5f9',
  inputBorder: '#cbd5e1',
  text: '#0f172a',
  textSub: '#475569',
  textMuted: '#94a3b8',
  primary: '#16a34a',
  primaryDark: '#14532d',
  primaryLight: '#dcfce7',
  primaryMid: '#86efac',
  danger: '#dc2626',
  dangerDark: '#7f1d1d',
  dangerBg: '#fef2f2',
  warning: '#d97706',
  warningDark: '#78350f',
  warningBg: '#fffbeb',
  info: '#2563eb',
  infoBg: '#eff6ff',
  upvote: '#ea580c',
  downvote: '#7c3aed',
  inputBg: '#f8fafc',
  tabBar: '#ffffff',
  headerBg: '#ffffff',
  shadow: '#94a3b8',
  overlay: 'rgba(15,23,42,0.55)',
};

const dark: ThemeColors = {
  bg: '#080e1c',
  bgAlt: '#0d1526',
  card: '#101827',
  cardAlt: '#0d1526',
  border: '#1a2740',
  borderFaint: '#111d32',
  inputBorder: '#1e3050',
  text: '#e2e8f0',
  textSub: '#94a3b8',
  textMuted: '#4a637d',
  primary: '#22c55e',
  primaryDark: '#86efac',
  primaryLight: '#052e16',
  primaryMid: '#166534',
  danger: '#f87171',
  dangerDark: '#fca5a5',
  dangerBg: '#1a0808',
  warning: '#fbbf24',
  warningDark: '#fde68a',
  warningBg: '#1a1204',
  info: '#60a5fa',
  infoBg: '#070f1e',
  upvote: '#fb923c',
  downvote: '#a78bfa',
  inputBg: '#080e1c',
  tabBar: '#101827',
  headerBg: '#101827',
  shadow: '#000000',
  overlay: 'rgba(0,0,0,0.8)',
};

interface ThemeContextType {
  isDark: boolean;
  colors: ThemeColors;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  colors: light,
  toggle: () => {},
});

const KEY = '@theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'light' || v === 'dark') setMode(v);
    });
  }, []);

  const isDark = mode !== null ? mode === 'dark' : system === 'dark';
  const colors = isDark ? dark : light;

  const toggle = async () => {
    const next: 'light' | 'dark' = isDark ? 'light' : 'dark';
    setMode(next);
    await AsyncStorage.setItem(KEY, next);
  };

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
