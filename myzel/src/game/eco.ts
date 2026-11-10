import { BASE_ROWS, MAX_ROWS } from './grid.ts'

/**
 * Ökosystem: die zweite Prestige-Ebene über dem Laubfall. Es setzt (fast) alles zurück und gibt dafür dauerhaft
 * „Wissen“: einen Produktionsbonus, zusätzliche Gitterreihen und neue Knotentypen.
 */

/** Gesamter Humus eines Durchgangs, ab dem es den ersten Punkt gibt. */
export const ECO_DIVISOR = 1000
/** Produktion ×(1 + ECO_BONUS · Wissen^ECO_EXPONENT). */
export const ECO_BONUS = 0.6
export const ECO_EXPONENT = 0.9
/** Bei so vielen Wissenspunkten (insgesamt) kommt jeweils eine weitere Gitterreihe dazu. */
export const ECO_ROW_UNLOCKS = [1, 3, 6]

/** Wissenspunkte für ein Ökosystem: Wurzel aus (Humus / ECO_DIVISOR), also immer langsamer wachsend. */
export function ecoGain(totalHumus: number): number {
  const gain = Math.floor(Math.sqrt(Math.max(0, totalHumus) / ECO_DIVISOR))
  return Number.isFinite(gain) ? Math.min(gain, 1e6) : 1e6
}

export function ecoMultiplier(points: number): number {
  return 1 + ECO_BONUS * Math.pow(Math.max(0, points), ECO_EXPONENT)
}

/** Aktive Gitterreihen bei so vielen Wissenspunkten. */
export function rowsFor(points: number): number {
  const extra = ECO_ROW_UNLOCKS.filter((p) => points >= p).length
  return Math.min(MAX_ROWS, BASE_ROWS + extra)
}

/** Humus, den man insgesamt für `points` Wissen in einem Durchgang bräuchte (für die Anzeige). */
export function humusForPoints(points: number): number {
  return points * points * ECO_DIVISOR
}
