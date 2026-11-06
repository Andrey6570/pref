import { Card, RANKS, sameCard, SUITS, Suit } from '../cards';
import {
  Contract, contractPrice, contractRank, LEVELS, TRUMP_ORDER, TrumpSuit, trumpOf,
} from '../contracts';
import { legalBids, legalCards, PlayerView } from '../engine';
import { Action, Play, Seat, TrickCard } from '../types';
import type { Bot } from './random';

/**
 * Бот v1: оценки по честным правилам без подглядывания, без перебора раскладов.
 * Это основа для замеров; следующий шаг — выборка скрытых раскладов (см. docs/SPEC.md).
 */
export interface BotParams {
  /** Поправка на улучшение руки от прикупа при оценке заявки. */
  talonBonus: number;
  /** Доля обязательных вистовых взяток, при которой бот решается вистовать. */
  whistFactor: number;
  /** Допустимое число «опасных» карт, чтобы заявить мизер. */
  misereDanger: number;
  /** Насколько высокой может быть карта на своей позиции в масти, чтобы не считаться опасной (меньше — строже). */
  misereSlack: number;
}
export const DEFAULT_PARAMS: BotParams = { talonBonus: 0, whistFactor: 0.4, misereDanger: 0, misereSlack: 0 };

const bySuit = (hand: Card[], s: Suit) => hand.filter((c) => c.suit === s).sort((a, b) => b.rank - a.rank);

/** Длина непрерывной цепочки старших карт масти, начиная с туза. */
function topSequence(cs: Card[]): number {
  let h = 0;
  let expect = 14;
  for (const c of cs) {
    if (c.rank !== expect) break;
    h++;
    expect--;
  }
  return h;
}

/** Грубая оценка числа взяток руки при заданном козыре («БК» — без козыря). */
export function estimateTricks(hand: Card[], trump: TrumpSuit): number {
  const trumpLen = trump === 'NT' ? 0 : bySuit(hand, trump).length;
  let est = 0;
  for (const suit of SUITS) {
    const cs = bySuit(hand, suit);
    const n = cs.length;
    const h = topSequence(cs);
    let t = h;
    const next = cs[h];
    if (next) {
      if (h === 0 && next.rank === 13 && n >= 2) t += 0.6; // король не один
      else if (h >= 1 && next.rank === 14 - h - 1 && n >= h + 2) t += 0.5; // цепочка с «дыркой»
    }
    if (trump === suit) {
      if (n >= 4) t += (n - 3) * 0.9;
      est += Math.min(t, n);
    } else if (trump === 'NT') {
      if (n >= 5 && h >= 1) t += (n - 4) * 0.6;
      est += Math.min(t, n);
    } else {
      est += Math.min(t, n);
      if (trumpLen >= 3 && n <= 2) est += (3 - n) * 0.35; // козыряние короткой масти
    }
  }
  return est;
}

/** Число карт, от которых в мизере трудно избавиться (чем больше, тем хуже рука). */
export function misereDanger(hand: Card[], slack = 2): number {
  let d = 0;
  for (const suit of SUITS) {
    const asc = bySuit(hand, suit).reverse();
    asc.forEach((c, k) => {
      if (c.rank - 7 > 2 * k + slack) d++;
    });
  }
  return d;
}

/** Оценка защиты: сколько взяток рука принесёт вистующему. */
function estimateDefense(hand: Card[], trump: Suit | null): number {
  let est = 0;
  for (const suit of SUITS) {
    const cs = bySuit(hand, suit);
    const h = topSequence(cs);
    let t = h;
    if (h === 0 && cs[0]?.rank === 13 && cs.length >= 2) t += 0.6;
    est += Math.min(t, cs.length) * (suit === trump ? 0.8 : 1);
  }
  return est;
}

// ───────────────────────── торговля, снос, вист ─────────────────────────

function chooseBid(v: PlayerView, p: BotParams): Action {
  const seat = v.seat;
  const hand = v.hands[seat]!;
  const bids = legalBids(v.auction, seat, v.cfg);
  const supported = bids.filter((c) =>
    c.kind === 'misere'
      ? misereDanger(hand, p.misereSlack) <= p.misereDanger
      : estimateTricks(hand, c.suit) + p.talonBonus >= c.level,
  );
  if (!supported.length) return { type: 'pass', seat };
  const lowest = supported.reduce((a, b) => (contractRank(a) <= contractRank(b) ? a : b));
  return { type: 'bid', seat, contract: lowest };
}

/** Ожидаемая выгода заявки при оценке взяток est (грубая сигмоида вероятности). */
function contractValue(c: Contract, est: number, v: PlayerView): number {
  if (c.kind === 'misere') return 0;
  const price = contractPrice(c, v.cfg);
  const prob = 1 / (1 + Math.exp(-(est - c.level + 0.3) / 0.8));
  return prob * price - (1 - prob) * price * Math.max(1, c.level - est);
}

function chooseDiscard(v: PlayerView): Action {
  const seat = v.seat;
  const hand = v.hands[seat]!;
  const bid = v.winningBid!;
  let best: { score: number; cards: [Card, Card]; contract: Contract } | null = null;

  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      const rest = hand.filter((_, k) => k !== i && k !== j);
      if (bid.kind === 'misere') {
        const score = -misereDanger(rest);
        if (!best || score > best.score) best = { score, cards: [hand[i]!, hand[j]!], contract: bid };
        continue;
      }
      for (const level of LEVELS) {
        for (const suit of TRUMP_ORDER) {
          const contract: Contract = { kind: 'tricks', level, suit };
          if (contractRank(contract) < contractRank(bid)) continue;
          const score = contractValue(contract, estimateTricks(rest, suit), v);
          if (!best || score > best.score) best = { score, cards: [hand[i]!, hand[j]!], contract };
        }
      }
    }
  }
  return { type: 'discard', seat, cards: best!.cards, contract: best!.contract };
}

function chooseWhist(v: PlayerView, p: BotParams): Action {
  const seat = v.seat;
  const c = v.contract!;
  if (c.kind !== 'tricks') return { type: 'whist', seat, choice: 'pass' };
  const need = v.cfg.requiredWhistTricks[c.level - 6]!;
  const est = estimateDefense(v.hands[seat]!, trumpOf(c));
  return { type: 'whist', seat, choice: est >= need * p.whistFactor ? 'whist' : 'pass' };
}

// ───────────────────────── розыгрыш ─────────────────────────

function currentBest(p: Play): TrickCard | null {
  if (!p.trick.length) return null;
  const leadSuit = p.exposed ? p.exposed.suit : p.trick[0]!.card.suit;
  const trumps = p.trump ? p.trick.filter((t) => t.card.suit === p.trump) : [];
  const pool = trumps.length ? trumps : p.trick.filter((t) => t.card.suit === leadSuit);
  return pool.length ? pool.reduce((b, t) => (t.card.rank > b.card.rank ? t : b)) : null;
}

const beats = (c: Card, best: TrickCard, trump: Suit | null): boolean =>
  (trump !== null && c.suit === trump && best.card.suit !== trump) ||
  (c.suit === best.card.suit && c.rank > best.card.rank);

const lowest = (cs: Card[]): Card => cs.reduce((a, b) => (a.rank <= b.rank ? a : b));
const highest = (cs: Card[]): Card => cs.reduce((a, b) => (a.rank >= b.rank ? a : b));

/** Карта самая старшая из ещё не сыгранных и не известных мне. */
function isMaster(c: Card, known: Card[]): boolean {
  return !RANKS.some((r) => r > c.rank && !known.some((k) => k.suit === c.suit && k.rank === r));
}

/** Играть, избегая взяток: мизер заказчика и распасы. */
function duckPlay(legal: Card[], hand: Card[], p: Play): Card {
  const leadSuit = p.exposed ? p.exposed.suit : p.trick[0]?.card.suit ?? null;
  if (!leadSuit) {
    // Заход: самая младшая карта, при равенстве — из длинной масти.
    return legal.reduce((a, b) => {
      if (a.rank !== b.rank) return a.rank < b.rank ? a : b;
      return hand.filter((c) => c.suit === a.suit).length >= hand.filter((c) => c.suit === b.suit).length ? a : b;
    });
  }
  const follow = legal.every((c) => c.suit === leadSuit);
  if (!follow) return highest(legal); // нет масти: сбрасываем самую опасную
  const best = currentBest(p);
  if (!best) return lowest(legal);
  const safe = legal.filter((c) => !beats(c, best, p.trump));
  return safe.length ? highest(safe) : highest(legal);
}

function playForTricks(v: PlayerView, hand: Card[], legal: Card[]): Card {
  const p = v.play!;
  const seat = p.turn;
  const myTeam = (s: Seat) => (seat === v.declarer ? s === v.declarer : s !== v.declarer);
  const known = [...p.seen, ...v.myDiscard, ...v.hands.flatMap((h) => h ?? [])];
  const cheapest = (cs: Card[]) => {
    // Сбрасываем самую младшую, предпочитая некозырные карты из короткой масти.
    const side = cs.filter((c) => c.suit !== p.trump);
    const pool = side.length ? side : cs;
    return pool.reduce((a, b) => {
      if (a.rank !== b.rank) return a.rank < b.rank ? a : b;
      return hand.filter((c) => c.suit === a.suit).length <= hand.filter((c) => c.suit === b.suit).length ? a : b;
    });
  };

  if (!p.trick.length && !p.exposed) {
    const masters = legal.filter((c) => isMaster(c, known));
    if (masters.length) {
      const trumpMasters = masters.filter((c) => c.suit === p.trump);
      const pool = trumpMasters.length ? trumpMasters : masters;
      return pool.reduce((a, b) =>
        hand.filter((c) => c.suit === a.suit).length >= hand.filter((c) => c.suit === b.suit).length ? a : b);
    }
    const side = legal.filter((c) => c.suit !== p.trump);
    const pool = side.length ? side : legal;
    const len = (c: Card) => hand.filter((x) => x.suit === c.suit).length;
    return pool.reduce((a, b) => (len(a) < len(b) || (len(a) === len(b) && a.rank < b.rank) ? a : b));
  }

  const best = currentBest(p);
  if (best && myTeam(best.seat)) return cheapest(legal); // своя взятка — не перебиваем
  const winners = best ? legal.filter((c) => beats(c, best, p.trump)) : legal;
  if (winners.length && best) return lowest(winners);
  return cheapest(legal);
}

function choosePlay(v: PlayerView): Action {
  const p = v.play!;
  const seat = p.turn;
  const hand = v.hands[seat]!;
  const legal = legalCards(hand, p);
  let card: Card;
  if (legal.length === 1) card = legal[0]!;
  else if (v.mode === 'raspasy') card = duckPlay(legal, hand, p);
  else if (v.mode === 'misere') card = seat === v.declarer ? duckPlay(legal, hand, p) : lowest(legal);
  else card = playForTricks(v, hand, legal);
  if (!legal.some((c) => sameCard(c, card))) throw new Error('bot picked an illegal card');
  return { type: 'play', seat, card };
}

export function heuristicBot(params: Partial<BotParams> = {}): Bot {
  const p = { ...DEFAULT_PARAMS, ...params };
  return (v) => {
    switch (v.phase) {
      case 'auction': return chooseBid(v, p);
      case 'discard': return chooseDiscard(v);
      case 'whist': return chooseWhist(v, p);
      case 'play': return choosePlay(v);
      default: throw new Error(`bot has nothing to do in phase ${v.phase}`);
    }
  };
}
