import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent, Modal, Platform, Pressable, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text,
  useWindowDimensions, View,
} from 'react-native';
import Svg, { Line } from 'react-native-svg';
import {
  actingSeat, allContracts, apply, Card, Contract, contractLabel, contractRank, Game,
  heuristicBot, legalBids, legalCards, newGame, Seat, settle, SOCHI, sameCard, sortHand, SUIT_SYMBOL,
  TrickCard, viewFor,
} from '@pref/engine';
import { CardBack, CardFace, CARD_RATIO } from './Cards';
import { PulyaLegend, PulyaSheet } from './Pulya';
import { CELL, GRID, INK, MARGIN, PAPER, PENCIL, RED, SERIF } from './theme';

const ME: Seat = 0;
const NAMES = ['Вы', 'Бот слева', 'Бот справа'];
const bot = heuristicBot();
const BOT_DELAY = 650;
/** Сколько показывать собранную взятку, прежде чем убрать её со стола. */
const TRICK_HOLD = 1500;
const TOP_PAD = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + 6 : 54;
const SIDE_W = 62;
const BID_SUITS = ['S', 'C', 'D', 'H', 'NT'] as const;

type Hold = { cards: TrickCard[]; winner: Seat };

/** Тетрадный лист в клетку с полями. */
function NotebookBg() {
  const { width, height } = useWindowDimensions();
  const v = Math.ceil(width / CELL), h = Math.ceil(height / CELL);
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
      {Array.from({ length: v }, (_, i) => <Line key={`v${i}`} x1={i * CELL} y1={0} x2={i * CELL} y2={height} stroke={GRID} strokeWidth={0.7} />)}
      {Array.from({ length: h }, (_, i) => <Line key={`h${i}`} x1={0} y1={i * CELL} x2={width} y2={i * CELL} stroke={GRID} strokeWidth={0.7} />)}
      <Line x1={width - CELL} y1={0} x2={width - CELL} y2={height} stroke={MARGIN} strokeWidth={1.2} />
    </Svg>
  );
}

/** Кнопка, обведённая ручкой; primary — закрашена; stamp — красный штамп. */
function Btn({ label, onPress, disabled, kind }: {
  label: string; onPress: () => void; disabled?: boolean; kind?: 'primary' | 'outline' | 'stamp';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, kind === 'primary' && s.btnPrimary, kind === 'stamp' && s.btnStamp,
        disabled && s.btnDisabled, pressed && { opacity: 0.6 }]}
    >
      <Text style={[s.btnText, kind === 'primary' && s.btnPrimaryText, kind === 'stamp' && s.btnStampText]}>{label}</Text>
    </Pressable>
  );
}

/** Рука соперника вдоль края листа: рубашки боком или открытые карты столбиком. */
function SideHand({ cards, count, height, playable, onPlay }: {
  cards: Card[] | null; count: number; height: number;
  playable?: (c: Card) => boolean; onPlay?: (c: Card) => void;
}) {
  if (count === 0) return null;
  if (!cards) {
    const w = (SIDE_W - 8) / CARD_RATIO;
    const step = Math.min(14, (height - w) / Math.max(1, count - 1));
    return (
      <View style={{ alignItems: 'center' }}>
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={{ marginTop: i === 0 ? 0 : step - w }}><CardBack width={w} rotated /></View>
        ))}
      </View>
    );
  }
  const w = SIDE_W - 8, h = w * CARD_RATIO;
  const step = Math.min(30, (height - h) / Math.max(1, cards.length - 1));
  return (
    <View style={{ alignItems: 'center' }}>
      {sortHand(cards).map((c, i) => {
        const ok = playable?.(c) ?? false;
        return (
          <View key={`${c.suit}${c.rank}`} style={{ marginTop: i === 0 ? 0 : step - h }}>
            <CardFace card={c} width={w} dim={playable && !ok} onPress={ok && onPlay ? () => onPlay(c) : undefined} />
          </View>
        );
      })}
    </View>
  );
}

export default function App() {
  const { width: screenW } = useWindowDimensions();
  const [game, setGame] = useState<Game>(() => newGame(SOCHI, Math.floor(Math.random() * 2 ** 31)));
  const [picked, setPicked] = useState<Card[]>([]);
  const [declare, setDeclare] = useState<Contract | null>(null);
  const [showPulya, setShowPulya] = useState(false);
  const [hold, setHold] = useState<Hold | null>(null);
  const [table, setTable] = useState({ w: 260, h: 300 });

  const actor = actingSeat(game);
  const d = game.deal;
  const play = d.play;

  // Собранная взятка остаётся на столе TRICK_HOLD мс (или до касания стола).
  const seenTrick = useRef('');
  useEffect(() => {
    if (!play?.last) return;
    const key = `${game.dealNo}:${play.trickNo}`;
    if (seenTrick.current === key) return;
    seenTrick.current = key;
    setHold(play.last);
  }, [game.dealNo, play?.trickNo, play?.last]);
  useEffect(() => {
    if (!hold) return;
    const t = setTimeout(() => setHold(null), TRICK_HOLD);
    return () => clearTimeout(t);
  }, [hold]);

  // Боты ходят сами с небольшой задержкой, чтобы игру можно было проследить глазами.
  useEffect(() => {
    if (hold || actor === null || actor === ME) return;
    const t = setTimeout(() => setGame((g) => {
      const seat = actingSeat(g);
      return seat === null || seat === ME ? g : apply(g, bot(viewFor(g, seat)));
    }), BOT_DELAY);
    return () => clearTimeout(t);
  }, [game, actor, hold]);

  // Сброс выбора при смене фазы.
  useEffect(() => { setPicked([]); setDeclare(null); }, [game.phase, game.dealNo]);

  const act = (fn: (g: Game) => Game) => { if (!hold) setGame((g) => fn(g)); };
  const view = useMemo(() => viewFor(game, ME), [game]);
  const myHand = d.hands[ME]!;
  const preview = settle(game.pulya, game.gora, game.whists, game.cfg);

  // ── карты, из которых я могу ходить (своя рука или открытая рука пасующего)
  const handToPlay: Seat | null = !hold && game.phase === 'play' && actor === ME && play ? play.turn : null;
  const legal = handToPlay !== null && play ? legalCards(d.hands[handToPlay]!, play) : [];
  const isLegal = (c: Card) => legal.some((x) => sameCard(x, c));
  const passerOpen = d.passer !== null && d.whisters.length === 1 && d.whisters[0] === ME ? d.passer : null;
  const playFrom = (seat: Seat) => (c: Card) => act((g) => apply(g, { type: 'play', seat, card: c }));
  const sidePlayable = (seat: Seat) => (passerOpen !== seat ? undefined : handToPlay === seat ? isLegal : () => false);

  const bids = game.phase === 'auction' && actor === ME ? legalBids(d.auction, ME, game.cfg) : [];
  const bidSet = new Set(bids.map(contractRank));

  const toggle = (c: Card) => setPicked((p) =>
    p.some((x) => sameCard(x, c)) ? p.filter((x) => !sameCard(x, c)) : p.length < 2 ? [...p, c] : p);

  const raiseOptions: Contract[] = d.winningBid && d.winningBid.kind === 'tricks'
    ? allContracts().filter((c) => c.kind === 'tricks' && contractRank(c) >= contractRank(d.winningBid!))
    : [];
  const chosenContract = declare ?? d.winningBid;

  const status = (() => {
    if (hold) return `Взятку взял: ${NAMES[hold.winner]}`;
    switch (game.phase) {
      case 'auction': return actor === ME ? 'Ваше слово' : `Торгуется ${NAMES[actor!]!.toLowerCase()}`;
      case 'discard': return actor === ME ? 'Снесите две карты' : `${NAMES[d.declarer!]} сносит`;
      case 'whist': return actor === ME ? 'Вистуете?' : `${NAMES[actor!]} думает про вист`;
      case 'play': return actor === ME ? 'Ваш ход' : `Ходит ${NAMES[actor!]!.toLowerCase()}`;
      case 'dealEnd': return 'Раздача сыграна';
      default: return 'Пуля закрыта';
    }
  })();
  const subStatus = d.contract
    ? `${NAMES[d.declarer!]} играет ${contractLabel(d.contract)}${d.whisters.length ? ` · вистуют: ${d.whisters.map((w) => NAMES[w]).join(', ')}` : ''}`
    : d.mode === 'raspasy' ? 'Распасы: берите как можно меньше взяток' : `Раздача ${game.dealNo + 1}`;

  /** Короткая строка о месте: заявка/пас в торговле, роль в игре, взятки. */
  const seatRole = (i: Seat) => {
    if (game.phase === 'auction') {
      if (d.auction.passed[i]) return 'пас';
      if (d.auction.highBidder === i && d.auction.high) return contractLabel(d.auction.high);
      return '';
    }
    if (d.declarer === i && d.contract) return contractLabel(d.contract);
    if (d.whisters.includes(i)) return 'вист';
    if (d.passer === i) return 'пас';
    return '';
  };
  const seatLabel = (i: Seat) => (
    <View style={[s.seat, actor === i && !hold && s.seatActive]}>
      <Text style={s.seatName} numberOfLines={2}>{NAMES[i]}</Text>
      {d.dealer === i && <Text style={s.seatSmall}>сдаёт</Text>}
      <Text style={s.seatSmall}>{game.pulya[i]} / {game.gora[i]}</Text>
      {!!seatRole(i) && <Text style={s.seatRole}>{seatRole(i)}</Text>}
      {play && <Text style={s.seatTricks}>{'|'.repeat(play.won[i] ?? 0) || '—'}</Text>}
    </View>
  );

  // ── стол: пуля нарисована на листе, карты лежат со стороны своих игроков
  const tableCards: TrickCard[] = hold ? hold.cards : play?.trick ?? [];
  const tableCardW = Math.min(74, table.w / 3.3);
  const slot = (seat: Seat) => tableCards.find((t) => t.seat === seat);
  const lastResult = game.phase === 'dealEnd' && !hold ? game.results[game.results.length - 1] : undefined;
  const slotPos = (seat: Seat) => {
    const h = tableCardW * CARD_RATIO;
    if (seat === 1) return { left: 2, top: table.h * 0.42 - h / 2, transform: [{ rotate: '-6deg' }] };
    if (seat === 2) return { right: 2, top: table.h * 0.42 - h / 2, transform: [{ rotate: '5deg' }] };
    return { left: table.w / 2 - tableCardW / 2, top: table.h * 0.62 - h / 2, transform: [{ rotate: '-2deg' }] };
  };

  // ── моя рука дугой
  const n = myHand.length;
  const myCardW = Math.min(76, (screenW - 24) / 4.4);
  const myStep = n > 1 ? Math.min(myCardW * 0.85, (screenW - 44 - myCardW) / (n - 1)) : 0;
  const ARC = 0.8; // прогиб дуги
  const maxK = (n - 1) / 2;
  const handH = myCardW * CARD_RATIO + 22 + maxK * maxK * ARC;
  const fanPos = (i: number) => {
    const k = i - maxK;
    return {
      position: 'absolute' as const,
      left: screenW / 2 - myCardW / 2 + k * myStep,
      top: 14 + k * k * ARC,
      transform: [{ rotate: `${k * 2.2}deg` }],
    };
  };

  const onTableLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setTable({ w: width, h: height });
  };

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <NotebookBg />

      {/* Шапка: что происходит и кнопка пули */}
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.status} numberOfLines={1}>{status}</Text>
          <Text style={s.subStatus} numberOfLines={1}>{subStatus}</Text>
        </View>
        <Pressable onPress={() => setShowPulya(true)} style={({ pressed }) => [s.pulyaStamp, pressed && { opacity: 0.6 }]}>
          <Text style={s.pulyaStampText}>ПУЛЯ</Text>
        </Pressable>
      </View>

      {/* Середина: соперники по краям листа, между ними пуля-стол */}
      <View style={s.middle}>
        <View style={s.side}>
          {seatLabel(1)}
          <SideHand cards={passerOpen === 1 ? d.hands[1]! : null} count={view.handSizes[1]!} height={table.h - 110}
            playable={sidePlayable(1)} onPlay={playFrom(1)} />
        </View>

        <Pressable style={s.table} onLayout={onTableLayout} onPress={() => setHold(null)} disabled={!hold}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <PulyaSheet game={game} names={NAMES} width={table.w} height={table.h} onTable />
          </View>
          {play?.exposed && !hold && (
            <View style={[s.exposed, { transform: [{ rotate: '3deg' }] }]}>
              <CardFace card={play.exposed} width={tableCardW * 0.75} />
              <Text style={s.pencil}>из прикупа</Text>
            </View>
          )}
          {([1, 2, 0] as Seat[]).map((seat) => {
            const t = slot(seat);
            return t ? (
              <View key={seat} style={[s.slot, slotPos(seat)]}>
                <CardFace card={t.card} width={tableCardW} glow={hold?.winner === seat} />
              </View>
            ) : null;
          })}
          {lastResult && (
            <View style={s.note}>
              {lastResult.notes.map((x) => <Text key={x} style={s.noteText}>{x}</Text>)}
              <Text style={s.noteText}>Взятки: {lastResult.tricks.map((t, i) => `${NAMES[i]} ${t}`).join(', ')}</Text>
            </View>
          )}
        </Pressable>

        <View style={s.side}>
          {seatLabel(2)}
          <SideHand cards={passerOpen === 2 ? d.hands[2]! : null} count={view.handSizes[2]!} height={table.h - 110}
            playable={sidePlayable(2)} onPlay={playFrom(2)} />
        </View>
      </View>

      {/* Действия */}
      {!hold && (
        <View style={s.panel}>
          {game.phase === 'auction' && actor === ME && (
            <>
              <View style={s.bidTable}>
                <View style={s.bidRow}>
                  <View style={[s.bidCell, s.bidCorner]} />
                  {BID_SUITS.map((suit) => (
                    <View key={suit} style={[s.bidCell, s.bidHeadCell]}>
                      <Text style={[s.bidHead, (suit === 'D' || suit === 'H') && { color: RED }]}>
                        {suit === 'NT' ? 'БК' : SUIT_SYMBOL[suit]}
                      </Text>
                    </View>
                  ))}
                </View>
                {[6, 7, 8, 9, 10].map((level) => (
                  <View key={level} style={s.bidRow}>
                    <View style={[s.bidCell, s.bidHeadCell]}><Text style={s.bidHead}>{level}</Text></View>
                    {BID_SUITS.map((suit) => {
                      const c: Contract = { kind: 'tricks', level: level as 6, suit };
                      const ok = bidSet.has(contractRank(c));
                      return (
                        <Pressable key={suit} disabled={!ok} style={({ pressed }) => [s.bidCell, pressed && s.bidPressed]}
                          onPress={() => act((g) => apply(g, { type: 'bid', seat: ME, contract: c }))}>
                          <Text style={[s.bidText, !ok && s.bidOff]}>{ok ? contractLabel(c) : '·'}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
              <View style={s.row}>
                <Btn label="Мизер" kind="outline" disabled={!bidSet.has(14.5)}
                  onPress={() => act((g) => apply(g, { type: 'bid', seat: ME, contract: { kind: 'misere' } }))} />
                <Btn label="Пас" kind="stamp" onPress={() => act((g) => apply(g, { type: 'pass', seat: ME }))} />
              </View>
            </>
          )}

          {game.phase === 'discard' && actor === ME && chosenContract && (
            <>
              {raiseOptions.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {raiseOptions.map((c) => {
                    const on = contractRank(c) === contractRank(chosenContract);
                    return (
                      <Pressable key={contractRank(c)} onPress={() => setDeclare(c)} style={[s.chip, on && s.chipOn]}>
                        <Text style={[s.chipText, on && s.chipTextOn]}>{contractLabel(c)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
              <Btn kind="primary" label={`Снести ${picked.length}/2 · играть ${contractLabel(chosenContract)}`} disabled={picked.length !== 2}
                onPress={() => act((g) => apply(g, { type: 'discard', seat: ME, cards: [picked[0]!, picked[1]!], contract: chosenContract }))} />
            </>
          )}

          {game.phase === 'whist' && actor === ME && (
            <View style={s.row}>
              <Btn label="Вист" kind="primary" onPress={() => act((g) => apply(g, { type: 'whist', seat: ME, choice: 'whist' }))} />
              <Btn label="Пас" kind="stamp" onPress={() => act((g) => apply(g, { type: 'whist', seat: ME, choice: 'pass' }))} />
            </View>
          )}

          {game.phase === 'dealEnd' && <Btn label="Следующая раздача" kind="primary" onPress={() => act((g) => apply(g, { type: 'next' }))} />}

          {game.phase === 'bulletEnd' && game.settlement && (
            <>
              {game.settlement.balance.map((b, i) => (
                <Text key={i} style={s.final}>{NAMES[i]}: {b > 0 ? '+' : ''}{b.toFixed(1)}</Text>
              ))}
              <Btn label="Новая пуля" kind="primary" onPress={() => { setGame(newGame(SOCHI, Math.floor(Math.random() * 2 ** 31))); }} />
            </>
          )}
        </View>
      )}

      {/* Я: подпись и карты дугой */}
      <View style={s.meRow}>
        <Text style={[s.meText, actor === ME && !hold && s.meActive]}>
          {NAMES[ME]}{d.dealer === ME ? ' · сдаёте' : ''} · {game.pulya[ME]} / {game.gora[ME]}
          {seatRole(ME) ? ` · ${seatRole(ME)}` : ''}{play ? ` · взяток ${play.won[ME]}` : ''}
        </Text>
      </View>
      <View style={{ height: handH }}>
        {myHand.map((c, i) => {
          const key = `${c.suit}${c.rank}`;
          if (game.phase === 'discard' && actor === ME) {
            return <View key={key} style={fanPos(i)}><CardFace card={c} width={myCardW} selected={picked.some((x) => sameCard(x, c))} onPress={() => toggle(c)} /></View>;
          }
          const canPlay = handToPlay === ME && isLegal(c);
          return (
            <View key={key} style={fanPos(i)}>
              <CardFace card={c} width={myCardW} dim={handToPlay === ME && !canPlay}
                onPress={canPlay ? () => playFrom(ME)(c) : undefined} />
            </View>
          );
        })}
      </View>

      <Modal visible={showPulya} animationType="slide" onRequestClose={() => setShowPulya(false)}>
        <View style={s.modalRoot}>
          <NotebookBg />
          <ScrollView contentContainerStyle={{ paddingTop: TOP_PAD, paddingBottom: 24, paddingHorizontal: 12 }}>
            <Text style={s.modalTitle}>Пуля · {game.cfg.name}, до {game.cfg.bulletTarget}</Text>
            <PulyaSheet game={game} names={NAMES} width={screenW - 24} />
            <PulyaLegend />
            <View style={s.totals}>
              {[0, 1, 2].map((i) => (
                <Text key={i} style={s.modalLine}>
                  <Text style={{ fontWeight: '700' }}>{NAMES[i]}</Text>: пуля {game.pulya[i]}, гора {game.gora[i]}, висты{' '}
                  {[0, 1, 2].filter((j) => j !== i).map((j) => `на «${NAMES[j]}» ${game.whists[i]![j]}`).join(', ')}
                  {' · итог '}<Text style={{ color: preview.balance[i]! < 0 ? RED : INK, fontWeight: '700' }}>
                    {preview.balance[i]! > 0 ? '+' : ''}{preview.balance[i]!.toFixed(1)}
                  </Text>
                </Text>
              ))}
              <Text style={s.pencil}>Итог — расчёт, как если бы пуля закрылась прямо сейчас.</Text>
            </View>
            <Btn label="Закрыть" kind="primary" onPress={() => setShowPulya(false)} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAPER, paddingTop: TOP_PAD, paddingBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  status: { color: INK, fontSize: 22, fontFamily: SERIF, fontStyle: 'italic', fontWeight: '700' },
  subStatus: { color: PENCIL, fontSize: 13, fontFamily: SERIF },
  pulyaStamp: {
    borderWidth: 2, borderColor: RED, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
    transform: [{ rotate: '-4deg' }], marginRight: 10,
  },
  pulyaStampText: { color: RED, fontWeight: '900', letterSpacing: 2, fontFamily: SERIF },

  middle: { flex: 1, flexDirection: 'row', marginTop: 8, paddingHorizontal: 4 },
  side: { width: SIDE_W, alignItems: 'center', gap: 6 },
  seat: { width: '100%', paddingBottom: 3, borderBottomWidth: 2, borderColor: 'transparent' },
  seatActive: { borderColor: RED },
  seatName: { color: INK, fontWeight: '700', fontSize: 12, fontFamily: SERIF },
  seatSmall: { color: PENCIL, fontSize: 11, fontFamily: SERIF },
  seatRole: { color: RED, fontSize: 12, fontFamily: SERIF, fontWeight: '700' },
  seatTricks: { color: INK, fontSize: 13, letterSpacing: 1 },

  table: { flex: 1, marginHorizontal: 4 },
  exposed: { position: 'absolute', top: 8, alignSelf: 'center', alignItems: 'center' },
  slot: { position: 'absolute' },
  pencil: { color: PENCIL, fontSize: 12, fontFamily: SERIF, fontStyle: 'italic' },
  note: {
    position: 'absolute', left: 8, right: 8, top: '22%', backgroundColor: '#fffbea', padding: 10,
    borderWidth: 1, borderColor: INK, transform: [{ rotate: '-1.5deg' }],
  },
  noteText: { color: INK, fontSize: 14, textAlign: 'center', fontFamily: SERIF },

  panel: { paddingHorizontal: 12, paddingTop: 6, gap: 8, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  btn: { borderWidth: 1.5, borderColor: INK, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center', backgroundColor: PAPER },
  btnPrimary: { backgroundColor: INK },
  btnStamp: { borderColor: RED, borderWidth: 2, transform: [{ rotate: '-3deg' }] },
  btnDisabled: { opacity: 0.3 },
  btnText: { color: INK, fontWeight: '700', fontFamily: SERIF, fontSize: 15 },
  btnPrimaryText: { color: PAPER },
  btnStampText: { color: RED, letterSpacing: 2, textTransform: 'uppercase' },

  bidTable: { borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: INK, backgroundColor: 'rgba(246,241,227,0.85)' },
  bidRow: { flexDirection: 'row' },
  bidCell: { width: 44, height: 31, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: INK, alignItems: 'center', justifyContent: 'center' },
  bidCorner: { backgroundColor: 'transparent' },
  bidHeadCell: { backgroundColor: 'rgba(38,57,138,0.07)' },
  bidHead: { color: INK, fontWeight: '700', fontSize: 16, fontFamily: SERIF },
  bidText: { color: INK, fontSize: 14, fontFamily: SERIF },
  bidOff: { color: PENCIL, opacity: 0.4 },
  bidPressed: { backgroundColor: 'rgba(179,38,30,0.15)' },
  chip: { paddingVertical: 5, paddingHorizontal: 12, borderWidth: 1.5, borderColor: INK, borderRadius: 14 },
  chipOn: { backgroundColor: INK },
  chipText: { color: INK, fontWeight: '700', fontFamily: SERIF },
  chipTextOn: { color: PAPER },
  final: { color: INK, fontSize: 17, fontFamily: SERIF },

  meRow: { alignItems: 'center', marginTop: 6 },
  meText: { color: INK, fontSize: 13, fontFamily: SERIF, paddingBottom: 2, borderBottomWidth: 2, borderColor: 'transparent' },
  meActive: { borderColor: RED },

  modalRoot: { flex: 1, backgroundColor: PAPER },
  modalTitle: { color: INK, fontSize: 22, fontFamily: SERIF, fontStyle: 'italic', fontWeight: '700', marginBottom: 10 },
  totals: { marginVertical: 12, gap: 6 },
  modalLine: { color: INK, fontSize: 14, fontFamily: SERIF },
});
