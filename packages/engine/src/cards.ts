// Карты и колода. Масти идут в порядке старшинства при торговле: ♠ < ♣ < ♦ < ♥.
export const SUITS = ['S', 'C', 'D', 'H'] as const;
export type Suit = (typeof SUITS)[number];
export type Rank = 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=В, 12=Д, 13=К, 14=Т
export const RANKS: readonly Rank[] = [7, 8, 9, 10, 11, 12, 13, 14];

export interface Card {
  suit: Suit;
  rank: Rank;
}

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', C: '♣', D: '♦', H: '♥' };
export const RANK_LABEL: Record<Rank, string> = {
  7: '7', 8: '8', 9: '9', 10: '10', 11: 'В', 12: 'Д', 13: 'К', 14: 'Т',
};

export const sameCard = (a: Card, b: Card): boolean => a.suit === b.suit && a.rank === b.rank;
export const cardKey = (c: Card): string => `${c.suit}${c.rank}`;
export const cardLabel = (c: Card): string => `${RANK_LABEL[c.rank]}${SUIT_SYMBOL[c.suit]}`;

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank });
  return deck;
}

/** Сортировка руки для показа: по масти, внутри масти от старшей к младшей. */
export function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const s = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return s !== 0 ? s : b.rank - a.rank;
  });
}
