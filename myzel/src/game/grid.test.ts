import { describe, expect, it } from 'vitest'
import Decimal from 'break_infinity.js'
import {
  CELLS,
  INITIAL_CLAIMED,
  TREE_COLS,
  cellIndex,
  claimedCount,
  gridProduction,
  isClaimable,
  isTreeCell,
  newGrid,
  nodeBreakdown,
  placementGain,
} from './grid.ts'
import {
  canClaim,
  canPlace,
  claimCell,
  deserialize,
  newState,
  placeNode,
  productionPerSecond,
  removeNode,
  serialize,
} from './state.ts'

const rich = () => {
  const s = newState()
  s.nutrients = new Decimal(1e9)
  return s
}

describe('Gitter-Start', () => {
  it('hat Baumfelder und neun freie Startfelder', () => {
    const g = newGrid()
    expect(claimedCount(g)).toBe(INITIAL_CLAIMED)
    for (const c of TREE_COLS) {
      expect(isTreeCell(cellIndex(c, 0))).toBe(true)
      expect(g.claimed[cellIndex(c, 0)]).toBe(false)
      expect(g.claimed[cellIndex(c - 1, 0)]).toBe(true)
      expect(g.claimed[cellIndex(c, 1)]).toBe(true)
    }
  })
})

describe('Erschließen', () => {
  it('nur direkt neben erschlossenen Feldern', () => {
    const s = rich()
    expect(isClaimable(s.grid, cellIndex(2, 0))).toBe(true)
    expect(isClaimable(s.grid, cellIndex(8, 3))).toBe(false)
    expect(canClaim(s, cellIndex(8, 3))).toBe(false)
  })

  it('kostet Nährstoffe und macht das Feld frei', () => {
    const s = rich()
    const i = cellIndex(2, 0)
    const before = s.nutrients
    expect(claimCell(s, i)).toBe(true)
    expect(s.grid.claimed[i]).toBe(true)
    expect(s.nutrients.lt(before)).toBe(true)
  })

  it('Baumfelder lassen sich nicht erschließen', () => {
    expect(isClaimable(newGrid(), cellIndex(TREE_COLS[0], 0))).toBe(false)
  })

  it('wird mit jedem Feld teurer', () => {
    const s = rich()
    const first = s.nutrients
    claimCell(s, cellIndex(2, 0))
    const cost1 = first.sub(s.nutrients)
    const mid = s.nutrients
    claimCell(s, cellIndex(1, 0))
    const cost2 = mid.sub(s.nutrients)
    expect(cost2.gt(cost1)).toBe(true)
  })
})

describe('Knoten', () => {
  it('Wurzelkontakt neben Baum bekommt +150 %', () => {
    const s = rich()
    const i = cellIndex(TREE_COLS[0] - 1, 0)
    expect(placeNode(s, i, 'root')).toBe(true)
    const b = nodeBreakdown(s.grid.nodes, i, 'root')
    expect(b.production).toBeCloseTo(0.8 * 2.5)
    expect(b.parts[0].label).toBe('Baumwurzel')
  })

  it('tiefere Reihen produzieren mehr', () => {
    const nodes = Array<string | null>(CELLS).fill(null)
    const shallow = nodeBreakdown(nodes, cellIndex(0, 1), 'decomposer').production
    const deep = nodeBreakdown(nodes, cellIndex(0, 5), 'decomposer').production
    expect(deep).toBeGreaterThan(shallow)
  })

  it('Leitbahn verstärkt Nachbarn und Zersetzer zählen Wurzelkontakte', () => {
    const nodes = Array<string | null>(CELLS).fill(null)
    const d = cellIndex(10, 0)
    nodes[d] = 'decomposer'
    const alone = nodeBreakdown(nodes, d, 'decomposer').production
    nodes[cellIndex(9, 0)] = 'root'
    nodes[cellIndex(11, 0)] = 'conduit'
    const boosted = nodeBreakdown(nodes, d, 'decomposer').production
    expect(boosted).toBeCloseTo(alone * (1 + 0.5 + 0.4))
  })

  it('Fruchtknoten nur in den obersten zwei Reihen', () => {
    const s = rich()
    s.grid.claimed[cellIndex(0, 4)] = true
    expect(canPlace(s, cellIndex(0, 4), 'fruit')).toBe(false)
    s.grid.claimed[cellIndex(0, 1)] = true
    expect(canPlace(s, cellIndex(0, 1), 'fruit')).toBe(true)
  })

  it('nicht auf nicht erschlossenen oder belegten Feldern', () => {
    const s = rich()
    expect(canPlace(s, cellIndex(10, 5), 'root')).toBe(false)
    const i = cellIndex(TREE_COLS[0] + 1, 0)
    placeNode(s, i, 'root')
    expect(canPlace(s, i, 'root')).toBe(false)
  })

  it('placementGain stimmt mit der tatsächlichen Änderung überein', () => {
    const s = rich()
    const i = cellIndex(TREE_COLS[1] + 1, 0)
    const before = gridProduction(s.grid)
    const predicted = placementGain(s.grid, i, 'root')
    placeNode(s, i, 'root')
    expect(gridProduction(s.grid) - before).toBeCloseTo(predicted)
  })

  it('Produktion fließt in die Gesamtproduktion ein', () => {
    const s = rich()
    expect(productionPerSecond(s).toNumber()).toBe(0)
    placeNode(s, cellIndex(TREE_COLS[0] - 1, 0), 'root')
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(2)
  })

  it('Entfernen erstattet die Hälfte', () => {
    const s = rich()
    const i = cellIndex(TREE_COLS[0] - 1, 0)
    placeNode(s, i, 'root')
    const afterBuy = s.nutrients
    expect(removeNode(s, i)).toBe(true)
    expect(s.nutrients.sub(afterBuy).toNumber()).toBe(30)
    expect(s.grid.nodes[i]).toBeNull()
    expect(removeNode(s, i)).toBe(false)
  })
})

describe('Speichern mit Gitter', () => {
  it('Round-Trip erhält Felder und Knoten', () => {
    const s = rich()
    claimCell(s, cellIndex(2, 0))
    placeNode(s, cellIndex(TREE_COLS[0] - 1, 0), 'root')
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(s))))!
    expect(loaded.grid.claimed).toEqual(s.grid.claimed)
    expect(loaded.grid.nodes).toEqual(s.grid.nodes)
  })

  it('alte Spielstände ohne Gitter bekommen das Startgitter', () => {
    const old = { ...serialize(newState()), version: 1 } as Record<string, unknown>
    delete old.grid
    const loaded = deserialize(old)!
    expect(claimedCount(loaded.grid)).toBe(INITIAL_CLAIMED)
  })

  it('ignoriert manipulierte Knoten auf Baumfeldern', () => {
    const data = serialize(newState())
    data.grid!.nodes[cellIndex(TREE_COLS[0], 0)] = 'root'
    const loaded = deserialize(data)!
    expect(loaded.grid.nodes[cellIndex(TREE_COLS[0], 0)]).toBeNull()
  })
})
