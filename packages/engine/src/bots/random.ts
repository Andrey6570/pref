import { Card } from '../cards';
import { contractRank } from '../contracts';
import { legalBids, legalCards, PlayerView } from '../engine';
import { Rng } from '../rng';
import { Action, Seat } from '../types';

export type Bot = (view: PlayerView) => Action;

/** Базовый уровень для сравнений: ходит легально, но без мысли. */
export function randomBot(rng: Rng): Bot {
  const pick = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)]!;
  return (v) => {
    const seat = v.seat;
    switch (v.phase) {
      case 'auction': {
        const bids = legalBids(v.auction, seat, v.cfg);
        // Часто пасует, иногда заявляет самую младшую заявку.
        if (!bids.length || rng() < 0.75) return { type: 'pass', seat };
        return { type: 'bid', seat, contract: bids.reduce((a, b) => (contractRank(a) <= contractRank(b) ? a : b)) };
      }
      case 'discard': {
        const hand = v.hands[seat]!;
        const a = pick(hand);
        const b = pick(hand.filter((c) => c !== a));
        return { type: 'discard', seat, cards: [a, b] as [Card, Card], contract: v.winningBid! };
      }
      case 'whist':
        return { type: 'whist', seat, choice: rng() < 0.5 ? 'whist' : 'pass' };
      default: {
        const p = v.play!;
        const hand = v.hands[p.turn as Seat]!;
        return { type: 'play', seat: p.turn, card: pick(legalCards(hand, p)) };
      }
    }
  };
}
