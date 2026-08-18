import * as SQLite from 'expo-sqlite';

export type ThemeName = 'warm' | 'classic';

export const THEME_OPTIONS: { name: ThemeName; label: string; swatch: string }[] = [
  { name: 'classic', label: 'Ocean Blue & Emerald', swatch: '#34D399' },
  { name: 'warm', label: 'Amber & Terracotta', swatch: '#F5A524' },
];

const palettes: Record<ThemeName, Record<string, string>> = {
  // Default: warm bar-lighting feel (amber / terracotta on deep espresso)
  warm: {
    bg: '#1B140F',
    surface: '#241A13',
    surfaceAlt: '#2F2116',
    border: '#3D2C1F',

    brandBlue: '#D9480F', // "terracotta"
    brandBlueDark: '#7C2D12',
    brandGreen: '#F5A524', // "amber"
    brandGreenDark: '#B45309',

    primary: '#F5A524',
    primaryDark: '#B45309',
    secondary: '#D9480F',
    secondaryDark: '#7C2D12',

    success: '#65A30D',
    danger: '#E5484D',
    warning: '#F2B90C',

    text: '#FBF3EA',
    textMuted: '#C9B8A8',
    textFaint: '#8A7364',
  },
  // Logo-matched: near-black slate navy with the exact blue -> green gradient
  // from the StockMate mark itself, instead of a generic navy/mint pairing.
  classic: {
    bg: '#0A0F1C',
    surface: '#111827',
    surfaceAlt: '#16213A',
    border: '#22314A',

    brandBlue: '#2F6FED', // pulled from the top of the logo's "S"
    brandBlueDark: '#1D4FBF',
    brandGreen: '#34D399', // pulled from the logo's arrow / "Mate" wordmark
    brandGreenDark: '#059669',

    primary: '#34D399',
    primaryDark: '#059669',
    secondary: '#2F6FED',
    secondaryDark: '#1D4FBF',

    success: '#34D399',
    danger: '#E5484D',
    warning: '#F2B90C',

    text: '#F5F8FF',
    textMuted: '#9AA8C7',
    textFaint: '#5C6B8A',
  },
};

const gradientPalettes: Record<ThemeName, readonly [string, string]> = {
  warm: ['#D9480F', '#F5A524'],
  classic: ['#2F6FED', '#34D399'],
};

const SETTINGS_DB_NAME = 'stockmate_settings.db';

function ensureSettingsTable(db: SQLite.SQLiteDatabase) {
  db.execSync('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
}

/**
 * Reads the saved theme choice SYNCHRONOUSLY. This matters: every screen does
 * `import { colors } from '../utils/theme'` and then calls StyleSheet.create()
 * with colors.xxx baked in at module-load time. If this file's module body
 * hasn't finished running (and mutated `activeThemeName`/`colors` below)
 * before a screen's own StyleSheet.create() runs, that screen would be stuck
 * on stale colors until the JS bundle is torn down and restarted. Because
 * `import`/`require` is synchronous, doing this read here (before `colors` is
 * exported below) guarantees every importer sees the right palette.
 */
function loadStoredThemeName(): ThemeName {
  try {
    const db = SQLite.openDatabaseSync(SETTINGS_DB_NAME);
    ensureSettingsTable(db);
    const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['themeName']);
    if (row?.value === 'warm' || row?.value === 'classic') return row.value;
  } catch {
    // First run, or sync SQLite unavailable for some reason — fall back to default.
  }
  return 'classic';
}

export const activeThemeName: ThemeName = loadStoredThemeName();

export const colors = { ...palettes[activeThemeName] };

export const gradients = {
  brand: gradientPalettes[activeThemeName],
};

/**
 * Persists the chosen theme for next launch. Because of the module-load-time
 * constraint above, this does NOT repaint the currently running screens —
 * the caller should tell the user to fully close and reopen the app (not
 * just background/foreground it) to see the new palette everywhere.
 */
export function setThemePreference(name: ThemeName): void {
  try {
    const db = SQLite.openDatabaseSync(SETTINGS_DB_NAME);
    ensureSettingsTable(db);
    db.runSync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['themeName', name]
    );
  } catch {
    // Non-fatal — worst case the preference doesn't stick and it falls back to warm.
  }
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
};