import { describe, expect, it } from 'vitest'
import Decimal from 'break_infinity.js'
import {
  MAX_PIGS,
  REWARDS,
  nextSpawnDelay,
  pigCost,
  rollReward,
  spawnRateMultiplier,
} from './truffle.ts'
import {
  buffMult,
  buyPig,
  canBuyPig,
  clickValue,
  collectTruffle,
  deserialize,
  newState,
  productionPerSecond,
  serialize,
  tick,
} from './state.ts'

describe('Schweine', () => {
  it('Kosten steigen, Fundrate wächst mit der Anzahl', () => {
    expect([0, 1, 2, 3, 4].map(pigCost)).toEqual([100, 1000, 10000, 100000, 1000000])
    expect(spawnRateMultiplier(0)).toBe(1)
    expect(spawnRateMultiplier(5)).toBeGreaterThan(spawnRateMultiplier(1))
    expect(nextSpawnDelay(0.5, MAX_PIGS)).toBeLessThan(nextSpawnDelay(0.5, 0))
  })

  it('mit 5 Schweinen im Schnitt etwa alle 3 Minuten ein Trüffel', () => {
    expect(MAX_PIGS).toBe(5)
    expect(nextSpawnDelay(0.5, 5)).toBeGreaterThan(170)
    expect(nextSpawnDelay(0.5, 5)).toBeLessThan(190)
    // ohne Schwein deutlich seltener (mehrere Minuten)
    expect(nextSpawnDelay(0.5, 0)).toBeGreaterThan(480)
  })

  it('Kauf zieht Kosten ab und ist bei MAX_PIGS gedeckelt', () => {
    const s = newState()
    expect(buyPig(s)).toBe(false)
    s.nutrients = new Decimal(1e12)
    for (let i = 0; i < MAX_PIGS; i++) expect(buyPig(s)).toBe(true)
    expect(s.pigs).toBe(MAX_PIGS)
    expect(canBuyPig(s)).toBe(false)
    expect(buyPig(s)).toBe(false)
  })
})

describe('Belohnungen', () => {
  it('rollReward folgt den Gewichten an den Rändern', () => {
    expect(rollReward(0).id).toBe('lucky')
    expect(rollReward(0.999999).id).toBe('clickfrenzy')
    const frenzyStart = REWARDS[0].weight / REWARDS.reduce((a, r) => a + r.weight, 0)
    expect(rollReward(frenzyStart + 0.001).id).toBe('frenzy')
  })

  it('Nährstoff-Fund: mindestens 13, begrenzt durch 15 % des Vorrats', () => {
    const s = newState()
    s.nutrients = new Decimal(1000)
    const result = collectTruffle(s, 0)
    expect(result.title).toBe('Trüffel gefunden')
    // keine Produktion → nur 13 Fixbetrag
    expect(s.nutrients.toNumber()).toBeCloseTo(1013)
    expect(s.trufflesFound).toBe(1)
  })

  it('Nährstoff-Fund wird durch Produktion gedeckelt', () => {
    const s = newState()
    s.buildings.hypha = 10 // 1 / Sek → Deckel 900 + 13
    s.nutrients = new Decimal(1e9)
    const before = s.nutrients
    collectTruffle(s, 0)
    expect(s.nutrients.sub(before).toNumber()).toBeCloseTo(913)
  })

  it('Wachstumsschub: ×7 Produktion, läuft nach 30 Sek ab', () => {
    const s = newState()
    s.buildings.hypha = 10
    const base = productionPerSecond(s).toNumber()
    const frenzyRoll = REWARDS[0].weight / 100 + 0.01
    expect(collectTruffle(s, frenzyRoll).title).toBe('Wachstumsschub')
    expect(buffMult(s, 'production')).toBe(7)
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(base * 7)
    // Ohne Buff gerechnet bleibt die Grundproduktion sichtbar
    expect(productionPerSecond(s, false).toNumber()).toBeCloseTo(base)

    const before = s.nutrients
    tick(s, 40) // 30 Sek mit Buff, 10 Sek ohne
    expect(s.nutrients.sub(before).toNumber()).toBeCloseTo(base * 7 * 30 + base * 10)
    expect(s.buffs).toHaveLength(0)
  })

  it('derselbe Buff wird erneuert statt gestapelt', () => {
    const s = newState()
    const frenzyRoll = REWARDS[0].weight / 100 + 0.01
    collectTruffle(s, frenzyRoll)
    tick(s, 20)
    collectTruffle(s, frenzyRoll)
    expect(s.buffs).toHaveLength(1)
    expect(s.buffs[0].remaining).toBeCloseTo(30)
    expect(buffMult(s, 'production')).toBe(7)
  })

  it('Klick-Rausch erhöht nur den Klick-Ertrag', () => {
    const s = newState()
    const before = clickValue(s).toNumber()
    const clickRoll = (REWARDS[0].weight + REWARDS[1].weight) / 100 + 0.01
    expect(collectTruffle(s, clickRoll).title).toBe('Klick-Rausch')
    expect(clickValue(s).toNumber()).toBeCloseTo(before * 20)
    expect(productionPerSecond(s).toNumber()).toBe(0)
  })
})

describe('Speichern', () => {
  it('Schweine, Fundzähler und Buffs überleben einen Round-Trip', () => {
    const s = newState()
    s.pigs = 4
    s.trufflesFound = 9
    s.buffs = [{ id: 'frenzy', remaining: 12.5 }]
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(s))))!
    expect(loaded.pigs).toBe(4)
    expect(loaded.trufflesFound).toBe(9)
    expect(loaded.buffs).toEqual([{ id: 'frenzy', remaining: 12.5 }])
  })

  it('alte Spielstände ohne Trüffel-Daten laden mit Standardwerten', () => {
    const old = { ...serialize(newState()), version: 2 } as Record<string, unknown>
    delete old.pigs
    delete old.trufflesFound
    delete old.buffs
    const loaded = deserialize(old)!
    expect(loaded.pigs).toBe(0)
    expect(loaded.trufflesFound).toBe(0)
    expect(loaded.buffs).toEqual([])
  })

  it('ignoriert unbekannte Buffs und übergroße Schweinzahlen', () => {
    const data = serialize(newState())
    data.pigs = 999
    data.buffs = [{ id: 'unbekannt', remaining: 10 }, { id: 'frenzy', remaining: -3 }]
    const loaded = deserialize(data)!
    expect(loaded.pigs).toBe(MAX_PIGS)
    expect(loaded.buffs).toEqual([])
  })
})
