// Симуляция партий бот-против-бота: проверка инвариантов движка и замеры качества ботов.
// Запуск: npm run sim
import { SOCHI } from './config';
import { actingSeat, apply, newGame, viewFor } from './engine';
import { heuristicBot, BotParams } from './bots/heuristic';
import { Bot, randomBot } from './bots/random';
import { mulberry32 } from './rng';
import { Game, Seat } from './types';
import { cardKey } from './cards';

export interface BulletStats {
  game: Game;
  deals: number;
  finished: boolean;
}

/** Все 32 карты на месте: руки + прикуп + снос + выложенные в розыгрыше. */
export function assertCardsConserved(g: Game): void {
  const d = g.deal;
  const keys = new Set<string>();
  const add = (cs: { suit: string; rank: number }[]) => cs.forEach((c) => keys.add(`${c.suit}${c.rank}`));
  d.hands.forEach(add);
  add(d.talon);
  add(d.discard);
  if (d.play) add(d.play.trick.map((t) => t.card));
  // Взятые карты не хранятся поэтому проверяем только «не больше 32 и без дублей».
  const total = d.hands.reduce((n, h) => n + h.length, 0) + d.talon.length + d.discard.length + (d.play?.trick.length ?? 0);
  if (total !== keys.size) throw new Error('duplicate card on the table');
}

export function playBullet(seed: number, bots: Bot[], maxDeals = 400): BulletStats {
  let g = newGame(SOCHI, seed, (seed % 3) as Seat);
  let guard = 0;
  while (g.phase !== 'bulletEnd') {
    if (g.dealNo > maxDeals) return { game: g, deals: g.dealNo, finished: false };
    if (++guard > 100000) throw new Error('engine loop');
    if (g.phase === 'dealEnd') {
      g = apply(g, { type: 'next' });
      continue;
    }
    const seat = actingSeat(g);
    if (seat === null) throw new Error(`no actor in phase ${g.phase}`);
    const action = bots[seat]!(viewFor(g, seat));
    g = apply(g, action);
    assertCardsConserved(g);
  }
  return { game: g, deals: g.dealNo + 1, finished: true };
}

function main(): void {
  const N = Number(process.env.BULLETS ?? 300);
  const rng = mulberry32(12345);
  const rand = randomBot(rng);

  // 1) Базовые замеры: статистика раздач у трёх ботов v1.
  const h = heuristicBot();
  let deals = 0, played = 0, made = 0, misere = 0, misereMade = 0, raspasy = 0, noPlay = 0, unfinished = 0;
  let maxZero = 0;
  for (let i = 0; i < N; i++) {
    const r = playBullet(1000 + i, [h, h, h]);
    if (!r.finished) { unfinished++; continue; }
    maxZero = Math.max(maxZero, Math.abs(r.game.settlement!.balance.reduce((a, b) => a + b, 0)));
    for (const res of r.game.results) {
      deals++;
      if (res.mode === 'raspasy') { raspasy++; continue; }
      if (res.mode === 'noPlay') { noPlay++; played++; made++; continue; }
      const ok = res.pulya.some((x) => x > 0);
      if (res.contract?.kind === 'misere') { misere++; if (ok) misereMade++; }
      played++;
      if (ok) made++;
    }
  }
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + '%' : 'n/a');
  console.log(`Партий: ${N}, не завершено: ${unfinished}, раздач: ${deals}`);
  console.log(`Макс. отклонение суммы итогов от нуля: ${maxZero.toExponential(2)}`);
  console.log(`Распасы: ${pct(raspasy, deals)} раздач; игр на взятки/мизер: ${pct(played, deals)}`);
  console.log(`Сыграно заказчиком: ${pct(made, played)} (из них без розыгрыша: ${noPlay}); мизеров: ${misere}, сыграно ${pct(misereMade, misere)}`);

  // 2) Матч «бот v1» против двух случайных: средний итог за партию на месте 0/1/2.
  const matchup = (name: string, make: (seat: Seat) => Bot, bullets = N) => {
    const sum = [0, 0, 0];
    let wins = 0, count = 0;
    for (let seat = 0 as Seat; seat < 3; seat++) {
      for (let i = 0; i < bullets / 3; i++) {
        const bots = [0, 1, 2].map((s) => (s === seat ? make(seat) : rand));
        const r = playBullet(5000 + seat * 10000 + i, bots);
        if (!r.finished) continue;
        const b = r.game.settlement!.balance;
        sum[seat] = (sum[seat] ?? 0) + b[seat]!;
        count++;
        if (b[seat]! > 0) wins++;
      }
    }
    const avg = sum.reduce((a, b) => a + b, 0) / Math.max(1, count);
    console.log(`${name}: средний итог ${avg.toFixed(1)} за партию, положительный итог в ${pct(wins, count)} партий`);
  };
  matchup('бот v1 vs 2 случайных', () => h);

  // 3) Подбор параметров: вариант против двух ботов v1 с параметрами по умолчанию.
  const variants: Record<string, Partial<BotParams>> = {
    'talonBonus 0.0': { talonBonus: 0 },
    'talonBonus 0.6': { talonBonus: 0.6 },
    'whistFactor 0.2': { whistFactor: 0.2 },
    'whistFactor 0.6': { whistFactor: 0.6 },
    'misereDanger 1': { misereDanger: 1 },
    'misereSlack 1': { misereSlack: 1 },
    'misereSlack 0': { misereSlack: 0 },
    'talonBonus 0.3': { talonBonus: 0.3 },
  };
  const vsDefault = (params: Partial<BotParams>, bullets = N) => {
    let total = 0, count = 0;
    const tested = heuristicBot(params);
    const samples: number[] = [];
    for (let seat = 0 as Seat; seat < 3; seat++) {
      for (let i = 0; i < bullets / 3; i++) {
        const bots = [0, 1, 2].map((s) => (s === seat ? tested : h));
        const r = playBullet(90000 + seat * 10000 + i, bots);
        if (!r.finished) continue;
        const b = r.game.settlement!.balance[seat]!;
        total += b;
        samples.push(b);
        count++;
      }
    }
    const mean = total / Math.max(1, count);
    const sd = Math.sqrt(samples.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, count - 1));
    return { mean, se: sd / Math.sqrt(Math.max(1, count)), n: count };
  };
  console.log('\nВарианты параметров против двух ботов с параметрами по умолчанию (средний итог за партию):');
  for (const [name, params] of Object.entries(variants)) {
    const r = vsDefault(params);
    console.log(`  ${name}: ${r.mean.toFixed(1)} ± ${(1.96 * r.se).toFixed(1)} (95%, n=${r.n})`);
  }
  void cardKey;
}

if (process.argv[1]?.endsWith('sim.ts')) main();
