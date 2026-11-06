import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, RANK_LABEL, SUIT_SYMBOL } from '@pref/engine';
import { CARD_BACK, CARD_IMAGES } from './cardImages';
import { RED } from './theme';

/** Пропорции карт колоды «Русский стиль». */
export const CARD_RATIO = 425 / 275;

const isRed = (c: Card) => c.suit === 'D' || c.suit === 'H';

/**
 * Карта: рисунок колоды + собственный угловой индекс поверх оригинального.
 * Оригинальные индексы мелкие и на телефоне не читаются, особенно в веере.
 */
export function CardFace({ card, width, onPress, dim, selected, glow }: {
  card: Card; width: number; onPress?: () => void; dim?: boolean; selected?: boolean; glow?: boolean;
}) {
  const height = width * CARD_RATIO;
  const fs = Math.max(11, Math.round(width * 0.24));
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        { width, height, borderRadius: width * 0.07 },
        s.card, dim && s.dim, selected && s.selected, glow && s.glow,
      ]}
    >
      <Image source={CARD_IMAGES[`${card.suit}${card.rank}`]} style={s.img} resizeMode="stretch" />
      <View style={[s.index, { paddingHorizontal: width * 0.03, borderBottomRightRadius: width * 0.08 }]}>
        <Text style={[s.rank, { fontSize: fs, lineHeight: fs * 1.05 }, isRed(card) && s.red]}>{RANK_LABEL[card.rank]}</Text>
        <Text style={[s.suit, { fontSize: fs * 0.95, lineHeight: fs }, isRed(card) && s.red]}>{SUIT_SYMBOL[card.suit]}</Text>
      </View>
    </Pressable>
  );
}

/** Рубашка. rotated: карта лежит боком (рука соперника вдоль края экрана). */
export function CardBack({ width, rotated }: { width: number; rotated?: boolean }) {
  const height = width * CARD_RATIO;
  if (!rotated) {
    return <View style={[{ width, height, borderRadius: width * 0.07 }, s.card]}><Image source={CARD_BACK} style={s.img} /></View>;
  }
  // Повёрнутая карта занимает height×width; transform не влияет на раскладку, поэтому центрируем вручную.
  return (
    <View style={{ width: height, height: width }}>
      <View style={[{
        width, height, borderRadius: width * 0.07, position: 'absolute',
        left: (height - width) / 2, top: (width - height) / 2, transform: [{ rotate: '90deg' }],
      }, s.card]}>
        <Image source={CARD_BACK} style={s.img} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { overflow: 'hidden', backgroundColor: '#f3ead2', borderWidth: StyleSheet.hairlineWidth, borderColor: '#5a5040' },
  img: { width: '100%', height: '100%' },
  index: { position: 'absolute', left: 0, top: 0, alignItems: 'center', backgroundColor: '#f6efdc', paddingTop: 1, paddingBottom: 2 },
  rank: { fontWeight: '800', color: '#1d1a17' },
  suit: { color: '#1d1a17' },
  red: { color: '#c0281f' },
  dim: { opacity: 0.45 },
  selected: { borderColor: RED, borderWidth: 2.5, transform: [{ translateY: -14 }] },
  glow: { borderColor: RED, borderWidth: 2.5 },
});
