/** Sporen pro Sekunde je Fruchtkörper (Gebäude). */
export const SPORES_PER_FRUITING = 0.005
/** Sporen pro Sekunde je Fruchtknoten (Gitterknoten). */
export const SPORES_PER_FRUIT_NODE = 0.025

export interface SporeUpgradeDef {
  id: string
  name: string
  /** Kosten in Sporen je Stufe; die Länge ist die maximale Stufe. */
  costs: number[]
  /** Beschreibung des Effekts für eine Stufe (0 = nicht gekauft). */
  effect: (level: number) => string
}

/** Kosten, die von Stufe zu Stufe um `ratio` wachsen. */
const geo = (base: number, ratio: number, levels: number): number[] =>
  Array.from({ length: levels }, (_, i) => Math.round(base * Math.pow(ratio, i)))

const pct = (mult: number): string => `+${Math.round((mult - 1) * 100)} %`

/** Multiplikator auf die gesamte Produktion. */
export function denseMult(level: number): number {
  return 1 + 0.15 * level
}

/** Multiplikator auf die Sporenproduktion. */
export function harvestMult(level: number): number {
  return 1 + 0.5 * level
}

/** Multiplikator auf Hyphen und Myzelstränge. */
export function germMult(level: number): number {
  return 1 + level
}

/** Multiplikator auf Fruchtkörper und Fruchtknoten. */
export function bloomMult(level: number): number {
  return 1 + 0.5 * level
}

export const SPORE_UPGRADES: SporeUpgradeDef[] = [
  {
    id: 'dense',
    name: 'Dichte Sporen',
    costs: geo(20, 1.6, 20),
    effect: (l) => `Alle Produktion ${pct(denseMult(l))}`,
  },
  {
    id: 'harvest',
    name: 'Sporenernte',
    costs: geo(15, 2.5, 10),
    effect: (l) => `Sporen ${pct(harvestMult(l))}`,
  },
  {
    id: 'germ',
    name: 'Keimlinge',
    costs: geo(40, 5, 6),
    effect: (l) => `Hyphen und Myzelstränge ×${germMult(l)}`,
  },
  {
    id: 'bloom',
    name: 'Blütenpracht',
    costs: geo(80, 5, 7),
    effect: (l) => `Fruchtkörper und Fruchtknoten ${pct(bloomMult(l))}`,
  },
]

export function getSporeUpgrade(id: string): SporeUpgradeDef | undefined {
  return SPORE_UPGRADES.find((u) => u.id === id)
}
