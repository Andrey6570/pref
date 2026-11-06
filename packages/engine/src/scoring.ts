import { RulesConfig } from './config';
import { contractPrice } from './contracts';
import { Deal, DealResult, Seat, Settlement } from './types';

const zeros = (n = 3) => Array.from({ length: n }, () => 0);
const zeroMatrix = () => Array.from({ length: 3 }, () => zeros());

/**
 * Очки за одну раздачу. Чистая функция: ничего не знает об остальном состоянии игры.
 * `tricks` — взятки по рукам. `raspasyMult` — множитель прогрессии на распасах.
 */
export function scoreDeal(deal: Deal, cfg: RulesConfig, raspasyMult: number): DealResult {
  const pulya = zeros();
  const gora = zeros();
  const whists = zeroMatrix();
  const notes: string[] = [];
  const tricks = deal.play ? [...deal.play.won] : zeros();
  const base: DealResult = {
    mode: deal.mode, declarer: deal.declarer, contract: deal.contract,
    whisters: [...deal.whisters], tricks, pulya, gora, whists, notes,
  };

  if (deal.mode === 'raspasy') {
    for (let s = 0; s < 3; s++) gora[s] = (tricks[s] ?? 0) * raspasyMult;
    notes.push(`Распасы: взятки записаны в гору${raspasyMult > 1 ? ` (прогрессия ×${raspasyMult})` : ''}`);
    return base;
  }

  const decl = deal.declarer as Seat;
  const contract = deal.contract!;
  const price = contractPrice(contract, cfg);

  if (deal.mode === 'noPlay') {
    pulya[decl] = price;
    notes.push('Оба пасуют: игра засчитана без розыгрыша');
    return base;
  }

  const declTricks = tricks[decl] ?? 0;

  if (contract.kind === 'misere') {
    if (declTricks === 0) {
      pulya[decl] = price;
      notes.push('Мизер сыгран');
    } else {
      gora[decl] = declTricks * price;
      notes.push(`Мизер не сыгран: ${declTricks} взяток`);
    }
    return base;
  }

  const idx = contract.level - 6;
  if (declTricks >= contract.level) {
    pulya[decl] = price;
    notes.push(`Игра сыграна: ${declTricks} из ${contract.level}`);
  } else {
    const under = contract.level - declTricks;
    gora[decl] = under * price;
    notes.push(`Игра не сыграна: недобор ${under}`);
  }

  // Висты. Если вистует один, ему принадлежат взятки обеих «защитных» рук.
  const whisterTricks = (w: Seat): number => {
    let t = tricks[w] ?? 0;
    if (deal.whisters.length === 1 && deal.passer !== null) t += tricks[deal.passer] ?? 0;
    return t;
  };
  const vp = cfg.whistPricePerTrick[idx]!;
  for (const w of deal.whisters) whists[w]![decl] = whisterTricks(w) * vp;

  const combined = deal.whisters.reduce<number>((sum, w) => sum + whisterTricks(w), 0);
  const need = cfg.requiredWhistTricks[idx]!;
  const shortfall = Math.max(0, need - combined);
  if (shortfall > 0 && deal.whisters.length > 0) {
    const penalty = shortfall * vp;
    for (const w of deal.whisters) gora[w] = (gora[w] ?? 0) + penalty / deal.whisters.length;
    notes.push(`Недобор виста: ${shortfall}`);
  }
  return base;
}

/**
 * Итоговый расчёт пули. Гора каждого игрока делится пополам и пишется
 * двум остальным в висты; очки пули сравниваются со средним.
 * Структура гарантирует нулевую сумму независимо от значений параметров.
 */
export function settle(
  pulya: number[], gora: number[], whists: number[][], cfg: RulesConfig,
): Settlement {
  const full = whists.map((row) => [...row]);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (i === j) continue;
      full[j]![i] = (full[j]![i] ?? 0) + (gora[i] ?? 0) / 2;
    }
  }
  const mean = pulya.reduce((a, b) => a + b, 0) / 3;
  const balance = [0, 1, 2].map((i) => {
    let net = 0;
    for (let j = 0; j < 3; j++) net += (full[i]![j] ?? 0) - (full[j]![i] ?? 0);
    return net + cfg.pulyaPointValue * ((pulya[i] ?? 0) - mean);
  });
  return { whists: full, pulya: [...pulya], gora: [...gora], balance };
}
