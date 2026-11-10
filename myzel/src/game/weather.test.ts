import { describe, expect, it } from 'vitest'
import { NEUTRAL_ENV, SEASON_NAMES, SEASON_SECONDS, envEffects, pickWeather, seasonAt, secondsToNextSeason, weatherDuration } from './weather.ts'
import { clickValue, newState, productionPerSecond, serialize, sporesPerSecond, truffleRate } from './state.ts'

describe('Jahreszeit', () => {
  const len = SEASON_SECONDS * 1000

  it('durchläuft Frühling, Sommer, Herbst und Winter im Kreis', () => {
    const base = len * 400 // ein Vielfaches von vier Jahreszeiten
    expect([0, 1, 2, 3, 4].map((k) => seasonAt(base + k * len))).toEqual(['spring', 'summer', 'autumn', 'winter', 'spring'])
    expect(Object.keys(SEASON_NAMES)).toHaveLength(4)
  })

  it('bleibt innerhalb einer Jahreszeit gleich', () => {
    expect(seasonAt(len * 4 + 1)).toBe(seasonAt(len * 4 + len - 1))
  })

  it('zählt die Sekunden bis zum Wechsel', () => {
    expect(secondsToNextSeason(0)).toBe(SEASON_SECONDS)
    expect(secondsToNextSeason(len - 1000)).toBe(1)
  })
})

describe('Wetter', () => {
  it('Schnee gibt es nur im Winter', () => {
    for (let r = 0; r < 1; r += 0.01) {
      for (const s of ['spring', 'summer', 'autumn'] as const) expect(pickWeather(s, r)).not.toBe('snow')
    }
    const winter = new Set<string>()
    for (let r = 0; r < 1; r += 0.01) winter.add(pickWeather('winter', r))
    expect(winter.has('snow')).toBe(true)
  })

  it('Regen gibt es im Winter nicht', () => {
    for (let r = 0; r < 1; r += 0.01) expect(pickWeather('winter', r)).not.toBe('rain')
  })

  it('Dauer liegt zwischen 2 und 5 Minuten', () => {
    expect(weatherDuration(0)).toBe(120)
    expect(weatherDuration(0.999)).toBeLessThanOrEqual(300)
  })
})

describe('Wirkung', () => {
  it('neutral ändert nichts', () => {
    expect(envEffects(NEUTRAL_ENV)).toEqual({ production: 1, click: 1, truffle: 1, spores: 1 })
  })

  it('Sommer und Regen erhöhen die Produktion', () => {
    const s = newState()
    s.buildings.hypha = 10
    const base = productionPerSecond(s).toNumber()
    s.env = { season: 'summer', weather: 'rain' }
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(base * 1.1 * 1.15)
  })

  it('Winter und Schnee erhöhen den Klick-Ertrag', () => {
    const s = newState()
    const base = clickValue(s).toNumber()
    s.env = { season: 'winter', weather: 'snow' }
    expect(clickValue(s).toNumber()).toBeCloseTo(base * 1.25 * 1.5)
  })

  it('Frühling und Nebel erhöhen die Trüffelrate', () => {
    const s = newState()
    s.pigs = 2
    const base = truffleRate(s)
    s.env = { season: 'spring', weather: 'fog' }
    expect(truffleRate(s)).toBeCloseTo(base * 1.15 * 1.5)
  })

  it('Herbst erhöht die Sporen', () => {
    const s = newState()
    s.buildings.fruiting = 10
    const base = sporesPerSecond(s)
    s.env = { season: 'autumn', weather: 'clear' }
    expect(sporesPerSecond(s)).toBeCloseTo(base * 1.25)
  })

  it('wird nicht gespeichert', () => {
    const s = newState()
    s.env = { season: 'summer', weather: 'rain' }
    expect(JSON.stringify(serialize(s))).not.toContain('rain')
  })
})

describe('Produktions-Boni wirken auch aufs Klicken', () => {
  it('Jahreszeit und Wetter mit Produktionsbonus', () => {
    const s = newState()
    const base = clickValue(s).toNumber()
    s.env = { season: 'summer', weather: 'rain' }
    expect(clickValue(s).toNumber()).toBeCloseTo(base * 1.1 * 1.15)
  })

  it('Trüffel-Wachstumsschub vervielfacht den Klick', () => {
    const s = newState()
    const base = clickValue(s).toNumber()
    s.buffs = [{ id: 'frenzy', remaining: 10 }]
    expect(clickValue(s).toNumber()).toBeCloseTo(base * 7)
  })

  it('der 1-%-Anteil der Produktion zählt nicht doppelt', () => {
    const s = newState()
    s.buildings.hypha = 1000
    s.env = { season: 'summer', weather: 'clear' }
    const raw = productionPerSecond(s).toNumber() / 1.1
    // 1 Basisklick plus 1 % der Produktion, danach einmal ×1,1.
    expect(clickValue(s).toNumber()).toBeCloseTo((1 + raw * 0.01) * 1.1)
  })
})
