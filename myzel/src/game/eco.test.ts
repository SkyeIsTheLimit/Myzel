import { describe, expect, it } from 'vitest'
import Decimal from 'break_infinity.js'
import { ECO_DIVISOR, ecoGain, ecoMultiplier, rowsFor } from './eco.ts'
import { BASE_CELLS, BASE_ROWS, CELLS, MAX_ROWS, canPlaceAt, cellIndex, isClaimable, newGrid } from './grid.ts'
import {
  canEco,
  canPlace,
  deserialize,
  ecoGainNow,
  ecoPrestige,
  newState,
  nodeUnlocked,
  productionPerSecond,
  serialize,
  clickValue,
} from './state.ts'
import { getNode } from './data.ts'

describe('Ökosystem-Formel', () => {
  it('der erste Punkt kommt bei 1.000 Humus', () => {
    expect(ecoGain(999)).toBe(0)
    expect(ecoGain(ECO_DIVISOR)).toBe(1)
  })

  it('wächst nicht linear: Wurzel aus dem Humus', () => {
    expect(ecoGain(4000)).toBe(2)
    expect(ecoGain(9000)).toBe(3)
    expect(ecoGain(100_000)).toBe(10)
  })

  it('bleibt bei riesigen Zahlen endlich', () => {
    expect(Number.isFinite(ecoGain(1e300))).toBe(true)
    expect(ecoGain(-5)).toBe(0)
  })

  it('Bonus wächst langsamer als linear', () => {
    expect(ecoMultiplier(0)).toBe(1)
    expect(ecoMultiplier(1)).toBeCloseTo(1.6)
    expect(ecoMultiplier(10) - ecoMultiplier(5)).toBeLessThan(2 * (ecoMultiplier(5) - ecoMultiplier(0)))
  })

  it('Reihen kommen bei 1, 3 und 6 Punkten dazu', () => {
    expect(rowsFor(0)).toBe(BASE_ROWS)
    expect(rowsFor(1)).toBe(BASE_ROWS + 1)
    expect(rowsFor(2)).toBe(BASE_ROWS + 1)
    expect(rowsFor(3)).toBe(BASE_ROWS + 2)
    expect(rowsFor(6)).toBe(MAX_ROWS)
    expect(rowsFor(500)).toBe(MAX_ROWS)
  })
})

describe('Ökosystem gründen', () => {
  const rich = () => {
    const s = newState()
    s.totalHumus = 4000
    s.humus = 123
    s.humusLevels = { seed: 2 }
    s.autumns = 6
    s.spores = 500
    s.sporeLevels = { dense: 3 }
    s.web = ['link-1']
    s.pigs = 3
    s.buildings.hypha = 40
    s.upgrades = ['moist']
    s.nutrients = new Decimal(5e6)
    s.totalNutrients = new Decimal(5e6)
    s.lifetimeNutrients = new Decimal(9e9)
    s.clicks = 777
    s.trufflesFound = 42
    s.achievements = ['click-100']
    s.grid.claimed[cellIndex(3, 1)] = true
    s.grid.nodes[cellIndex(3, 1)] = 'root'
    return s
  }

  it('erst ab 1.000 Humus möglich', () => {
    const s = newState()
    s.totalHumus = 900
    expect(canEco(s)).toBe(false)
    expect(ecoPrestige(s)).toBe(0)
    expect(s.ecoPoints).toBe(0)
  })

  it('gibt Wissen und zählt die Ökosysteme', () => {
    const s = rich()
    expect(ecoGainNow(s)).toBe(2)
    expect(ecoPrestige(s)).toBe(2)
    expect(s.ecoPoints).toBe(2)
    expect(s.ecos).toBe(1)
  })

  it('setzt alles zurück, auch Schweine, Humus, Sporen und das Wood Wide Web', () => {
    const s = rich()
    ecoPrestige(s)
    expect(s.nutrients.toNumber()).toBe(0)
    expect(s.buildings.hypha).toBe(0)
    expect(s.upgrades).toEqual([])
    expect(s.pigs).toBe(0)
    expect(s.humus).toBe(0)
    expect(s.totalHumus).toBe(0)
    expect(s.humusLevels).toEqual({})
    expect(s.autumns).toBe(0)
    expect(s.spores).toBe(0)
    expect(s.sporeLevels).toEqual({})
    expect(s.web).toEqual([])
    expect(s.grid.nodes.filter(Boolean)).toHaveLength(0)
  })

  it('behält Wissen, Erfolge und die Zähler', () => {
    const s = rich()
    ecoPrestige(s)
    expect(s.achievements).toEqual(['click-100'])
    expect(s.clicks).toBe(777)
    expect(s.trufflesFound).toBe(42)
    expect(s.lifetimeNutrients.toNumber()).toBe(9e9)
  })

  it('ein zweites Ökosystem braucht wieder neuen Humus', () => {
    const s = rich()
    ecoPrestige(s)
    expect(canEco(s)).toBe(false)
    s.totalHumus = 1000
    expect(ecoPrestige(s)).toBe(1)
    expect(s.ecoPoints).toBe(3)
    expect(s.ecos).toBe(2)
  })

  it('der Bonus wirkt auf Produktion und Klicks', () => {
    const s = newState()
    s.buildings.hypha = 10
    const prod = productionPerSecond(s).toNumber()
    const click = clickValue(s).toNumber()
    s.ecoPoints = 4
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(prod * ecoMultiplier(4))
    expect(clickValue(s).toNumber()).toBeGreaterThan(click * 2)
  })
})

describe('mehr Reihen und neue Knoten', () => {
  it('gesperrte Reihen sind nicht erschließbar', () => {
    const g = newGrid()
    for (let c = 0; c < 24; c++) g.claimed[cellIndex(c, BASE_ROWS - 1)] = true
    expect(isClaimable(g, cellIndex(5, BASE_ROWS))).toBe(false)
    g.rows = BASE_ROWS + 1
    expect(isClaimable(g, cellIndex(5, BASE_ROWS))).toBe(true)
  })

  it('das Ökosystem schaltet die Reihe frei', () => {
    const s = newState()
    expect(s.grid.rows).toBe(BASE_ROWS)
    s.totalHumus = 1000
    ecoPrestige(s)
    expect(s.grid.rows).toBe(BASE_ROWS + 1)
  })

  it('Knoten sind erst mit genug Wissen baubar', () => {
    const s = newState()
    expect(nodeUnlocked(s, 'glow')).toBe(false)
    expect(nodeUnlocked(s, 'root')).toBe(true)
    s.nutrients = new Decimal(1e9)
    s.grid.claimed[cellIndex(3, 1)] = true
    expect(canPlace(s, cellIndex(3, 1), 'glow')).toBe(false)
    s.ecoPoints = 1
    expect(canPlace(s, cellIndex(3, 1), 'glow')).toBe(true)
  })

  it('Schleimpilz und Torfmoos nur tief im Boden', () => {
    const g = newGrid(MAX_ROWS)
    g.claimed.fill(true)
    expect(getNode('slime').minRow).toBe(3)
    expect(canPlaceAt(g, cellIndex(4, 2), 'slime')).toBe(false)
    expect(canPlaceAt(g, cellIndex(4, 3), 'slime')).toBe(true)
    expect(canPlaceAt(g, cellIndex(4, 4), 'moss')).toBe(false)
    expect(canPlaceAt(g, cellIndex(4, 5), 'moss')).toBe(true)
  })
})

describe('Speichern mit Ökosystem', () => {
  it('Round-Trip mit Wissen, Zähler und freigeschalteten Reihen', () => {
    const s = newState()
    s.ecoPoints = 3
    s.ecos = 2
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(s))))!
    expect(loaded.ecoPoints).toBe(3)
    expect(loaded.ecos).toBe(2)
    expect(loaded.grid.rows).toBe(BASE_ROWS + 2)
    expect(loaded.grid.claimed).toHaveLength(CELLS)
  })

  it('alte Spielstände (Version 7) mit 7 Reihen laden und werden aufgefüllt', () => {
    const old = serialize(newState()) as unknown as Record<string, unknown>
    old.version = 7
    delete old.ecoPoints
    delete old.ecos
    const grid = old.grid as { claimed: string; nodes: string[] }
    grid.claimed = grid.claimed.slice(0, BASE_CELLS)
    grid.nodes = grid.nodes.slice(0, BASE_CELLS)
    const loaded = deserialize(old)!
    expect(loaded.ecoPoints).toBe(0)
    expect(loaded.grid.rows).toBe(BASE_ROWS)
    expect(loaded.grid.claimed).toHaveLength(CELLS)
  })
})
