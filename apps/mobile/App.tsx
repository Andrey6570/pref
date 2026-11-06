import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal, Platform, Pressable, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, View,
} from 'react-native';
import {
  actingSeat, allContracts, apply, Card, Contract, contractLabel, contractRank, Game,
  heuristicBot, legalBids, legalCards, newGame, Seat, settle, SOCHI, sameCard, SUIT_SYMBOL,
  RANK_LABEL, viewFor,
} from '@pref/engine';

const ME: Seat = 0;
const NAMES = ['Вы', 'Бот слева', 'Бот справа'];
const bot = heuristicBot();
const BOT_DELAY = 650;
const TOP_PAD = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) + 8 : 54;

const isRed = (c: Card) => c.suit === 'D' || c.suit === 'H';

function CardView({ card, onPress, dim, selected, small }: {
  card: Card; onPress?: () => void; dim?: boolean; selected?: boolean; small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[s.card, small && s.cardSmall, dim && s.cardDim, selected && s.cardSelected]}
    >
      <Text style={[s.cardText, small && s.cardTextSmall, isRed(card) && s.red]}>
        {RANK_LABEL[card.rank]}{SUIT_SYMBOL[card.suit]}
      </Text>
    </Pressable>
  );
}

function Btn({ label, onPress, disabled, kind }: { label: string; onPress: () => void; disabled?: boolean; kind?: 'primary' | 'ghost' }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[s.btn, kind === 'ghost' && s.btnGhost, disabled && s.btnDisabled]}
    >
      <Text style={[s.btnText, kind === 'ghost' && s.btnGhostText]}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [game, setGame] = useState<Game>(() => newGame(SOCHI, Math.floor(Math.random() * 2 ** 31)));
  const [picked, setPicked] = useState<Card[]>([]);
  const [declare, setDeclare] = useState<Contract | null>(null);
  const [showScore, setShowScore] = useState(false);

  const actor = actingSeat(game);
  const d = game.deal;

  // Боты ходят сами с небольшой задержкой, чтобы игру можно было проследить глазами.
  useEffect(() => {
    if (actor === null || actor === ME) return;
    const t = setTimeout(() => setGame((g) => {
      const seat = actingSeat(g);
      return seat === null || seat === ME ? g : apply(g, bot(viewFor(g, seat)));
    }), BOT_DELAY);
    return () => clearTimeout(t);
  }, [game, actor]);

  // Сброс выбора при смене фазы.
  useEffect(() => { setPicked([]); setDeclare(null); }, [game.phase, game.dealNo]);

  const act = (fn: (g: Game) => Game) => setGame((g) => fn(g));
  const view = useMemo(() => viewFor(game, ME), [game]);
  const myHand = d.hands[ME]!;
  const preview = settle(game.pulya, game.gora, game.whists, game.cfg);

  // ── карты, из которых я могу ходить (своя рука или открытая рука пасующего)
  const play = d.play;
  const handToPlay: Seat | null = game.phase === 'play' && actor === ME && play ? play.turn : null;
  const legal = handToPlay !== null && play ? legalCards(d.hands[handToPlay]!, play) : [];
  const passerOpen = d.passer !== null && d.whisters.length === 1 && d.whisters[0] === ME ? d.passer : null;

  const bids = game.phase === 'auction' && actor === ME ? legalBids(d.auction, ME, game.cfg) : [];
  const bidSet = new Set(bids.map(contractRank));

  const toggle = (c: Card) => setPicked((p) =>
    p.some((x) => sameCard(x, c)) ? p.filter((x) => !sameCard(x, c)) : p.length < 2 ? [...p, c] : p);

  const raiseOptions: Contract[] = d.winningBid && d.winningBid.kind === 'tricks'
    ? allContracts().filter((c) => c.kind === 'tricks' && contractRank(c) >= contractRank(d.winningBid!))
    : [];
  const chosenContract = declare ?? d.winningBid;

  const status = (() => {
    switch (game.phase) {
      case 'auction': return actor === ME ? 'Ваша заявка' : `Торгуется: ${NAMES[actor!]}`;
      case 'discard': return actor === ME ? 'Снос: выберите две карты и объявите игру' : `${NAMES[d.declarer!]} сносит карты`;
      case 'whist': return actor === ME ? `Вистуете? Играют ${d.contract ? contractLabel(d.contract) : ''}` : `${NAMES[actor!]} решает про вист`;
      case 'play': return actor === ME ? 'Ваш ход' : `Ходит: ${NAMES[actor!]}`;
      case 'dealEnd': return 'Раздача окончена';
      default: return 'Пуля закрыта';
    }
  })();

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Верхняя панель: счёт */}
      <View style={s.scoreRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[s.scoreCell, actor === i && s.scoreActive]}>
            <Text style={s.scoreName}>{NAMES[i]}{d.dealer === i ? ' · сдаёт' : ''}</Text>
            <Text style={s.scoreVal}>пуля {game.pulya[i]} · гора {game.gora[i]}</Text>
            <Text style={s.scoreSmall}>{view.handSizes[i]} карт</Text>
          </View>
        ))}
        <Pressable style={s.scoreBtn} onPress={() => setShowScore(true)}><Text style={s.scoreBtnText}>Счёт</Text></Pressable>
      </View>

      <Text style={s.status}>{status}</Text>
      {d.contract && (
        <Text style={s.info}>
          Заказчик: {NAMES[d.declarer!]} — {contractLabel(d.contract)}
          {d.whisters.length ? ` · вистуют: ${d.whisters.map((w) => NAMES[w]).join(', ')}` : ''}
        </Text>
      )}
      {d.mode === 'raspasy' && <Text style={s.info}>Распасы: берите как можно меньше взяток</Text>}

      {/* Стол */}
      <View style={s.table}>
        {play?.exposed && <Text style={s.tableHint}>Открыта карта прикупа: {RANK_LABEL[play.exposed.rank]}{SUIT_SYMBOL[play.exposed.suit]}</Text>}
        <View style={s.trickRow}>
          {play?.trick.map((t) => (
            <View key={`${t.seat}-${t.card.suit}${t.card.rank}`} style={s.trickItem}>
              <Text style={s.trickWho}>{NAMES[t.seat]}</Text>
              <CardView card={t.card} />
            </View>
          ))}
        </View>
        {play && <Text style={s.tableHint}>Взятки: {NAMES.map((n, i) => `${n} ${play.won[i]}`).join(' · ')}</Text>}
        {game.phase === 'dealEnd' && game.results.length > 0 && (
          <View style={s.resultBox}>
            {game.results[game.results.length - 1]!.notes.map((n) => <Text key={n} style={s.resultText}>{n}</Text>)}
            <Text style={s.resultText}>
              Взятки: {game.results[game.results.length - 1]!.tricks.map((t, i) => `${NAMES[i]} ${t}`).join(' · ')}
            </Text>
          </View>
        )}
      </View>

      {/* Панель действий */}
      <ScrollView style={s.panel} contentContainerStyle={s.panelContent}>
        {game.phase === 'auction' && actor === ME && (
          <>
            <View style={s.bidGrid}>
              {[6, 7, 8, 9, 10].map((level) => (
                <View key={level} style={s.bidRow}>
                  {(['S', 'C', 'D', 'H', 'NT'] as const).map((suit) => {
                    const c: Contract = { kind: 'tricks', level: level as 6, suit };
                    const ok = bidSet.has(contractRank(c));
                    return <Btn key={suit} label={contractLabel(c)} disabled={!ok}
                      onPress={() => act((g) => apply(g, { type: 'bid', seat: ME, contract: c }))} />;
                  })}
                </View>
              ))}
            </View>
            <View style={s.bidRow}>
              <Btn label="Мизер" disabled={!bidSet.has(14.5)}
                onPress={() => act((g) => apply(g, { type: 'bid', seat: ME, contract: { kind: 'misere' } }))} />
              <Btn label="Пас" kind="ghost" onPress={() => act((g) => apply(g, { type: 'pass', seat: ME }))} />
            </View>
          </>
        )}

        {game.phase === 'discard' && actor === ME && chosenContract && (
          <>
            {raiseOptions.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {raiseOptions.map((c) => (
                  <Pressable key={contractRank(c)} onPress={() => setDeclare(c)}
                    style={[s.chip, contractRank(c) === contractRank(chosenContract) && s.chipOn]}>
                    <Text style={s.chipText}>{contractLabel(c)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Btn label={`Сбросить ${picked.length}/2 и играть ${contractLabel(chosenContract)}`} disabled={picked.length !== 2}
              onPress={() => act((g) => apply(g, { type: 'discard', seat: ME, cards: [picked[0]!, picked[1]!], contract: chosenContract }))} />
          </>
        )}

        {game.phase === 'whist' && actor === ME && (
          <View style={s.bidRow}>
            <Btn label="Вист" onPress={() => act((g) => apply(g, { type: 'whist', seat: ME, choice: 'whist' }))} />
            <Btn label="Пас" kind="ghost" onPress={() => act((g) => apply(g, { type: 'whist', seat: ME, choice: 'pass' }))} />
          </View>
        )}

        {game.phase === 'dealEnd' && <Btn label="Дальше" onPress={() => act((g) => apply(g, { type: 'next' }))} />}

        {game.phase === 'bulletEnd' && game.settlement && (
          <>
            {game.settlement.balance.map((b, i) => (
              <Text key={i} style={s.finalLine}>{NAMES[i]}: {b > 0 ? '+' : ''}{b.toFixed(1)}</Text>
            ))}
            <Btn label="Новая партия" onPress={() => { setGame(newGame(SOCHI, Math.floor(Math.random() * 2 ** 31))); }} />
          </>
        )}

        {passerOpen !== null && game.phase === 'play' && (
          <>
            <Text style={s.handTitle}>Открытые карты ({NAMES[passerOpen]}, ходите ими вы)</Text>
            <View style={s.hand}>
              {d.hands[passerOpen]!.map((c) => (
                <CardView key={`${c.suit}${c.rank}`} card={c} small
                  dim={!(handToPlay === passerOpen && legal.some((x) => sameCard(x, c)))}
                  onPress={handToPlay === passerOpen && legal.some((x) => sameCard(x, c))
                    ? () => act((g) => apply(g, { type: 'play', seat: passerOpen, card: c })) : undefined} />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Моя рука */}
      <Text style={s.handTitle}>Ваши карты</Text>
      <View style={[s.hand, s.myHand]}>
        {myHand.map((c) => {
          const key = `${c.suit}${c.rank}`;
          if (game.phase === 'discard' && actor === ME) {
            return <CardView key={key} card={c} selected={picked.some((x) => sameCard(x, c))} onPress={() => toggle(c)} />;
          }
          const canPlay = handToPlay === ME && legal.some((x) => sameCard(x, c));
          return <CardView key={key} card={c} dim={handToPlay === ME && !canPlay}
            onPress={canPlay ? () => act((g) => apply(g, { type: 'play', seat: ME, card: c })) : undefined} />;
        })}
      </View>

      <Modal visible={showScore} animationType="slide" transparent onRequestClose={() => setShowScore(false)}>
        <View style={s.modalWrap}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Счёт ({SOCHI.name}, пуля до {game.cfg.bulletTarget})</Text>
            {[0, 1, 2].map((i) => (
              <Text key={i} style={s.modalLine}>
                {NAMES[i]}: пуля {game.pulya[i]}, гора {game.gora[i]}, итог сейчас {preview.balance[i]! > 0 ? '+' : ''}{preview.balance[i]!.toFixed(1)}
              </Text>
            ))}
            <Text style={s.modalNote}>Итог сейчас — расчёт, как если бы пуля закрылась прямо сейчас.</Text>
            <Btn label="Закрыть" onPress={() => setShowScore(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const GREEN = '#0f5132';
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: GREEN, paddingTop: TOP_PAD, paddingHorizontal: 8, paddingBottom: 12 },
  scoreRow: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  scoreCell: { flex: 1, backgroundColor: '#0b3d27', borderRadius: 8, padding: 6, borderWidth: 1, borderColor: 'transparent' },
  scoreActive: { borderColor: '#ffd54a' },
  scoreName: { color: '#fff', fontWeight: '700', fontSize: 11 },
  scoreVal: { color: '#cfe8d8', fontSize: 11 },
  scoreSmall: { color: '#8fb8a0', fontSize: 10 },
  scoreBtn: { backgroundColor: '#ffd54a', borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center' },
  scoreBtnText: { fontWeight: '700', color: '#3b2f00' },
  status: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  info: { color: '#cfe8d8', textAlign: 'center', marginTop: 2, fontSize: 12 },
  table: { minHeight: 130, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  tableHint: { color: '#cfe8d8', fontSize: 12, marginVertical: 2, textAlign: 'center' },
  trickRow: { flexDirection: 'row', gap: 12, minHeight: 70 },
  trickItem: { alignItems: 'center' },
  trickWho: { color: '#cfe8d8', fontSize: 10, marginBottom: 2 },
  resultBox: { backgroundColor: '#0b3d27', borderRadius: 8, padding: 8, marginTop: 6 },
  resultText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  panel: { flexGrow: 0, maxHeight: 250 },
  panelContent: { gap: 8, paddingVertical: 4 },
  bidGrid: { gap: 4 },
  bidRow: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
  btn: { backgroundColor: '#ffd54a', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, minWidth: 52, alignItems: 'center' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#ffd54a' },
  btnDisabled: { opacity: 0.25 },
  btnText: { fontWeight: '700', color: '#3b2f00' },
  btnGhostText: { color: '#ffd54a' },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: '#ffd54a', marginRight: 6 },
  chipOn: { backgroundColor: '#ffd54a' },
  chipText: { fontWeight: '700', color: '#fff' },
  handTitle: { color: '#cfe8d8', fontSize: 11, marginTop: 6, marginBottom: 2 },
  hand: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  myHand: { justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 6, width: 44, height: 62, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#999' },
  cardSmall: { width: 38, height: 50 },
  cardDim: { opacity: 0.35 },
  cardSelected: { borderColor: '#ffd54a', borderWidth: 3, transform: [{ translateY: -8 }] },
  cardText: { fontSize: 17, fontWeight: '700', color: '#111' },
  cardTextSmall: { fontSize: 14 },
  red: { color: '#c62828' },
  finalLine: { color: '#fff', fontSize: 16, textAlign: 'center' },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' },
  modal: { backgroundColor: '#0b3d27', padding: 16, gap: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalLine: { color: '#fff', fontSize: 14 },
  modalNote: { color: '#8fb8a0', fontSize: 12 },
});
