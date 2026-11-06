import { Platform } from 'react-native';

/**
 * Оформление «тетрадь в клетку»: пулю всегда рисовали ручкой на тетрадном листе,
 * поэтому стол — это лист, а не зелёное сукно.
 */
export const PAPER = '#f6f1e3';
export const GRID = '#cdd9ec';
export const MARGIN = '#e3a5a0'; // поля тетради
export const INK = '#26398a'; // шариковая ручка
export const RED = '#b3261e'; // красная ручка
export const PENCIL = '#7a7264';
export const CELL = 18; // шаг клетки

export const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });
