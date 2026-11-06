import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { Game } from '@pref/engine';
import { INK, PENCIL, RED, SERIF } from './theme';

/**
 * Записи пули, как их ведут на бумаге: нарастающий итог через точку («2.4.6»).
 * Пуля ограничена целью так же, как в движке (finishDeal).
 */
export function pulyaRecords(game: Game) {
  const pulya: number[][] = [[], [], []];
  const gora: number[][] = [[], [], []];
  const whists: number[][][] = [0, 1, 2].map(() => [[], [], []]);
  const p = [0, 0, 0], g = [0, 0, 0], w = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const r of game.results) {
    for (let i = 0; i < 3; i++) {
      const dp = r.pulya[i] ?? 0;
      if (dp) { p[i] = Math.min(game.cfg.bulletTarget, p[i]! + dp); pulya[i]!.push(p[i]!); }
      const dg = r.gora[i] ?? 0;
      if (dg) { g[i] = g[i]! + dg; gora[i]!.push(g[i]!); }
      for (let j = 0; j < 3; j++) {
        const dw = r.whists[i]![j] ?? 0;
        if (dw) { w[i]![j] = w[i]![j]! + dw; whists[i]![j]!.push(w[i]![j]!); }
      }
    }
  }
  return { pulya, gora, whists };
}

const fmt = (xs: number[]) => xs.map((x) => (Number.isInteger(x) ? String(x) : x.toFixed(1))).join('.');

/** Не влезает в полосу: оставляем хвост (последние записи важнее). */
function fit(text: string, length: number, fs: number) {
  const max = Math.floor(length / (fs * 0.58));
  return text.length <= max ? text : '…' + text.slice(text.length - max + 1);
}

/**
 * Лист пули на троих. Я внизу, «слева» и «справа» — по сторонам.
 * В каждом секторе снаружи внутрь: висты (две половины — на каждого соперника), пуля, гора.
 * onTable: пуля нарисована прямо на столе под картами (прозрачная, без имён).
 */
export function PulyaSheet({ game, names, width, height, onTable }: {
  game: Game; names: string[]; width: number; height?: number; onTable?: boolean;
}) {
  const W = width, H = Math.round(height ?? width * 1.15);
  const xc = W / 2, yc = H * 0.5;
  const st = Math.min(W, H) * (onTable ? 0.1 : 0.12); // ширина полосы
  const fs = Math.max(10, Math.round(Math.min(W, H) * 0.034));
  const rec = pulyaRecords(game);

  // Лучи из центра: вверх, в левый нижний и правый нижний углы.
  const yOnLeftRay = (x: number) => H - (H - yc) * (x / xc);
  const xOnLeftRay = (y: number) => xc * (H - y) / (H - yc);

  const lines: [number, number, number, number][] = [
    [xc, 0, xc, yc], [xc, yc, 0, H], [xc, yc, W, H],
  ];
  for (let k = 1; k <= 3; k++) {
    const x = st * k;
    lines.push([x, 0, x, yOnLeftRay(x)], [W - x, 0, W - x, yOnLeftRay(x)]);
    const y = H - st * k;
    lines.push([xOnLeftRay(y), y, W - xOnLeftRay(y), y]);
  }
  // Деление полос вистов пополам.
  const yWl = yOnLeftRay(st) / 2;
  lines.push([0, yWl, st, yWl], [W - st, yWl, W, yWl], [xc, H - st, xc, H]);

  const texts: { x: number; y: number; rot: number; len: number; t: string; color?: string }[] = [];
  // Левый сектор (место 1): текст повёрнут к сидящему слева.
  const side = (seat: 1 | 2, sign: 1 | -1) => {
    const X = (x: number) => (sign === 1 ? x : W - x);
    const rot = sign === 1 ? 90 : -90;
    const whTop = seat === 1 ? 2 : 1; // верхняя половина — висты на другого соперника
    const yP = yOnLeftRay(2 * st), yG = yOnLeftRay(3 * st);
    texts.push({ x: X(st / 2), y: yWl / 2, rot, len: yWl - 8, t: fmt(rec.whists[seat]![whTop]!) });
    texts.push({ x: X(st / 2), y: (yWl + yOnLeftRay(st)) / 2, rot, len: yOnLeftRay(st) - yWl - 8, t: fmt(rec.whists[seat]![0]!) });
    texts.push({ x: X(1.5 * st), y: yP / 2, rot, len: yP - 8, t: fmt(rec.pulya[seat]!), color: INK });
    texts.push({ x: X(2.5 * st), y: yG / 2, rot, len: yG - 8, t: fmt(rec.gora[seat]!), color: RED });
    if (!onTable) texts.push({ x: X(3.6 * st), y: yc * 0.55, rot, len: yc, t: names[seat]!, color: PENCIL });
  };
  side(1, 1);
  side(2, -1);
  // Нижний сектор (я).
  const rowLen = (y: number) => W - 2 * xOnLeftRay(y) - 12;
  const wx = xOnLeftRay(H - st);
  texts.push({ x: (wx + xc) / 2, y: H - st / 2, rot: 0, len: xc - wx - 8, t: fmt(rec.whists[0]![1]!) });
  texts.push({ x: W - (wx + xc) / 2, y: H - st / 2, rot: 0, len: xc - wx - 8, t: fmt(rec.whists[0]![2]!) });
  texts.push({ x: xc, y: H - 1.5 * st, rot: 0, len: rowLen(H - st), t: fmt(rec.pulya[0]!), color: INK });
  texts.push({ x: xc, y: H - 2.5 * st, rot: 0, len: rowLen(H - 2 * st), t: fmt(rec.gora[0]!), color: RED });
  if (!onTable) texts.push({ x: xc, y: H - 3.4 * st, rot: 0, len: rowLen(H - 3 * st), t: names[0]!, color: PENCIL });

  const ink = onTable ? 'rgba(38,57,138,0.45)' : INK;
  return (
    <Svg width={W} height={H}>
      <Rect x={1} y={1} width={W - 2} height={H - 2} fill="none" stroke={ink} strokeWidth={1.6} />
      {lines.map(([x1, y1, x2, y2], i) => (
        <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink} strokeWidth={1.1} strokeLinecap="round" />
      ))}
      <Circle cx={xc} cy={yc} r={st * 0.75} fill={onTable ? 'none' : 'rgba(246,241,227,0.9)'} stroke={ink} strokeWidth={1.6} />
      <SvgText x={xc} y={yc + fs * 0.45} fontSize={fs * 1.3} fontFamily={SERIF} fontWeight="bold" fill={ink} textAnchor="middle">
        {String(game.cfg.bulletTarget)}
      </SvgText>
      {texts.map((t, i) => (
        <G key={i} transform={`translate(${t.x} ${t.y}) rotate(${t.rot})`} opacity={onTable ? 0.7 : 1}>
          <SvgText x={0} y={fs * 0.35} fontSize={fs} fontFamily={SERIF} fill={t.color ?? INK} textAnchor="middle">
            {fit(t.t, t.len, fs)}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
}

export function PulyaLegend() {
  return (
    <View style={s.legend}>
      <Text style={s.legendText}>
        В каждом секторе снаружи внутрь: <Text style={s.wh}>висты</Text> (половина на каждого соперника),{' '}
        <Text style={s.p}>пуля</Text>, <Text style={s.g}>гора</Text>. Записи — нарастающим итогом.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  legend: { marginTop: 6 },
  legendText: { color: PENCIL, fontSize: 13, fontFamily: SERIF },
  wh: { color: INK, fontWeight: '700' },
  p: { color: INK, fontWeight: '700', textDecorationLine: 'underline' },
  g: { color: RED, fontWeight: '700' },
});
