import { describe, expect, it } from 'vitest'
import { SPORE_UPGRADES, SPORES_PER_FRUITING, SPORES_PER_FRUIT_NODE } from './spores.ts'
import { cellIndex } from './grid.ts'
import {
  buySporeUpgrade,
  canBuySporeUpgrade,
  deserialize,
  newState,
  prestige,
  productionPerSecond,
  serialize,
  sporesPerSecond,
  tick,
} from './state.ts'
import Decimal from 'break_infinity.js'

const rich = () => {
  const s = newState()
  s.spores = 10_000_000
  return s
}

describe('Sporenproduktion', () => {
  it('ohne Fruchtkörper gibt es keine Sporen', () => {
    const s = newState()
    s.buildings.hypha = 50
    expect(sporesPerSecond(s)).toBe(0)
    tick(s, 100)
    expect(s.spores).toBe(0)
  })

  it('Fruchtkörper und Fruchtknoten erzeugen Sporen', () => {
    const s = newState()
    s.buildings.fruiting = 10
    expect(sporesPerSecond(s)).toBeCloseTo(10 * SPORES_PER_FRUITING)
    s.grid.claimed[cellIndex(3, 0)] = true
    s.grid.nodes[cellIndex(3, 0)] = 'fruit'
    expect(sporesPerSecond(s)).toBeCloseTo(10 * SPORES_PER_FRUITING + SPORES_PER_FRUIT_NODE)
    tick(s, 10)
    expect(s.spores).toBeCloseTo(10 * (10 * SPORES_PER_FRUITING + SPORES_PER_FRUIT_NODE))
  })

  it('Sporenernte erhöht die Sporenrate', () => {
    const s = rich()
    s.buildings.fruiting = 10
    const base = sporesPerSecond(s)
    buySporeUpgrade(s, 'harvest')
    expect(sporesPerSecond(s)).toBeCloseTo(base * 1.5)
  })
})

describe('Sporen-Verbesserungen', () => {
  it('Kauf zieht Sporen ab und endet bei der Maximalstufe', () => {
    const s = rich()
    const def = SPORE_UPGRADES.find((u) => u.id === 'dense')!
    for (let i = 0; i < def.costs.length; i++) expect(buySporeUpgrade(s, 'dense')).toBe(true)
    expect(s.spores).toBe(10_000_000 - def.costs.reduce((a, b) => a + b, 0))
    expect(canBuySporeUpgrade(s, 'dense')).toBe(false)
  })

  it('zu wenig Sporen oder unbekannte id schlägt fehl', () => {
    const s = newState()
    expect(buySporeUpgrade(s, 'dense')).toBe(false)
    expect(buySporeUpgrade(rich(), 'gibtsnicht')).toBe(false)
  })

  it('Dichte Sporen: mehr Gesamtproduktion', () => {
    const s = rich()
    s.buildings.hypha = 10
    const base = productionPerSecond(s).toNumber()
    buySporeUpgrade(s, 'dense')
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(base * 1.15)
  })

  it('Keimlinge wirken nur auf Hyphen und Myzelstränge', () => {
    const s = rich()
    s.buildings.hypha = 10
    s.buildings.mycorrhiza = 10
    const hypha = 10 * 0.1
    const myc = 10 * 8
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(hypha + myc)
    buySporeUpgrade(s, 'germ')
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(hypha * 2 + myc)
  })

  it('Blütenpracht wirkt auf Fruchtkörper und Fruchtknoten', () => {
    const s = rich()
    s.buildings.fruiting = 2
    s.grid.claimed[cellIndex(3, 0)] = true
    s.grid.nodes[cellIndex(3, 0)] = 'fruit'
    const base = productionPerSecond(s).toNumber()
    buySporeUpgrade(s, 'bloom')
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(base * 1.5)
  })
})

describe('Sporen und Herbst', () => {
  it('Sporen und Stufen überleben den Herbst', () => {
    const s = rich()
    buySporeUpgrade(s, 'dense')
    s.totalNutrients = new Decimal(1e7)
    s.nutrients = new Decimal(1e7)
    const spores = s.spores
    expect(prestige(s)).toBeGreaterThan(0)
    expect(s.spores).toBe(spores)
    expect(s.sporeLevels.dense).toBe(1)
  })
})

describe('Speichern mit Sporen', () => {
  it('Round-Trip', () => {
    const s = newState()
    s.spores = 123.5
    s.sporeLevels = { dense: 2, germ: 1 }
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(s))))!
    expect(loaded.spores).toBe(123.5)
    expect(loaded.sporeLevels).toEqual({ dense: 2, germ: 1 })
  })

  it('alte Spielstände (Version 4) laden ohne Sporen', () => {
    const old = { ...serialize(newState()), version: 4 } as Record<string, unknown>
    delete old.spores
    delete old.sporeLevels
    const loaded = deserialize(old)!
    expect(loaded.spores).toBe(0)
    expect(loaded.sporeLevels).toEqual({})
  })

  it('begrenzt Stufen und ignoriert Unsinn', () => {
    const data = serialize(newState())
    data.spores = -5
    data.sporeLevels = { dense: 99, unbekannt: 3, germ: -1 }
    const loaded = deserialize(data)!
    expect(loaded.spores).toBe(0)
    expect(loaded.sporeLevels).toEqual({ dense: SPORE_UPGRADES.find((u) => u.id === 'dense')!.costs.length })
  })
})
