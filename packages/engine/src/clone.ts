// Состояние игры — чистый JSON, поэтому клонируем так: работает в любом JS-рантайме
// (в том числе в Hermes, где structuredClone может отсутствовать).
export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
