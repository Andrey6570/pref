// Конвенция = набор параметров. Движок не знает слов «Сочи/Ленинград/Ростов»,
// он знает только конфиг. Новая конвенция = новый объект + тесты.
//
// ВАЖНО: значения, помеченные ASSUMPTION, взяты по памяти/косвенным источникам
// и не сверены с первоисточником. См. docs/SPEC.md — там таблица открытых вопросов.
export interface RulesConfig {
  name: string;
  /** До скольки пишется пуля. */
  bulletTarget: number;
  /** Цена игры на 6..10 взяток (подтверждено описаниями Сочинки). */
  contractPrice: [number, number, number, number, number];
  /** Цена мизера (подтверждено: 10). */
  misereValue: number;
  /** ASSUMPTION: цена виста за взятку для уровней 6..10. */
  whistPricePerTrick: [number, number, number, number, number];
  /** ASSUMPTION: сколько взяток суммарно должны взять вистующие, чтобы не получить штраф, для 6..10. */
  requiredWhistTricks: [number, number, number, number, number];
  /** Подтверждено описанием: мизер заявляется только «первым словом» игрока. */
  misereOnlyAsFirstWord: boolean;
  /** ASSUMPTION: прогрессия на распасах (1,2,3,...). В Сочинке по умолчанию выключена. */
  raspasyProgression: boolean;
  /** Подтверждено: в Сочинке прикуп на распасах открывается, в Ростове нет. */
  raspasyTalonOpen: boolean;
  /** ASSUMPTION: сколько вистов стоит одно очко пули при итоговом расчёте. */
  pulyaPointValue: number;
}

export const SOCHI: RulesConfig = {
  name: 'Сочинка',
  bulletTarget: 10,
  contractPrice: [2, 4, 6, 8, 10],
  misereValue: 10,
  whistPricePerTrick: [2, 4, 6, 8, 10],
  requiredWhistTricks: [4, 2, 1, 1, 0],
  misereOnlyAsFirstWord: true,
  raspasyProgression: false,
  raspasyTalonOpen: true,
  pulyaPointValue: 10,
};
