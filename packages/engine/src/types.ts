import { Card, Suit } from './cards';
import { RulesConfig } from './config';
import { Contract } from './contracts';

export type Seat = 0 | 1 | 2;
export const nextSeat = (s: Seat): Seat => (((s + 1) % 3) as Seat);
export const prevSeat = (s: Seat): Seat => (((s + 2) % 3) as Seat);

export type Phase = 'auction' | 'discard' | 'whist' | 'play' | 'dealEnd' | 'bulletEnd';
export type DealMode = 'auction' | 'tricks' | 'misere' | 'raspasy' | 'noPlay';

export interface Auction {
  turn: Seat;
  high: Contract | null;
  highBidder: Seat | null;
  passed: boolean[];
  /** Делал ли игрок хотя бы одну заявку (нужно для правила «мизер только первым словом»). */
  spoke: boolean[];
}

export interface TrickCard {
  seat: Seat;
  card: Card;
}

export interface Play {
  trick: TrickCard[];
  /** Открытая карта прикупа, задающая масть (распасы Сочи). Участвует только в определении масти. */
  exposed: Card | null;
  /** Кто ходит первым в текущей взятке. */
  leader: Seat;
  turn: Seat;
  trickNo: number;
  /** Взятки по местам (по рукам, а не по игрокам). */
  won: number[];
  trump: Suit | null;
  /** Все карты, выложенные на стол (в том числе открытые карты прикупа). */
  seen: Card[];
  /** Последняя завершённая взятка: её можно показать игроку. */
  last: { cards: TrickCard[]; winner: Seat } | null;
}

export interface DealResult {
  mode: DealMode;
  declarer: Seat | null;
  contract: Contract | null;
  whisters: Seat[];
  tricks: number[];
  /** Дельты, добавленные к общему счёту этой раздачей. */
  pulya: number[];
  gora: number[];
  whists: number[][];
  notes: string[];
}

export interface Deal {
  dealer: Seat;
  hands: Card[][];
  talon: Card[];
  discard: Card[];
  auction: Auction;
  declarer: Seat | null;
  winningBid: Contract | null;
  contract: Contract | null;
  whistChoice: (('whist' | 'pass') | null)[];
  whistTurn: Seat | null;
  whisters: Seat[];
  /** Пасующий при единственном вистующем: его карты открыты и ими ходит вистующий. ASSUMPTION, см. SPEC. */
  passer: Seat | null;
  mode: DealMode;
  play: Play | null;
}

export interface Settlement {
  /** Висты i против j с учётом распределения горы. */
  whists: number[][];
  pulya: number[];
  gora: number[];
  /** Итог каждого игрока; сумма равна нулю. */
  balance: number[];
}

export interface Game {
  cfg: RulesConfig;
  seed: number;
  dealNo: number;
  phase: Phase;
  pulya: number[];
  gora: number[];
  whists: number[][];
  raspasyStreak: number;
  deal: Deal;
  results: DealResult[];
  settlement: Settlement | null;
}

export type Action =
  | { type: 'bid'; seat: Seat; contract: Contract }
  | { type: 'pass'; seat: Seat }
  | { type: 'discard'; seat: Seat; cards: [Card, Card]; contract: Contract }
  | { type: 'whist'; seat: Seat; choice: 'whist' | 'pass' }
  /** seat — рука, из которой ходят (при открытой руке пасующего ходит вистующий). */
  | { type: 'play'; seat: Seat; card: Card }
  | { type: 'next' };
