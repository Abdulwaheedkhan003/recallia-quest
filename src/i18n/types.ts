import type { Dict } from './locales/en'

/** A locale may translate any subset of the English dictionary, at any depth. Missing keys fall back to English. */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> }
export type Partial2 = DeepPartial<Dict>
export type { Dict }
