import { NODES, getNode } from './data.ts'

export const GRID_COLS = 24
/** Reihen zu Beginn; das Ökosystem schaltet bis `MAX_ROWS` weitere frei. */
export const BASE_ROWS = 7
export const MAX_ROWS = 10
export const GRID_ROWS = MAX_ROWS
/** Alle Felder, auch die noch gesperrten Reihen: Felder und Knoten sind immer so groß. */
export const CELLS = GRID_COLS * MAX_ROWS
export const BASE_CELLS = GRID_COLS * BASE_ROWS
/** Spalten der drei Bäume; ihre Wurzelfelder liegen in der obersten Bodenreihe. */
export const TREE_COLS = [4, 12, 20]
export const DEPTH_BONUS = 0.2
export const CLAIM_BASE_COST = 25
export const CLAIM_GROWTH = 1.15
export const REFUND_RATE = 0.5

export interface Grid {
  claimed: boolean[]
  nodes: Array<string | null>
  /** Aktive Reihen (7 bis 10); Felder darunter sind noch nicht freigeschaltet. */
  rows: number
}

export const cellIndex = (col: number, row: number): number => row * GRID_COLS + col
export const colOf = (i: number): number => i % GRID_COLS
export const rowOf = (i: number): number => Math.floor(i / GRID_COLS)

export function isTreeCell(i: number): boolean {
  return rowOf(i) === 0 && TREE_COLS.includes(colOf(i))
}

/** Orthogonale Nachbarn innerhalb des Gitters. */
export function neighbors(i: number): number[] {
  const col = colOf(i)
  const row = rowOf(i)
  const result: number[] = []
  if (col > 0) result.push(i - 1)
  if (col < GRID_COLS - 1) result.push(i + 1)
  if (row > 0) result.push(i - GRID_COLS)
  if (row < GRID_ROWS - 1) result.push(i + GRID_COLS)
  return result
}

/** Startfelder: links und rechts neben jedem Baum sowie darunter. */
export function newGrid(rows = BASE_ROWS): Grid {
  const grid: Grid = { claimed: Array<boolean>(CELLS).fill(false), nodes: Array<string | null>(CELLS).fill(null), rows }
  for (const c of TREE_COLS) {
    grid.claimed[cellIndex(c - 1, 0)] = true
    grid.claimed[cellIndex(c + 1, 0)] = true
    grid.claimed[cellIndex(c, 1)] = true
  }
  return grid
}

export const INITIAL_CLAIMED = TREE_COLS.length * 3

export function claimedCount(grid: Grid): number {
  return grid.claimed.filter(Boolean).length
}

export function isClaimable(grid: Grid, i: number): boolean {
  if (grid.claimed[i] || isTreeCell(i) || rowOf(i) >= grid.rows) return false
  return neighbors(i).some((n) => grid.claimed[n] || isTreeCell(n))
}

/** `freeBase`: so viele erschlossene Felder gelten als geschenkt (Startfelder plus Humus-Bonus). */
export function claimCostValue(grid: Grid, i: number, freeBase = INITIAL_CLAIMED): number {
  const extra = Math.max(0, claimedCount(grid) - freeBase)
  return Math.floor(CLAIM_BASE_COST * Math.pow(CLAIM_GROWTH, extra) * (1 + 0.35 * rowOf(i)))
}

/** Erschließt `count` Felder rund um die Bäume, flache und baumnahe zuerst (Humus-Bonus beim Herbst). */
export function claimStartCells(grid: Grid, count: number): void {
  for (let n = 0; n < count; n++) {
    let best = -1
    let bestScore = Infinity
    for (let i = 0; i < CELLS; i++) {
      if (!isClaimable(grid, i)) continue
      const dist = Math.min(...TREE_COLS.map((c) => Math.abs(colOf(i) - c)))
      const score = rowOf(i) * 4 + dist
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best < 0) return
    grid.claimed[best] = true
  }
}

export function nodeCountOf(grid: Grid, id: string): number {
  return grid.nodes.filter((n) => n === id).length
}

export function nodeCostValue(id: string, owned: number): number {
  const def = getNode(id)
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, owned))
}

export function canPlaceAt(grid: Grid, i: number, id: string): boolean {
  const def = getNode(id)
  if (!grid.claimed[i] || grid.nodes[i] !== null) return false
  if (def.maxRow !== undefined && rowOf(i) > def.maxRow) return false
  return def.minRow === undefined || rowOf(i) >= def.minRow
}

export interface BonusPart {
  /** Anzeigename des Nachbarn. */
  label: string
  count: number
  bonus: number
}

export interface NodeBreakdown {
  production: number
  base: number
  depth: number
  parts: BonusPart[]
}

function neighborType(nodes: Array<string | null>, n: number): string | null {
  return isTreeCell(n) ? 'tree' : nodes[n]
}

export function neighborLabel(type: string): string {
  return type === 'tree' ? 'Baumwurzel' : getNode(type).name
}

/** Produktion eines Knotens vom Typ `id` auf Feld `i`, aufgeschlüsselt nach Boni. */
export function nodeBreakdown(nodes: Array<string | null>, i: number, id: string): NodeBreakdown {
  const def = getNode(id)
  const around = neighbors(i).map((n) => neighborType(nodes, n))
  const parts: BonusPart[] = []
  let bonus = 0
  for (const rule of def.rules) {
    const count = around.filter((t) => t === rule.neighbor).length
    if (count > 0) {
      parts.push({ label: neighborLabel(rule.neighbor), count, bonus: rule.bonus * count })
      bonus += rule.bonus * count
    }
  }
  const depth = 1 + DEPTH_BONUS * rowOf(i)
  return { production: def.baseProd * depth * (1 + bonus), base: def.baseProd, depth, parts }
}

export function gridProduction(grid: Grid): number {
  let sum = 0
  grid.nodes.forEach((id, i) => {
    if (id) sum += nodeBreakdown(grid.nodes, i, id).production
  })
  return sum
}

/** Wie viel zusätzliche Produktion (ohne globale Multiplikatoren) ein neuer Knoten auf Feld `i` bringt. */
export function placementGain(grid: Grid, i: number, id: string): number {
  const nodes = [...grid.nodes]
  nodes[i] = id
  let after = 0
  nodes.forEach((t, k) => {
    if (t) after += nodeBreakdown(nodes, k, t).production
  })
  return after - gridProduction(grid)
}

export const NODE_IDS: string[] = NODES.map((n) => n.id)
