import Decimal from 'break_infinity.js'
import { BUILDINGS, NODES, UPGRADES, getBuilding } from './data.ts'
import type { BuildingDef, UpgradeDef } from './data.ts'
import {
  CELLS,
  REFUND_RATE,
  canPlaceAt,
  claimCostValue,
  gridProduction,
  isClaimable,
  isTreeCell,
  newGrid,
  nodeCostValue,
  nodeCountOf,
  placementGain,
} from './grid.ts'
import type { Grid } from './grid.ts'
import { BUFFS, MAX_PIGS, getBuffDef, pigCost, rollReward } from './truffle.ts'
import type { BuffType } from './truffle.ts'
import { formatNumber } from './format.ts'

export const TICK_RATE = 10
export const SAVE_VERSION = 3
export const MAX_OFFLINE_SECONDS = 8 * 3600

export interface GameState {
  nutrients: Decimal
  totalNutrients: Decimal
  buildings: Record<string, number>
  upgrades: string[]
  clicks: number
  grid: Grid
  pigs: number
  trufflesFound: number
  buffs: ActiveBuff[]
  /** Unix-Zeit (ms) des letzten Speicherns, für den Offline-Fortschritt. */
  lastSaved: number
}

export interface ActiveBuff {
  id: string
  /** Verbleibende Sekunden. */
  remaining: number
}

export interface SaveData {
  version: number
  nutrients: string
  totalNutrients: string
  buildings: Record<string, number>
  upgrades: string[]
  clicks: number
  /** Ab Version 2: `claimed` als Folge von '0'/'1', `nodes` mit leerem String für freie Felder. */
  grid?: { claimed: string; nodes: string[] }
  /** Ab Version 3. */
  pigs?: number
  trufflesFound?: number
  buffs?: ActiveBuff[]
  lastSaved: number
}

export function newState(now = Date.now()): GameState {
  const buildings: Record<string, number> = {}
  for (const b of BUILDINGS) buildings[b.id] = 0
  return {
    nutrients: new Decimal(0),
    totalNutrients: new Decimal(0),
    buildings,
    upgrades: [],
    clicks: 0,
    grid: newGrid(),
    pigs: 0,
    trufflesFound: 0,
    buffs: [],
    lastSaved: now,
  }
}

export function buildingCost(def: BuildingDef, owned: number): Decimal {
  return Decimal.floor(new Decimal(def.baseCost).mul(Decimal.pow(def.costGrowth, owned)))
}

function upgradeMult(state: GameState, match: (u: UpgradeDef) => boolean): number {
  let mult = 1
  for (const id of state.upgrades) {
    const u = UPGRADES.find((x) => x.id === id)
    if (u && match(u)) mult *= u.effect.mult
  }
  return mult
}

/** Produktion eines einzelnen Gebäudes inklusive Gebäude-Upgrades. */
export function unitProduction(state: GameState, def: BuildingDef): Decimal {
  const mult = upgradeMult(state, (u) => u.effect.type === 'building' && u.effect.target === def.id)
  return new Decimal(def.baseProd).mul(mult)
}

export function buildingProduction(state: GameState, def: BuildingDef): Decimal {
  return unitProduction(state, def).mul(state.buildings[def.id] ?? 0)
}

export function globalMult(state: GameState): number {
  return upgradeMult(state, (u) => u.effect.type === 'global')
}

/** Produkt aller aktiven Trüffel-Buffs des Typs. */
export function buffMult(state: GameState, type: BuffType): number {
  let mult = 1
  for (const b of state.buffs) {
    const def = getBuffDef(b.id)
    if (def && def.type === type) mult *= def.mult
  }
  return mult
}

/** Mit `withBuffs = false` ohne temporäre Trüffel-Buffs, z. B. als Grundlage für Einmal-Belohnungen. */
export function productionPerSecond(state: GameState, withBuffs = true): Decimal {
  let sum = new Decimal(gridProduction(state.grid))
  for (const def of BUILDINGS) sum = sum.add(buildingProduction(state, def))
  sum = sum.mul(globalMult(state))
  return withBuffs ? sum.mul(buffMult(state, 'production')) : sum
}

export function clickValue(state: GameState): Decimal {
  const mult = upgradeMult(state, (u) => u.effect.type === 'click')
  // Klicken skaliert leicht mit der Produktion, damit es auch später relevant bleibt.
  return new Decimal(1).mul(mult).add(productionPerSecond(state).mul(0.01)).mul(buffMult(state, 'click'))
}

export function totalBuildings(state: GameState): number {
  return Object.values(state.buildings).reduce((a, b) => a + b, 0)
}

/** Steuert, wie weit das Myzel optisch gewachsen ist: Gebäude plus Gitterknoten (zählen dreifach). */
export function growthScore(state: GameState): number {
  return totalBuildings(state) + 3 * state.grid.nodes.filter(Boolean).length
}

export function claimCost(state: GameState, i: number): Decimal {
  return new Decimal(claimCostValue(state.grid, i))
}

export function canClaim(state: GameState, i: number): boolean {
  return isClaimable(state.grid, i) && state.nutrients.gte(claimCostValue(state.grid, i))
}

export function claimCell(state: GameState, i: number): boolean {
  if (!canClaim(state, i)) return false
  state.nutrients = state.nutrients.sub(claimCostValue(state.grid, i))
  state.grid.claimed[i] = true
  return true
}

export function nodeCost(state: GameState, id: string): Decimal {
  return new Decimal(nodeCostValue(id, nodeCountOf(state.grid, id)))
}

export function canPlace(state: GameState, i: number, id: string): boolean {
  return canPlaceAt(state.grid, i, id) && state.nutrients.gte(nodeCost(state, id))
}

export function placeNode(state: GameState, i: number, id: string): boolean {
  if (!canPlace(state, i, id)) return false
  state.nutrients = state.nutrients.sub(nodeCost(state, id))
  state.grid.nodes[i] = id
  return true
}

/** Rückerstattung beim Entfernen: Teil des Preises des zuletzt gekauften Knotens dieses Typs. */
export function removeRefund(state: GameState, id: string): Decimal {
  const owned = nodeCountOf(state.grid, id)
  return new Decimal(Math.floor(nodeCostValue(id, Math.max(0, owned - 1)) * REFUND_RATE))
}

export function removeNode(state: GameState, i: number): boolean {
  const id = state.grid.nodes[i]
  if (!id) return false
  state.nutrients = state.nutrients.add(removeRefund(state, id))
  state.grid.nodes[i] = null
  return true
}

/** Zusatzproduktion pro Sekunde, wenn auf Feld `i` ein Knoten `id` gesetzt wird (inkl. globaler Multiplikatoren). */
export function placementGainPerSecond(state: GameState, i: number, id: string): Decimal {
  return new Decimal(placementGain(state.grid, i, id)).mul(globalMult(state))
}

export function canBuyBuilding(state: GameState, id: string): boolean {
  const def = getBuilding(id)
  return state.nutrients.gte(buildingCost(def, state.buildings[id] ?? 0))
}

export function buyBuilding(state: GameState, id: string): boolean {
  const def = getBuilding(id)
  const owned = state.buildings[id] ?? 0
  const cost = buildingCost(def, owned)
  if (state.nutrients.lt(cost)) return false
  state.nutrients = state.nutrients.sub(cost)
  state.buildings[id] = owned + 1
  return true
}

export function isUpgradeVisible(state: GameState, def: UpgradeDef): boolean {
  return !state.upgrades.includes(def.id) && state.totalNutrients.gte(def.unlockAt)
}

export function canBuyUpgrade(state: GameState, def: UpgradeDef): boolean {
  return isUpgradeVisible(state, def) && state.nutrients.gte(def.cost)
}

export function buyUpgrade(state: GameState, id: string): boolean {
  const def = UPGRADES.find((u) => u.id === id)
  if (!def || !canBuyUpgrade(state, def)) return false
  state.nutrients = state.nutrients.sub(def.cost)
  state.upgrades.push(def.id)
  return true
}

export function addNutrients(state: GameState, amount: Decimal): void {
  state.nutrients = state.nutrients.add(amount)
  state.totalNutrients = state.totalNutrients.add(amount)
}

export function click(state: GameState): Decimal {
  const gain = clickValue(state)
  addNutrients(state, gain)
  state.clicks += 1
  return gain
}

export function tick(state: GameState, dtSeconds: number): void {
  let left = dtSeconds
  while (left > 0) {
    state.buffs = state.buffs.filter((b) => b.remaining > 1e-9)
    // In Schritten bis zum nächsten Buff-Ende, damit der Buff nie länger als nötig zählt (auch offline).
    let step = left
    for (const b of state.buffs) step = Math.min(step, b.remaining)
    addNutrients(state, productionPerSecond(state).mul(step))
    for (const b of state.buffs) b.remaining -= step
    left -= step
  }
  state.buffs = state.buffs.filter((b) => b.remaining > 1e-9)
}

export function canBuyPig(state: GameState): boolean {
  return state.pigs < MAX_PIGS && state.nutrients.gte(pigCost(state.pigs))
}

export function buyPig(state: GameState): boolean {
  if (!canBuyPig(state)) return false
  state.nutrients = state.nutrients.sub(pigCost(state.pigs))
  state.pigs += 1
  return true
}

export interface TruffleResult {
  title: string
  detail: string
}

function addBuff(state: GameState, id: string): void {
  const def = getBuffDef(id)
  if (!def) return
  const existing = state.buffs.find((b) => b.id === id)
  if (existing) existing.remaining = def.duration
  else state.buffs.push({ id, remaining: def.duration })
}

/** Wendet die Belohnung eines gefundenen Trüffels an; `rand` in [0, 1) wählt sie aus. */
export function collectTruffle(state: GameState, rand: number): TruffleResult {
  const reward = rollReward(rand)
  state.trufflesFound += 1
  const base = productionPerSecond(state, false)
  switch (reward.id) {
    case 'frenzy':
    case 'clickfrenzy': {
      const def = BUFFS.find((b) => b.id === reward.id)!
      addBuff(state, def.id)
      const what = def.type === 'production' ? 'Produktion' : 'Klick-Ertrag'
      return { title: def.name, detail: `${what} ×${def.mult} für ${def.duration} Sek` }
    }
    case 'lucky':
    default: {
      const gain = Decimal.min(state.nutrients.mul(0.15), base.mul(900)).add(13)
      addNutrients(state, gain)
      return { title: 'Trüffel gefunden', detail: `+${formatNumber(gain)} Nährstoffe` }
    }
  }
}

/** Rechnet die Abwesenheit nach; gibt die verdienten Nährstoffe und die angerechneten Sekunden zurück. */
export function applyOffline(state: GameState, now = Date.now()): { gained: Decimal; seconds: number } {
  const seconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (now - state.lastSaved) / 1000))
  const before = state.nutrients
  tick(state, seconds)
  state.lastSaved = now
  return { gained: state.nutrients.sub(before), seconds }
}

export function serialize(state: GameState, now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    nutrients: state.nutrients.toString(),
    totalNutrients: state.totalNutrients.toString(),
    buildings: { ...state.buildings },
    upgrades: [...state.upgrades],
    clicks: state.clicks,
    grid: {
      claimed: state.grid.claimed.map((c) => (c ? '1' : '0')).join(''),
      nodes: state.grid.nodes.map((n) => n ?? ''),
    },
    pigs: state.pigs,
    trufflesFound: state.trufflesFound,
    buffs: state.buffs.map((b) => ({ id: b.id, remaining: b.remaining })),
    lastSaved: now,
  }
}

function deserializeGrid(data: SaveData['grid']): Grid {
  const grid = newGrid()
  if (!data || typeof data.claimed !== 'string' || !Array.isArray(data.nodes)) return grid
  if (data.claimed.length !== CELLS || data.nodes.length !== CELLS) return grid
  for (let i = 0; i < CELLS; i++) {
    if (isTreeCell(i)) continue
    grid.claimed[i] = data.claimed[i] === '1'
    const id = data.nodes[i]
    grid.nodes[i] = grid.claimed[i] && NODES.some((n) => n.id === id) ? id : null
  }
  return grid
}

export function deserialize(data: unknown): GameState | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Partial<SaveData>
  // Version 1 hatte noch kein Gitter; es wird dann mit den Startfeldern angelegt.
  if (d.version !== 1 && d.version !== 2 && d.version !== SAVE_VERSION) return null
  if (typeof d.nutrients !== 'string' || typeof d.totalNutrients !== 'string') return null
  const state = newState(typeof d.lastSaved === 'number' ? d.lastSaved : Date.now())
  state.nutrients = new Decimal(d.nutrients)
  state.totalNutrients = new Decimal(d.totalNutrients)
  for (const b of BUILDINGS) {
    const n = d.buildings?.[b.id]
    state.buildings[b.id] = typeof n === 'number' && n >= 0 ? Math.floor(n) : 0
  }
  state.upgrades = Array.isArray(d.upgrades) ? d.upgrades.filter((id) => UPGRADES.some((u) => u.id === id)) : []
  state.clicks = typeof d.clicks === 'number' ? d.clicks : 0
  state.grid = deserializeGrid(d.grid)
  state.pigs = typeof d.pigs === 'number' ? Math.min(MAX_PIGS, Math.max(0, Math.floor(d.pigs))) : 0
  state.trufflesFound = typeof d.trufflesFound === 'number' ? Math.max(0, Math.floor(d.trufflesFound)) : 0
  state.buffs = Array.isArray(d.buffs)
    ? d.buffs.filter((b) => typeof b?.remaining === 'number' && b.remaining > 0 && getBuffDef(b.id)).map((b) => ({ id: b.id, remaining: b.remaining }))
    : []
  return state
}
