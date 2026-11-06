import { SUITS, Suit } from './cards';
import { RulesConfig } from './config';

export type Level = 6 | 7 | 8 | 9 | 10;
export type TrumpSuit = Suit | 'NT';
export const TRUMP_ORDER: readonly TrumpSuit[] = [...SUITS, 'NT'];
export const LEVELS: readonly Level[] = [6, 7, 8, 9, 10];

export type Contract =
  | { kind: 'tricks'; level: Level; suit: TrumpSuit }
  | { kind: 'misere' };

/**
 * Старшинство заявок: 6♠ < 6♣ < 6♦ < 6♥ < 6БК < 7♠ < ... < 10БК.
 * Мизер старше 8БК (ранг 14) и младше 9♠ (ранг 15) — отсюда 14.5.
 */
export function contractRank(c: Contract): number {
  if (c.kind === 'misere') return 14.5;
  return (c.level - 6) * 5 + TRUMP_ORDER.indexOf(c.suit);
}

export function contractPrice(c: Contract, cfg: RulesConfig): number {
  return c.kind === 'misere' ? cfg.misereValue : cfg.contractPrice[c.level - 6]!;
}

export function sameContract(a: Contract, b: Contract): boolean {
  if (a.kind === 'misere' || b.kind === 'misere') return a.kind === b.kind;
  return a.level === b.level && a.suit === b.suit;
}

/** Все заявки по возрастанию старшинства (включая мизер). */
export function allContracts(): Contract[] {
  const list: Contract[] = [];
  for (const level of LEVELS) for (const suit of TRUMP_ORDER) list.push({ kind: 'tricks', level, suit });
  list.push({ kind: 'misere' });
  return list.sort((a, b) => contractRank(a) - contractRank(b));
}

export function contractLabel(c: Contract): string {
  if (c.kind === 'misere') return 'Мизер';
  const sym = { S: '♠', C: '♣', D: '♦', H: '♥', NT: 'БК' }[c.suit];
  return `${c.level}${sym}`;
}

/** Козырная масть игры или null (без козыря / мизер / распасы). */
export function trumpOf(c: Contract | null): Suit | null {
  if (!c || c.kind === 'misere' || c.suit === 'NT') return null;
  return c.suit;
}
