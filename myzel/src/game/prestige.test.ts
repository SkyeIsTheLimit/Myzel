import { describe, expect, it } from 'vitest'
import Decimal from 'break_infinity.js'
import {
  HUMUS_BONUS,
  HUMUS_EXPONENT,
  offlineEffectiveSeconds,
  HUMUS_UPGRADES,
  autumnProgress,
  humusGain,
  humusMultiplier,
} from './prestige.ts'
import { INITIAL_CLAIMED, claimedCount } from './grid.ts'
import { BUILDINGS } from './data.ts'
import {
  applyOffline,
  buildingCostFor,
  buyBuilding,
  buyHumusUpgrade,
  canBuyHumusUpgrade,
  canPrestige,
  claimCost,
  deserialize,
  newState,
  offlineCap,
  prestige,
  prestigeGain,
  productionPerSecond,
  serialize,
  tick,
  truffleLifetime,
  truffleRate,
} from './state.ts'

const earned = (n: number) => {
  const s = newState()
  s.nutrients = new Decimal(n)
  s.totalNutrients = new Decimal(n)
  return s
}

describe('Humus-Formel', () => {
  it('Wurzel aus (gesammelt / 1e5)', () => {
    expect(humusGain(new Decimal(99_999))).toBe(0)
    expect(humusGain(new Decimal(1e5))).toBe(1)
    expect(humusGain(new Decimal(4e5))).toBe(2)
    expect(humusGain(new Decimal(1e7))).toBe(10)
    expect(humusGain(new Decimal(1e9))).toBe(100)
  })

  it('wächst monoton und bleibt bei riesigen Zahlen endlich', () => {
    expect(humusGain(new Decimal('1e500'))).toBeLessThanOrEqual(1e9)
    expect(Number.isFinite(humusGain(new Decimal('1e500')))).toBe(true)
  })

  it('Bonus wächst unterlinear: jeder weitere Humus bringt weniger', () => {
    expect(humusMultiplier(0)).toBe(1)
    expect(humusMultiplier(1)).toBeCloseTo(1 + HUMUS_BONUS)
    expect(humusMultiplier(10)).toBeCloseTo(1 + HUMUS_BONUS * Math.pow(10, HUMUS_EXPONENT))
    expect(humusMultiplier(20) - humusMultiplier(10)).toBeLessThan(humusMultiplier(10) - humusMultiplier(0))
  })

  it('Offline zählt nur mit Faktor 0,2', () => {
    expect(offlineEffectiveSeconds(1000)).toBeCloseTo(200)
    expect(offlineEffectiveSeconds(7200)).toBeCloseTo(1440)
  })

  it('Herbst-Fortschritt läuft logarithmisch von 0 bis 1', () => {
    expect(autumnProgress(new Decimal(0))).toBe(0)
    expect(autumnProgress(new Decimal(1e4))).toBe(0)
    expect(autumnProgress(new Decimal(10 ** 5.5))).toBeCloseTo(0.5)
    expect(autumnProgress(new Decimal(1e7))).toBe(1)
    expect(autumnProgress(new Decimal(1e9))).toBe(1)
  })
})

describe('Herbst einläuten', () => {
  it('geht erst, wenn mindestens 1 Humus winkt', () => {
    const s = earned(5e4)
    expect(canPrestige(s)).toBe(false)
    expect(prestige(s)).toBe(0)
    expect(s.autumns).toBe(0)
    expect(s.nutrients.toNumber()).toBe(5e4)
  })

  it('setzt Durchgang zurück, behält Humus, Schweine und Fundzähler', () => {
    const s = earned(4e5)
    s.buildings.hypha = 20
    s.upgrades.push('moist')
    s.grid.claimed[2] = true
    s.grid.nodes[3] = 'root'
    s.pigs = 3
    s.trufflesFound = 7
    s.clicks = 99
    s.buffs = [{ id: 'frenzy', remaining: 10 }]
    const lifetime = s.lifetimeNutrients

    expect(prestigeGain(s)).toBe(2)
    expect(prestige(s)).toBe(2)

    expect(s.humus).toBe(2)
    expect(s.totalHumus).toBe(2)
    expect(s.autumns).toBe(1)
    expect(s.nutrients.toNumber()).toBe(0)
    expect(s.totalNutrients.toNumber()).toBe(0)
    expect(s.buildings.hypha).toBe(0)
    expect(s.upgrades).toEqual([])
    expect(s.buffs).toEqual([])
    expect(s.grid.nodes.filter(Boolean)).toHaveLength(0)
    expect(claimedCount(s.grid)).toBe(INITIAL_CLAIMED)
    expect(s.pigs).toBe(3)
    expect(s.trufflesFound).toBe(7)
    expect(s.clicks).toBe(99)
    expect(s.lifetimeNutrients.eq(lifetime)).toBe(true)
  })

  it('ein zweiter Herbst geht erst nach neuem Fortschritt', () => {
    const s = earned(1e6)
    prestige(s)
    expect(canPrestige(s)).toBe(false)
    expect(prestige(s)).toBe(0)
  })

  it('Humus erhöht die Produktion dauerhaft', () => {
    const s = newState()
    s.buildings.hypha = 10
    const base = productionPerSecond(s).toNumber()
    s.totalHumus = 4
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(base * humusMultiplier(4))
  })

  it('lifetimeNutrients zählt über Durchgänge hinweg, totalNutrients nur den aktuellen', () => {
    const s = earned(2e5)
    s.lifetimeNutrients = new Decimal(2e5)
    prestige(s) // 1 Humus → Produktion ×1.15
    s.buildings.hypha = 10 // 1 / Sek
    tick(s, 10)
    expect(s.totalNutrients.toNumber()).toBeCloseTo(11.5)
    expect(s.lifetimeNutrients.toNumber()).toBeCloseTo(2e5 + 11.5)
  })
})

describe('Humus-Shop', () => {
  const rich = () => {
    const s = newState()
    s.humus = 1000
    return s
  }

  it('Kauf zieht Humus ab, erhöht die Stufe und endet bei der Maximalstufe', () => {
    const s = rich()
    const def = HUMUS_UPGRADES.find((u) => u.id === 'seed')!
    for (let i = 0; i < def.costs.length; i++) expect(buyHumusUpgrade(s, 'seed')).toBe(true)
    expect(s.humusLevels.seed).toBe(def.costs.length)
    expect(s.humus).toBe(1000 - def.costs.reduce((a, b) => a + b, 0))
    expect(canBuyHumusUpgrade(s, 'seed')).toBe(false)
    expect(buyHumusUpgrade(s, 'seed')).toBe(false)
  })

  it('zu wenig Humus oder unbekannte id schlägt fehl', () => {
    const s = newState()
    s.humus = 0
    expect(buyHumusUpgrade(s, 'seed')).toBe(false)
    expect(buyHumusUpgrade(rich(), 'gibtsnicht')).toBe(false)
  })

  it('Samenvorrat: Start-Nährstoffe nach dem Herbst', () => {
    const s = earned(1e6)
    s.humus = 10
    buyHumusUpgrade(s, 'seed')
    prestige(s)
    expect(s.nutrients.toNumber()).toBe(200)
    expect(s.totalNutrients.toNumber()).toBe(0)
  })

  it('Weites Geflecht: Gratisfelder, und Erschließen bleibt am Anfang günstig', () => {
    const s = earned(1e6)
    s.humus = 10
    buyHumusUpgrade(s, 'web')
    prestige(s)
    expect(claimedCount(s.grid)).toBe(INITIAL_CLAIMED + 4)
    const baseline = newState()
    // Mit Gratisfeldern kostet das nächste Feld so viel wie das erste ohne Bonus (gleiche Reihe).
    const i = s.grid.claimed.findIndex((c, k) => !c && k < 24 && k !== 4 && k !== 12 && k !== 20)
    expect(claimCost(s, i).toNumber()).toBeLessThanOrEqual(claimCost(baseline, i).toNumber())
  })

  it('Sparsame Hyphen senken die Gebäudekosten', () => {
    const s = rich()
    const hypha = BUILDINGS[0]
    expect(buildingCostFor(s, hypha).toNumber()).toBe(15)
    buyHumusUpgrade(s, 'cheap')
    expect(buildingCostFor(s, hypha).toNumber()).toBe(Math.floor(15 * 0.96))
    s.nutrients = new Decimal(100)
    expect(buyBuilding(s, 'hypha')).toBe(true)
    expect(s.nutrients.toNumber()).toBe(100 - Math.floor(15 * 0.96))
  })

  it('Trüffelnase und Haftender Duft wirken auf Fundrate und Lebensdauer', () => {
    const s = rich()
    s.pigs = 2
    const rate = truffleRate(s)
    const life = truffleLifetime(s)
    buyHumusUpgrade(s, 'sniff')
    buyHumusUpgrade(s, 'scent')
    expect(truffleRate(s)).toBeCloseTo(rate * 1.25)
    expect(truffleLifetime(s)).toBe(life + 5)
  })

  it('Langer Schlaf verlängert die Offline-Zeit', () => {
    const s = rich()
    expect(offlineCap(s)).toBe(2 * 3600)
    buyHumusUpgrade(s, 'sleep')
    expect(offlineCap(s)).toBe(3 * 3600)
    s.lastSaved = 0
    s.buildings.hypha = 10
    const { seconds } = applyOffline(s, 100 * 3600 * 1000)
    expect(seconds).toBe(3 * 3600)
  })
})

describe('Speichern mit Prestige', () => {
  it('Humus, Stufen, Herbst-Zähler und Lebenszeit überleben einen Round-Trip', () => {
    const s = earned(3e5)
    s.lifetimeNutrients = new Decimal(9e6)
    s.humus = 5
    s.totalHumus = 12
    s.humusLevels = { seed: 2, web: 1 }
    s.autumns = 3
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(s))))!
    expect(loaded.humus).toBe(5)
    expect(loaded.totalHumus).toBe(12)
    expect(loaded.humusLevels).toEqual({ seed: 2, web: 1 })
    expect(loaded.autumns).toBe(3)
    expect(loaded.lifetimeNutrients.toNumber()).toBe(9e6)
  })

  it('alte Spielstände (Version 3) laden ohne Prestige-Daten', () => {
    const old = { ...serialize(newState()), version: 3 } as Record<string, unknown>
    for (const k of ['humus', 'totalHumus', 'humusLevels', 'autumns', 'lifetimeNutrients']) delete old[k]
    const loaded = deserialize(old)!
    expect(loaded.humus).toBe(0)
    expect(loaded.autumns).toBe(0)
    expect(loaded.humusLevels).toEqual({})
  })

  it('begrenzt Stufen auf das Maximum und ignoriert unbekannte Verbesserungen', () => {
    const data = serialize(newState())
    data.humusLevels = { seed: 99, unbekannt: 3, cheap: -2 }
    data.humus = -5
    const loaded = deserialize(data)!
    expect(loaded.humusLevels).toEqual({ seed: HUMUS_UPGRADES.find((u) => u.id === 'seed')!.costs.length })
    expect(loaded.humus).toBe(0)
  })
})
