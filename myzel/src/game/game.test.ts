import { describe, expect, it } from 'vitest'
import Decimal from 'break_infinity.js'
import { getBuilding } from './data.ts'
import {
  MAX_OFFLINE_SECONDS,
  applyOffline,
  buildingCost,
  buyBuilding,
  buyUpgrade,
  click,
  deserialize,
  newState,
  productionPerSecond,
  serialize,
  tick,
} from './state.ts'
import { formatNumber } from './format.ts'

describe('Kosten', () => {
  it('steigen pro gekauftem Gebäude um 15 %', () => {
    const hypha = getBuilding('hypha')
    expect(buildingCost(hypha, 0).toNumber()).toBe(15)
    expect(buildingCost(hypha, 1).toNumber()).toBe(17)
    expect(buildingCost(hypha, 10).toNumber()).toBe(60)
  })
})

describe('Kauf', () => {
  it('scheitert ohne genug Nährstoffe', () => {
    const s = newState()
    expect(buyBuilding(s, 'hypha')).toBe(false)
    expect(s.buildings.hypha).toBe(0)
  })

  it('zieht die Kosten ab', () => {
    const s = newState()
    s.nutrients = new Decimal(20)
    expect(buyBuilding(s, 'hypha')).toBe(true)
    expect(s.nutrients.toNumber()).toBe(5)
    expect(s.buildings.hypha).toBe(1)
  })

  it('Upgrade wird erst sichtbar, wenn genug gesammelt wurde', () => {
    const s = newState()
    s.nutrients = new Decimal(1000)
    expect(buyUpgrade(s, 'moist')).toBe(false)
    s.totalNutrients = new Decimal(1000)
    expect(buyUpgrade(s, 'moist')).toBe(true)
    expect(s.upgrades).toContain('moist')
  })
})

describe('Produktion', () => {
  it('Tick addiert Produktion mal Zeit', () => {
    const s = newState()
    s.buildings.hypha = 10
    tick(s, 2)
    expect(s.nutrients.toNumber()).toBeCloseTo(2)
    expect(s.totalNutrients.toNumber()).toBeCloseTo(2)
  })

  it('Gebäude-Upgrade verdoppelt nur sein Gebäude', () => {
    const s = newState()
    s.buildings.hypha = 10
    s.buildings.strand = 1
    const before = productionPerSecond(s).toNumber()
    s.upgrades.push('hypha1')
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(before + 1)
  })

  it('Klick bringt mindestens 1', () => {
    const s = newState()
    click(s)
    expect(s.nutrients.toNumber()).toBeGreaterThanOrEqual(1)
    expect(s.clicks).toBe(1)
  })
})

describe('Offline', () => {
  it('rechnet begrenzt nach', () => {
    const s = newState(0)
    s.buildings.hypha = 10
    const { seconds } = applyOffline(s, 1000 * 3600 * 100)
    expect(seconds).toBe(MAX_OFFLINE_SECONDS)
    // 1 Nährstoff/Sek, offline nur mit Faktor 0,2.
    expect(s.nutrients.toNumber()).toBeCloseTo(MAX_OFFLINE_SECONDS * 0.2)
  })
})

describe('Speichern', () => {
  it('überlebt einen Round-Trip', () => {
    const s = newState()
    s.nutrients = new Decimal('1.5e30')
    s.buildings.strand = 7
    s.upgrades.push('moist')
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(s))))
    expect(loaded).not.toBeNull()
    expect(loaded!.nutrients.eq(s.nutrients)).toBe(true)
    expect(loaded!.buildings.strand).toBe(7)
    expect(loaded!.upgrades).toEqual(['moist'])
  })

  it('lehnt kaputte Daten ab', () => {
    expect(deserialize(null)).toBeNull()
    expect(deserialize({ version: 99 })).toBeNull()
  })
})

describe('Zahlenformat', () => {
  it('kürzt große Zahlen', () => {
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(1500)).toBe('1.50 K')
    expect(formatNumber(2_500_000)).toBe('2.50 M')
  })
})
