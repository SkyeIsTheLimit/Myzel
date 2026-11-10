import Decimal from 'break_infinity.js'

/** Gesammelte Nährstoffe eines Durchgangs, ab denen es den ersten Humus gibt. */
export const HUMUS_DIVISOR = 1e5
/** Faktor des Humus-Bonus: Produktion ×(1 + HUMUS_BONUS · Humus^HUMUS_EXPONENT). */
export const HUMUS_BONUS = 0.15
/** Unter 1: Jeder weitere Humus bringt etwas weniger als der vorige. */
export const HUMUS_EXPONENT = 0.5
/** Offline wird nur mit diesem Faktor verdient (und nur bis `offlineCap`). */
export const OFFLINE_RATE = 0.2

/** Sekunden Produktionszeit, die für eine Abwesenheit angerechnet werden. */
export function offlineEffectiveSeconds(seconds: number): number {
  return Math.max(0, seconds) * OFFLINE_RATE
}

/** Humus für einen Herbst: Wurzel aus (gesammelte Nährstoffe / HUMUS_DIVISOR). */
export function humusGain(runNutrients: Decimal): number {
  const gain = runNutrients.div(HUMUS_DIVISOR).sqrt().floor().toNumber()
  return Number.isFinite(gain) ? Math.min(gain, 1e9) : 1e9
}

export function humusMultiplier(totalHumus: number): number {
  return 1 + HUMUS_BONUS * Math.pow(Math.max(0, totalHumus), HUMUS_EXPONENT)
}

/**
 * Wie weit der Herbst optisch fortgeschritten ist, 0 bis 1 (logarithmisch). Voll bei 1e7: Die Simulation zeigt, dass
 * der erste Herbst erst dort (ca. 10 Humus, nach rund 20 Minuten) wirklich lohnt, nicht schon beim ersten Humus.
 */
export function autumnProgress(runNutrients: Decimal): number {
  const lo = 4 // 1e4
  const hi = 7 // 1e7
  const v = runNutrients.lte(1) ? 0 : runNutrients.log10()
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
}

export interface HumusUpgradeDef {
  id: string
  name: string
  /** Kosten in Humus je Stufe; die Länge ist die maximale Stufe. */
  costs: number[]
  /** Beschreibung des Effekts für eine Stufe (0 = nicht gekauft). */
  effect: (level: number) => string
}

const at = <T>(values: T[], level: number): T => values[Math.min(level, values.length - 1)]

export const START_NUTRIENTS = [0, 200, 1000, 5000, 20_000]
export const START_CELLS = [0, 4, 8, 14, 22]

export function startNutrients(level: number): number {
  return at(START_NUTRIENTS, level)
}

export function startCells(level: number): number {
  return at(START_CELLS, level)
}

/** Zusätzlicher Multiplikator auf die Trüffel-Fundrate. */
export function truffleRateBonus(level: number): number {
  return 1 + 0.25 * level
}

/** Zusätzliche Sekunden, die ein Trüffel liegen bleibt. */
export function truffleLifetimeBonus(level: number): number {
  return 5 * level
}

/** Multiplikator auf alle Gebäudekosten. */
export function buildingCostFactor(level: number): number {
  return Math.pow(0.96, level)
}

export function offlineHours(level: number): number {
  return 2 + level
}

const fmtNum = (n: number): string => (n >= 1000 ? `${(n / 1000).toLocaleString('de-DE')} K` : String(n))

export const HUMUS_UPGRADES: HumusUpgradeDef[] = [
  {
    id: 'seed',
    name: 'Samenvorrat',
    costs: [1, 3, 8, 20],
    effect: (l) => `Start mit ${fmtNum(startNutrients(l))} Nährstoffen`,
  },
  {
    id: 'web',
    name: 'Weites Geflecht',
    costs: [2, 5, 12, 30],
    effect: (l) => `${startCells(l)} Gitterfelder gratis zum Start`,
  },
  {
    id: 'cheap',
    name: 'Sparsame Hyphen',
    costs: [2, 4, 8, 16, 32],
    effect: (l) => `Gebäude ${Math.round((1 - buildingCostFactor(l)) * 100)} % günstiger`,
  },
  {
    id: 'sniff',
    name: 'Trüffelnase',
    costs: [3, 8, 20],
    effect: (l) => `Trüffel ${Math.round((truffleRateBonus(l) - 1) * 100)} % häufiger`,
  },
  {
    id: 'scent',
    name: 'Haftender Duft',
    costs: [2, 6, 15],
    effect: (l) => `Trüffel bleiben +${truffleLifetimeBonus(l)} Sek liegen`,
  },
  {
    id: 'sleep',
    name: 'Langer Schlaf',
    costs: [2, 5, 12],
    effect: (l) => `Offline-Fortschritt bis ${offlineHours(l)} Std`,
  },
]

export function getHumusUpgrade(id: string): HumusUpgradeDef | undefined {
  return HUMUS_UPGRADES.find((u) => u.id === id)
}
