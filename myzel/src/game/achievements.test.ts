import { describe, expect, it } from 'vitest'
import Decimal from 'break_infinity.js'
import { ACHIEVEMENTS, ACHIEVEMENT_BONUS } from './achievements.ts'
import { checkAchievements, deserialize, newState, prestige, productionPerSecond, serialize } from './state.ts'

describe('Erfolge', () => {
  it('ids sind eindeutig', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ein neuer Spielstand hat noch keinen Erfolg', () => {
    const s = newState()
    expect(checkAchievements(s)).toEqual([])
    expect(s.achievements).toEqual([])
  })

  it('schaltet erreichte Erfolge einmalig frei', () => {
    const s = newState()
    s.clicks = 150
    s.buildings.hypha = 1
    const first = checkAchievements(s).map((a) => a.id)
    expect(first.sort()).toEqual(['build-1', 'click-100'])
    expect(checkAchievements(s)).toEqual([])
    expect(s.achievements).toHaveLength(2)
  })

  it('Erfolge bleiben, auch wenn die Bedingung später nicht mehr gilt', () => {
    const s = newState()
    s.buildings.hypha = 30
    checkAchievements(s)
    s.buildings.hypha = 0
    checkAchievements(s)
    expect(s.achievements).toContain('build-25')
  })

  it('jeder Erfolg gibt +2 % Produktion', () => {
    const s = newState()
    s.buildings.hypha = 10
    const base = productionPerSecond(s).toNumber()
    s.achievements = ['click-100', 'build-1']
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(base * (1 + 2 * ACHIEVEMENT_BONUS))
  })

  it('zählt Nährstoffe über alle Durchgänge', () => {
    const s = newState()
    s.lifetimeNutrients = new Decimal(2e6)
    expect(checkAchievements(s).map((a) => a.id)).toEqual(expect.arrayContaining(['nut-1e3', 'nut-1e6']))
  })

  it('überleben den Herbst', () => {
    const s = newState()
    s.totalNutrients = new Decimal(1e7)
    s.nutrients = new Decimal(1e7)
    s.lifetimeNutrients = new Decimal(1e7)
    checkAchievements(s)
    prestige(s)
    checkAchievements(s)
    expect(s.achievements).toContain('nut-1e6')
    expect(s.achievements).toContain('autumn-1')
  })
})

describe('Speichern mit Erfolgen', () => {
  it('Round-Trip', () => {
    const s = newState()
    s.achievements = ['click-100', 'pig-1']
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(s))))!
    expect(loaded.achievements.sort()).toEqual(['click-100', 'pig-1'])
  })

  it('alte Spielstände (Version 6) laden ohne Erfolge', () => {
    const old = { ...serialize(newState()), version: 6 } as Record<string, unknown>
    delete old.achievements
    expect(deserialize(old)!.achievements).toEqual([])
  })

  it('ignoriert unbekannte Einträge', () => {
    const data = serialize(newState())
    data.achievements = ['click-100', 'gibtsnicht']
    expect(deserialize(data)!.achievements).toEqual(['click-100'])
  })
})
