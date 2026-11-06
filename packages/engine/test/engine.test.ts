import { describe, expect, it } from 'vitest';
import {
  actingSeat, allContracts, apply, Card, contractRank, Contract, Deal, fullDeck, heuristicBot,
  legalBids, legalCards, legalPlays, newGame, Play, randomBot, scoreDeal, Seat, settle, SOCHI,
  trickWinner, viewFor, mulberry32, Game,
} from '../src';
import { playBullet } from '../src/sim';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });
const tricks = (level: 6 | 7 | 8 | 9 | 10, suit: 'S' | 'C' | 'D' | 'H' | 'NT'): Contract => ({ kind: 'tricks', level, suit });

describe('заявки', () => {
  it('порядок старшинства: масти, БК, мизер между 8БК и 9♠', () => {
    const list = allContracts();
    expect(list).toHaveLength(26);
    expect(contractRank(tricks(6, 'S'))).toBeLessThan(contractRank(tricks(6, 'C')));
    expect(contractRank(tricks(6, 'H'))).toBeLessThan(contractRank(tricks(6, 'NT')));
    expect(contractRank(tricks(6, 'NT'))).toBeLessThan(contractRank(tricks(7, 'S')));
    expect(contractRank(tricks(8, 'NT'))).toBeLessThan(contractRank({ kind: 'misere' }));
    expect(contractRank({ kind: 'misere' })).toBeLessThan(contractRank(tricks(9, 'S')));
  });
});

describe('сдача и торговля', () => {
  it('32 уникальные карты: 10+10+10 и прикуп из двух', () => {
    const g = newGame(SOCHI, 1);
    const all = [...g.deal.hands.flat(), ...g.deal.talon];
    expect(all).toHaveLength(32);
    expect(new Set(all.map((x) => `${x.suit}${x.rank}`)).size).toBe(32);
    expect(g.deal.hands.map((h) => h.length)).toEqual([10, 10, 10]);
    expect(fullDeck()).toHaveLength(32);
  });

  it('сдача воспроизводима по seed', () => {
    expect(newGame(SOCHI, 42).deal.hands).toEqual(newGame(SOCHI, 42).deal.hands);
    expect(newGame(SOCHI, 42).deal.hands).not.toEqual(newGame(SOCHI, 43).deal.hands);
  });

  it('первым торгуется игрок слева от сдающего', () => {
    const g = newGame(SOCHI, 1, 0);
    expect(actingSeat(g)).toBe(1);
  });

  it('все пасуют — распасы, первым ходит первая рука, открыта карта прикупа', () => {
    let g = newGame(SOCHI, 7, 0);
    for (const s of [1, 2, 0] as Seat[]) g = apply(g, { type: 'pass', seat: s });
    expect(g.phase).toBe('play');
    expect(g.deal.mode).toBe('raspasy');
    expect(g.deal.play!.turn).toBe(1);
    expect(g.deal.play!.exposed).not.toBeNull();
  });

  it('одна заявка и два паса — заказчик берёт прикуп (12 карт)', () => {
    let g = newGame(SOCHI, 7, 0);
    g = apply(g, { type: 'bid', seat: 1, contract: tricks(6, 'S') });
    g = apply(g, { type: 'pass', seat: 2 });
    g = apply(g, { type: 'pass', seat: 0 });
    expect(g.phase).toBe('discard');
    expect(g.deal.declarer).toBe(1);
    expect(g.deal.hands[1]).toHaveLength(12);
  });

  it('последний игрок может заявить после двух пасов', () => {
    let g = newGame(SOCHI, 7, 0);
    g = apply(g, { type: 'pass', seat: 1 });
    g = apply(g, { type: 'pass', seat: 2 });
    expect(actingSeat(g)).toBe(0);
    g = apply(g, { type: 'bid', seat: 0, contract: tricks(6, 'S') });
    expect(g.phase).toBe('discard');
    expect(g.deal.declarer).toBe(0);
  });

  it('мизер можно объявить только первым словом, заявка должна повышаться', () => {
    let g = newGame(SOCHI, 7, 0);
    expect(legalBids(g.deal.auction, 1, SOCHI).some((x) => x.kind === 'misere')).toBe(true);
    g = apply(g, { type: 'bid', seat: 1, contract: tricks(6, 'S') });
    g = apply(g, { type: 'bid', seat: 2, contract: tricks(6, 'C') });
    g = apply(g, { type: 'pass', seat: 0 });
    // игрок 1 уже говорил — мизер ему недоступен, а 6♣ и ниже тоже нельзя
    const bids = legalBids(g.deal.auction, 1, SOCHI);
    expect(bids.some((x) => x.kind === 'misere')).toBe(false);
    expect(bids.every((x) => contractRank(x) > contractRank(tricks(6, 'C')))).toBe(true);
    expect(() => apply(g, { type: 'bid', seat: 1, contract: tricks(6, 'S') })).toThrow();
  });

  it('заказчик не может понизить игру и перейти из взяток в мизер', () => {
    let g = newGame(SOCHI, 9, 0);
    g = apply(g, { type: 'bid', seat: 1, contract: tricks(7, 'H') });
    g = apply(g, { type: 'pass', seat: 2 });
    g = apply(g, { type: 'pass', seat: 0 });
    const [a, b] = g.deal.hands[1]!;
    expect(() => apply(g, { type: 'discard', seat: 1, cards: [a!, b!], contract: tricks(6, 'S') })).toThrow();
    expect(() => apply(g, { type: 'discard', seat: 1, cards: [a!, b!], contract: { kind: 'misere' } })).toThrow();
    const ok = apply(g, { type: 'discard', seat: 1, cards: [a!, b!], contract: tricks(8, 'S') });
    expect(ok.phase).toBe('whist');
    expect(ok.deal.hands[1]).toHaveLength(10);
  });

  it('оба пасуют на вист — игра засчитана без розыгрыша', () => {
    let g = newGame(SOCHI, 9, 0);
    g = apply(g, { type: 'bid', seat: 1, contract: tricks(6, 'S') });
    g = apply(g, { type: 'pass', seat: 2 });
    g = apply(g, { type: 'pass', seat: 0 });
    const [a, b] = g.deal.hands[1]!;
    g = apply(g, { type: 'discard', seat: 1, cards: [a!, b!], contract: tricks(6, 'S') });
    g = apply(g, { type: 'whist', seat: 2, choice: 'pass' });
    g = apply(g, { type: 'whist', seat: 0, choice: 'pass' });
    expect(g.phase).toBe('dealEnd');
    expect(g.pulya).toEqual([0, 2, 0]);
  });

  it('один вистующий: рука пасующего открыта и ею ходит вистующий', () => {
    let g = newGame(SOCHI, 9, 0);
    g = apply(g, { type: 'bid', seat: 1, contract: tricks(6, 'S') });
    g = apply(g, { type: 'pass', seat: 2 });
    g = apply(g, { type: 'pass', seat: 0 });
    const [a, b] = g.deal.hands[1]!;
    g = apply(g, { type: 'discard', seat: 1, cards: [a!, b!], contract: tricks(6, 'S') });
    g = apply(g, { type: 'whist', seat: 2, choice: 'pass' });
    g = apply(g, { type: 'whist', seat: 0, choice: 'whist' });
    expect(g.deal.whisters).toEqual([0]);
    expect(g.deal.passer).toBe(2);
    expect(viewFor(g, 0).hands[2]).not.toBeNull();
    expect(viewFor(g, 1).hands[2]).toBeNull();
    expect(viewFor(g, 1).hands[0]).toBeNull();
  });
});

describe('розыгрыш', () => {
  const play = (over: Partial<Play> = {}): Play => ({
    trick: [], exposed: null, leader: 0, turn: 0, trickNo: 0, won: [0, 0, 0], trump: null, seen: [], last: null, ...over,
  });

  it('обязательно отвечать в масть, иначе козырем, иначе любой картой', () => {
    const hand = [c('S', 7), c('S', 14), c('H', 8), c('D', 9)];
    const lead = { seat: 0 as Seat, card: c('S', 10) };
    expect(legalCards(hand, play({ trick: [lead] }))).toEqual([c('S', 7), c('S', 14)]);
    const noSpade = [c('H', 8), c('D', 9)];
    expect(legalCards(noSpade, play({ trick: [lead], trump: 'D' }))).toEqual([c('D', 9)]);
    expect(legalCards(noSpade, play({ trick: [lead], trump: 'C' }))).toEqual(noSpade);
    expect(legalCards(noSpade, play({ trick: [lead] }))).toEqual(noSpade);
  });

  it('взятка: старшая в масть, козырь бьёт', () => {
    const t = (seat: Seat, card: Card) => ({ seat, card });
    expect(trickWinner(play({ trick: [t(0, c('S', 10)), t(1, c('S', 14)), t(2, c('H', 14))] }))).toBe(1);
    expect(trickWinner(play({ trump: 'H', trick: [t(0, c('S', 10)), t(1, c('S', 14)), t(2, c('H', 7))] }))).toBe(2);
  });

  it('открытая карта прикупа задаёт масть, но не берёт взятку; если никто не ответил — берёт начавший', () => {
    const t = (seat: Seat, card: Card) => ({ seat, card });
    const p = play({ exposed: c('S', 14), leader: 1, trick: [t(1, c('S', 8)), t(2, c('S', 10)), t(0, c('S', 7))] });
    expect(trickWinner(p)).toBe(2);
    const none = play({ exposed: c('S', 14), leader: 1, trick: [t(1, c('H', 8)), t(2, c('H', 10)), t(0, c('D', 7))] });
    expect(trickWinner(none)).toBe(1);
  });

  it('после третьей карты взятка остаётся видна в play.last вместе со взявшим', () => {
    const bot = heuristicBot();
    let g = newGame(SOCHI, 7);
    // доиграть торговлю и прочее до первой взятки
    while (g.phase !== 'play' || g.deal.play!.trickNo === 0) {
      const before = g.phase === 'play' ? g.deal.play!.trick.map((t) => ({ ...t })) : null;
      const seat = actingSeat(g);
      g = apply(g, seat === null ? { type: 'next' } : bot(viewFor(g, seat)));
      if (g.phase === 'play' && g.deal.play!.trickNo === 1) {
        const last = g.deal.play!.last!;
        expect(last.cards).toHaveLength(3);
        expect(last.cards.slice(0, 2)).toEqual(before);
        expect(g.deal.play!.won[last.winner]).toBe(1);
        expect(g.deal.play!.trick).toHaveLength(0);
      }
    }
    expect(g.deal.play!.last).not.toBeNull();
  });
});

describe('очки', () => {
  const baseDeal = (over: Partial<Deal>): Deal => ({
    dealer: 0, hands: [[], [], []], talon: [], discard: [],
    auction: { turn: 0, high: null, highBidder: null, passed: [false, false, false], spoke: [false, false, false] },
    declarer: 1, winningBid: null, contract: tricks(6, 'S'), whistChoice: [null, null, null], whistTurn: null,
    whisters: [2, 0], passer: null, mode: 'tricks',
    play: { trick: [], exposed: null, leader: 0, turn: 0, trickNo: 10, won: [2, 6, 2], trump: 'S', seen: [], last: null },
    ...over,
  });

  it('игра сыграна: цена в пулю, висты за взятки', () => {
    const r = scoreDeal(baseDeal({}), SOCHI, 1);
    expect(r.pulya).toEqual([0, 2, 0]);
    expect(r.gora).toEqual([0, 0, 0]);
    expect(r.whists[2]![1]).toBe(2 * 2);
    expect(r.whists[0]![1]).toBe(2 * 2);
  });

  it('игра не сыграна: недобор в гору по цене за взятку', () => {
    const d = baseDeal({ contract: tricks(8, 'S'), play: { ...baseDeal({}).play!, won: [2, 6, 2] } });
    const r = scoreDeal(d, SOCHI, 1);
    expect(r.pulya[1]).toBe(0);
    expect(r.gora[1]).toBe(2 * 6);
  });

  it('недобор виста пишется в гору вистующим', () => {
    // 6♠: вистующие должны взять 4, взяли 3 — штраф за 1 взятку делится поровну
    const d = baseDeal({ play: { ...baseDeal({}).play!, won: [1, 7, 2] } });
    const r = scoreDeal(d, SOCHI, 1);
    expect(r.gora[2]! + r.gora[0]!).toBe(2);
  });

  it('мизер: сыгран / не сыгран', () => {
    const win = scoreDeal(baseDeal({ contract: { kind: 'misere' }, mode: 'misere', play: { ...baseDeal({}).play!, won: [5, 0, 5] } }), SOCHI, 1);
    expect(win.pulya[1]).toBe(10);
    const lose = scoreDeal(baseDeal({ contract: { kind: 'misere' }, mode: 'misere', play: { ...baseDeal({}).play!, won: [4, 2, 4] } }), SOCHI, 1);
    expect(lose.gora[1]).toBe(20);
  });

  it('распасы: взятки в гору, прогрессия умножает', () => {
    const d = baseDeal({ mode: 'raspasy', declarer: null, contract: null, whisters: [], play: { ...baseDeal({}).play!, won: [0, 4, 6] } });
    expect(scoreDeal(d, SOCHI, 1).gora).toEqual([0, 4, 6]);
    expect(scoreDeal(d, SOCHI, 3).gora).toEqual([0, 12, 18]);
  });

  it('итог пули: сумма балансов равна нулю при любых входных данных', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const pulya = [0, 1, 2].map(() => Math.floor(rng() * 11));
      const gora = [0, 1, 2].map(() => Math.floor(rng() * 40));
      const whists = [0, 1, 2].map((a) => [0, 1, 2].map((b) => (a === b ? 0 : Math.floor(rng() * 30))));
      const s = settle(pulya, gora, whists, SOCHI);
      expect(Math.abs(s.balance.reduce((x, y) => x + y, 0))).toBeLessThan(1e-9);
    }
  });
});

describe('полная партия', () => {
  it('боты доигрывают пулю до конца, карты не теряются, итог в ноль', () => {
    const h = heuristicBot();
    for (let seed = 1; seed <= 25; seed++) {
      const r = playBullet(seed, [h, h, h]);
      expect(r.finished).toBe(true);
      expect(Math.abs(r.game.settlement!.balance.reduce((a, b) => a + b, 0))).toBeLessThan(1e-9);
      expect(r.game.pulya.every((p) => p >= 10)).toBe(true);
    }
  });

  it('случайные боты тоже не ломают движок', () => {
    const rng = mulberry32(99);
    const bots = [randomBot(rng), randomBot(rng), randomBot(rng)];
    for (let seed = 1; seed <= 15; seed++) {
      const r = playBullet(seed, bots);
      if (r.finished) expect(Math.abs(r.game.settlement!.balance.reduce((a, b) => a + b, 0))).toBeLessThan(1e-9);
    }
  });

  it('партия воспроизводима при одинаковом seed', () => {
    const h = heuristicBot();
    const a = playBullet(77, [h, h, h]).game;
    const b = playBullet(77, [h, h, h]).game;
    expect(a.settlement).toEqual(b.settlement);
  });

  it('розыгрыш не нарушает правил: каждая раздача заканчивается 10 взятками', () => {
    const h = heuristicBot();
    const g: Game = playBullet(3, [h, h, h]).game;
    for (const res of g.results) {
      if (res.mode === 'noPlay') continue;
      expect(res.tricks.reduce((a, b) => a + b, 0)).toBe(10);
    }
  });

  it('legalPlays пуст, когда не твоя очередь', () => {
    let g = newGame(SOCHI, 7, 0);
    for (const s of [1, 2, 0] as Seat[]) g = apply(g, { type: 'pass', seat: s });
    expect(legalPlays(g, 2)).toEqual([]);
    expect(legalPlays(g, 1).length).toBeGreaterThan(0);
  });
});
