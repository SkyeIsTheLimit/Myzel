export type BuffType = 'production' | 'click'

export interface BuffDef {
  id: string
  name: string
  type: BuffType
  mult: number
  /** Dauer in Sekunden. */
  duration: number
}

export const BUFFS: BuffDef[] = [
  { id: 'frenzy', name: 'Wachstumsschub', type: 'production', mult: 7, duration: 30 },
  { id: 'clickfrenzy', name: 'Klick-Rausch', type: 'click', mult: 20, duration: 15 },
]

export type RewardId = 'lucky' | 'frenzy' | 'clickfrenzy'

export interface RewardDef {
  id: RewardId
  name: string
  weight: number
}

export const REWARDS: RewardDef[] = [
  { id: 'lucky', name: 'Nährstoff-Fund', weight: 64 },
  { id: 'frenzy', name: 'Wachstumsschub', weight: 28 },
  { id: 'clickfrenzy', name: 'Klick-Rausch', weight: 8 },
]

export const MAX_PIGS = 5
/** Preise der Schweine der Reihe nach: das erste ist früh bezahlbar, jedes weitere kostet das Zehnfache. */
export const PIG_COSTS = [100, 1_000, 10_000, 100_000, 1_000_000]
/** Jedes Schwein erhöht die Fundrate um diesen Anteil der Basisrate (5 Schweine = ×3). */
export const PIG_RATE_BONUS = 0.4

/** Ohne Schweine dauert es im Schnitt 9 Minuten; mit 5 Schweinen etwa 3 Minuten. */
export const TRUFFLE_MIN_DELAY = 360
export const TRUFFLE_MAX_DELAY = 720
/** Wartezeit bis zum ersten Trüffel einer Sitzung, damit man das System früh kennenlernt. */
export const TRUFFLE_FIRST_MIN = 60
export const TRUFFLE_FIRST_MAX = 150
/** Sekunden, die ein Trüffel liegen bleibt, bevor er verschwindet. */
export const TRUFFLE_LIFETIME = 16

export function getBuffDef(id: string): BuffDef | undefined {
  return BUFFS.find((b) => b.id === id)
}

export function pigCost(owned: number): number {
  return PIG_COSTS[Math.min(owned, PIG_COSTS.length - 1)]
}

export function spawnRateMultiplier(pigs: number): number {
  return 1 + PIG_RATE_BONUS * pigs
}

/** Wartezeit bis zum nächsten Trüffel; `rand` in [0, 1), `bonus` z. B. aus Humus-Verbesserungen. */
export function nextSpawnDelay(rand: number, pigs: number, bonus = 1): number {
  return (TRUFFLE_MIN_DELAY + rand * (TRUFFLE_MAX_DELAY - TRUFFLE_MIN_DELAY)) / (spawnRateMultiplier(pigs) * bonus)
}

/** Wählt eine Belohnung nach Gewicht; `rand` in [0, 1). */
export function rollReward(rand: number): RewardDef {
  const total = REWARDS.reduce((sum, r) => sum + r.weight, 0)
  let pick = rand * total
  for (const reward of REWARDS) {
    pick -= reward.weight
    if (pick < 0) return reward
  }
  return REWARDS[0]
}
