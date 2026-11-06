import { clone } from './clone';
import { Card, fullDeck, sameCard, sortHand, Suit } from './cards';
import { RulesConfig } from './config';
import {
  allContracts, Contract, contractRank, trumpOf,
} from './contracts';
import { mulberry32, shuffleInPlace } from './rng';
import { scoreDeal, settle } from './scoring';
import {
  Action, Auction, Deal, Game, nextSeat, Play, prevSeat, Seat,
} from './types';

// ───────────────────────── создание игры и сдачи ─────────────────────────

export function newGame(cfg: RulesConfig, seed: number, firstDealer: Seat = 0): Game {
  return {
    cfg, seed, dealNo: 0, phase: 'auction',
    pulya: [0, 0, 0], gora: [0, 0, 0],
    whists: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    raspasyStreak: 0,
    deal: dealCards(seed, 0, firstDealer),
    results: [], settlement: null,
  };
}

function dealCards(seed: number, dealNo: number, dealer: Seat): Deal {
  const rng = mulberry32((seed ^ Math.imul(dealNo + 1, 0x9e3779b1)) >>> 0);
  const deck = shuffleInPlace(fullDeck(), rng);
  const hands = [0, 1, 2].map((i) => sortHand(deck.slice(i * 10, i * 10 + 10)));
  return {
    dealer, hands, talon: deck.slice(30, 32), discard: [],
    auction: {
      turn: nextSeat(dealer), high: null, highBidder: null,
      passed: [false, false, false], spoke: [false, false, false],
    },
    declarer: null, winningBid: null, contract: null,
    whistChoice: [null, null, null], whistTurn: null,
    whisters: [], passer: null, mode: 'auction', play: null,
  };
}

// ───────────────────────── вспомогательное ─────────────────────────

/** Кто физически принимает решение за руку seat. */
export function controllerOf(deal: Deal, seat: Seat): Seat {
  if (deal.passer === seat && deal.whisters.length === 1) return deal.whisters[0]!;
  return seat;
}

/** Чей сейчас ход (кто должен действовать); null — ждём «дальше» или партия окончена. */
export function actingSeat(game: Game): Seat | null {
  const d = game.deal;
  switch (game.phase) {
    case 'auction': return d.auction.turn;
    case 'discard': return d.declarer;
    case 'whist': return d.whistTurn;
    case 'play': return controllerOf(d, d.play!.turn);
    default: return null;
  }
}

export function legalBids(auction: Auction, seat: Seat, cfg: RulesConfig): Contract[] {
  if (auction.turn !== seat || auction.passed[seat]) return [];
  const floor = auction.high ? contractRank(auction.high) : -1;
  return allContracts().filter((c) => {
    if (contractRank(c) <= floor) return false;
    if (c.kind === 'misere' && cfg.misereOnlyAsFirstWord && auction.spoke[seat]) return false;
    return true;
  });
}

/** Карты, которыми можно сходить из руки seat прямо сейчас. */
export function legalPlays(game: Game, seat: Seat): Card[] {
  const d = game.deal;
  const p = d.play;
  if (game.phase !== 'play' || !p || p.turn !== seat) return [];
  return legalCards(d.hands[seat]!, p);
}

/** Правило хода: в масть, иначе козырем, иначе любой картой (бить взятку не обязательно). */
export function legalCards(hand: Card[], p: Play): Card[] {
  const leadSuit: Suit | null = p.exposed ? p.exposed.suit : p.trick[0]?.card.suit ?? null;
  if (!leadSuit) return [...hand];
  const follow = hand.filter((c) => c.suit === leadSuit);
  if (follow.length) return follow;
  if (p.trump) {
    const trumps = hand.filter((c) => c.suit === p.trump);
    if (trumps.length) return trumps;
  }
  return [...hand];
}

/** Победитель взятки. Открытая карта прикупа только задаёт масть и в борьбе не участвует. */
export function trickWinner(p: Play): Seat {
  const leadSuit = p.exposed ? p.exposed.suit : p.trick[0]!.card.suit;
  const trumps = p.trump ? p.trick.filter((t) => t.card.suit === p.trump) : [];
  const pool = trumps.length ? trumps : p.trick.filter((t) => t.card.suit === leadSuit);
  // Никто не ответил в масть открытой карты — взятка уходит тому, кто начинал.
  if (!pool.length) return p.leader;
  return pool.reduce((best, t) => (t.card.rank > best.card.rank ? t : best)).seat;
}

// ───────────────────────── проверка и применение действий ─────────────────────────

/** Возвращает текст ошибки или null, если действие допустимо. */
export function validate(game: Game, a: Action): string | null {
  const d = game.deal;
  switch (a.type) {
    case 'bid': {
      if (game.phase !== 'auction') return 'Сейчас не торговля';
      if (d.auction.turn !== a.seat) return 'Не ваш ход';
      const ok = legalBids(d.auction, a.seat, game.cfg).some((c) => contractRank(c) === contractRank(a.contract));
      return ok ? null : 'Заявка недопустима';
    }
    case 'pass': {
      if (game.phase !== 'auction') return 'Сейчас не торговля';
      return d.auction.turn === a.seat ? null : 'Не ваш ход';
    }
    case 'discard': {
      if (game.phase !== 'discard') return 'Сейчас не снос';
      if (d.declarer !== a.seat) return 'Не ваш ход';
      const [c1, c2] = a.cards;
      if (sameCard(c1, c2)) return 'Нужны две разные карты';
      const hand = d.hands[a.seat]!;
      if (!hand.some((c) => sameCard(c, c1)) || !hand.some((c) => sameCard(c, c2))) return 'Карты не в руке';
      const bid = d.winningBid!;
      if (bid.kind === 'misere') return a.contract.kind === 'misere' ? null : 'Нужно играть мизер';
      if (a.contract.kind !== 'tricks') return 'После торговли на взятки нельзя перейти в мизер';
      return contractRank(a.contract) >= contractRank(bid) ? null : 'Игру нельзя понизить';
    }
    case 'whist': {
      if (game.phase !== 'whist') return 'Сейчас не вист';
      return d.whistTurn === a.seat ? null : 'Не ваш ход';
    }
    case 'play': {
      if (game.phase !== 'play') return 'Сейчас не розыгрыш';
      if (!legalPlays(game, a.seat).some((c) => sameCard(c, a.card))) return 'Ход недопустим';
      return null;
    }
    case 'next':
      return game.phase === 'dealEnd' ? null : 'Раздача не закончена';
  }
}

export function apply(game: Game, action: Action): Game {
  const err = validate(game, action);
  if (err) throw new Error(`${err} (${action.type})`);
  const g: Game = clone(game);
  const d = g.deal;

  switch (action.type) {
    case 'bid': {
      d.auction.high = action.contract;
      d.auction.highBidder = action.seat;
      d.auction.spoke[action.seat] = true;
      advanceAuction(g, action.seat);
      break;
    }
    case 'pass': {
      d.auction.passed[action.seat] = true;
      advanceAuction(g, action.seat);
      break;
    }
    case 'discard': {
      const hand = d.hands[action.seat]!;
      for (const c of action.cards) {
        hand.splice(hand.findIndex((x) => sameCard(x, c)), 1);
        d.discard.push(c);
      }
      d.contract = action.contract;
      if (action.contract.kind === 'misere') {
        d.whisters = [nextSeat(action.seat), prevSeat(action.seat)];
        d.mode = 'misere';
        startPlay(g, action.seat);
      } else {
        d.mode = 'tricks';
        g.phase = 'whist';
        d.whistTurn = nextSeat(action.seat);
      }
      break;
    }
    case 'whist': {
      d.whistChoice[action.seat] = action.choice;
      const decl = d.declarer as Seat;
      if (action.seat === nextSeat(decl)) {
        d.whistTurn = prevSeat(decl);
        break;
      }
      d.whistTurn = null;
      d.whisters = ([nextSeat(decl), prevSeat(decl)] as Seat[]).filter((s) => d.whistChoice[s] === 'whist');
      if (d.whisters.length === 0) {
        d.mode = 'noPlay';
        finishDeal(g);
      } else {
        if (d.whisters.length === 1) d.passer = ([nextSeat(decl), prevSeat(decl)] as Seat[]).find((s) => s !== d.whisters[0])!;
        startPlay(g, decl);
      }
      break;
    }
    case 'play':
      playCard(g, action.seat, action.card);
      break;
    case 'next':
      startNextDeal(g);
      break;
  }
  return g;
}

function advanceAuction(g: Game, from: Seat): void {
  const d = g.deal;
  const a = d.auction;
  const live = ([0, 1, 2] as Seat[]).filter((s) => !a.passed[s]);

  if (live.length === 0) {
    // Все спасовали — распасы.
    d.mode = 'raspasy';
    startPlay(g, nextSeat(d.dealer));
    return;
  }
  if (live.length === 1 && a.high) {
    // Остался единственный игрок с заявкой — он заказчик и берёт прикуп.
    d.declarer = live[0]!;
    d.winningBid = a.high;
    d.hands[d.declarer]!.push(...d.talon);
    d.hands[d.declarer] = sortHand(d.hands[d.declarer]!);
    d.talon = [];
    g.phase = 'discard';
    return;
  }
  // Следующий не спасовавший по кругу.
  let s = nextSeat(from);
  while (a.passed[s]) s = nextSeat(s);
  a.turn = s;
}

function startPlay(g: Game, leader: Seat): void {
  const d = g.deal;
  g.phase = 'play';
  const trump = d.mode === 'tricks' ? trumpOf(d.contract) : null;
  const play: Play = {
    trick: [], exposed: null, leader, turn: leader, trickNo: 0,
    won: [0, 0, 0], trump, seen: [], last: null,
  };
  d.play = play;
  openTalonCard(g);
}

/** В распасах Сочи первые две взятки начинаются с открытой карты прикупа. */
function openTalonCard(g: Game): void {
  const d = g.deal;
  const p = d.play!;
  p.exposed = null;
  if (d.mode === 'raspasy' && g.cfg.raspasyTalonOpen && p.trickNo < 2) {
    const c = d.talon[p.trickNo]!;
    p.exposed = c;
    p.seen.push(c);
  }
}

function playCard(g: Game, seat: Seat, card: Card): void {
  const d = g.deal;
  const p = d.play!;
  const hand = d.hands[seat]!;
  hand.splice(hand.findIndex((x) => sameCard(x, card)), 1);
  p.trick.push({ seat, card });
  p.seen.push(card);

  if (p.trick.length < 3) {
    p.turn = nextSeat(seat);
    return;
  }
  const winner = trickWinner(p);
  p.won[winner] = (p.won[winner] ?? 0) + 1;
  p.trickNo += 1;
  p.last = { cards: p.trick, winner };
  if (p.trickNo === 10) {
    finishDeal(g);
    return;
  }
  p.trick = [];
  p.leader = winner;
  p.turn = winner;
  openTalonCard(g);
}

function finishDeal(g: Game): void {
  const d = g.deal;
  const mult = g.cfg.raspasyProgression ? g.raspasyStreak + 1 : 1;
  const result = scoreDeal(d, g.cfg, mult);
  g.raspasyStreak = d.mode === 'raspasy' ? g.raspasyStreak + 1 : 0;
  for (let i = 0; i < 3; i++) {
    // Пуля ограничена целью: «помощь» закрывшего пулю игрока пока не реализована (см. SPEC).
    g.pulya[i] = Math.min(g.cfg.bulletTarget, (g.pulya[i] ?? 0) + (result.pulya[i] ?? 0));
    g.gora[i] = (g.gora[i] ?? 0) + (result.gora[i] ?? 0);
    for (let j = 0; j < 3; j++) g.whists[i]![j] = (g.whists[i]![j] ?? 0) + (result.whists[i]![j] ?? 0);
  }
  g.results.push(result);
  g.phase = 'dealEnd';
}

function startNextDeal(g: Game): void {
  if (g.pulya.every((p) => p >= g.cfg.bulletTarget)) {
    g.settlement = settle(g.pulya, g.gora, g.whists, g.cfg);
    g.phase = 'bulletEnd';
    return;
  }
  g.dealNo += 1;
  g.deal = dealCards(g.seed, g.dealNo, nextSeat(g.deal.dealer));
  g.phase = 'auction';
}

// ───────────────────────── что видит игрок ─────────────────────────

export interface PlayerView {
  seat: Seat;
  cfg: RulesConfig;
  phase: Game['phase'];
  dealer: Seat;
  auction: Auction;
  /** Видимые руки: своя, а также открытая рука пасующего у вистующего. */
  hands: (Card[] | null)[];
  declarer: Seat | null;
  winningBid: Contract | null;
  contract: Contract | null;
  whisters: Seat[];
  passer: Seat | null;
  mode: Deal['mode'];
  play: Play | null;
  /** Сколько карт у каждого игрока (для интерфейса). */
  handSizes: number[];
  /** Карты, сброшенные заказчиком в снос; видны только ему. */
  myDiscard: Card[];
  pulya: number[];
  gora: number[];
}

export function viewFor(game: Game, seat: Seat): PlayerView {
  const d = game.deal;
  const hands: (Card[] | null)[] = [null, null, null];
  hands[seat] = d.hands[seat]!.map((c) => ({ ...c }));
  if (d.passer !== null && d.whisters.length === 1 && d.whisters[0] === seat) {
    hands[d.passer] = d.hands[d.passer]!.map((c) => ({ ...c }));
  }
  return {
    seat, cfg: game.cfg, phase: game.phase, dealer: d.dealer,
    auction: clone(d.auction), hands,
    declarer: d.declarer, winningBid: d.winningBid, contract: d.contract,
    whisters: [...d.whisters], passer: d.passer, mode: d.mode,
    play: d.play ? clone(d.play) : null,
    handSizes: d.hands.map((h) => h.length),
    myDiscard: d.declarer === seat ? d.discard.map((c) => ({ ...c })) : [],
    pulya: [...game.pulya], gora: [...game.gora],
  };
}
