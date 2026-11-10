/**
 * Jahreszeit und Wetter. Die Jahreszeit durchläuft im Spiel in Echtzeit den Kreis Frühling, Sommer, Herbst, Winter, das Wetter wechselt zufällig und
 * hängt von der Jahreszeit ab. Beides ist nur Laufzeit-Zustand, wird also nicht gespeichert.
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type WeatherId = 'clear' | 'rain' | 'fog' | 'snow'

export interface Environment {
  /** `null` = neutral (Tests, Simulation). */
  season: Season | null
  weather: WeatherId
}

export interface EnvEffects {
  production: number
  click: number
  truffle: number
  spores: number
}

export const NEUTRAL_ENV: Environment = { season: null, weather: 'clear' }

export const SEASON_NAMES: Record<Season, string> = {
  spring: 'Frühling',
  summer: 'Sommer',
  autumn: 'Herbst',
  winter: 'Winter',
}

export interface WeatherDef {
  id: WeatherId
  name: string
  desc: string
}

export const WEATHERS: WeatherDef[] = [
  { id: 'clear', name: 'Klar', desc: '' },
  { id: 'rain', name: 'Regen', desc: 'Produktion +15 %' },
  { id: 'fog', name: 'Nebel', desc: 'Trüffel 50 % häufiger' },
  { id: 'snow', name: 'Schnee', desc: 'Klick-Ertrag +50 %' },
]

export const SEASON_DESCS: Record<Season, string> = {
  spring: 'Trüffel 15 % häufiger',
  summer: 'Produktion +10 %',
  autumn: 'Sporen +25 %',
  winter: 'Klick-Ertrag +25 %',
}

/** Reihenfolge der Jahreszeiten im Spiel. */
export const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter']
/** Wie lange eine Jahreszeit dauert (Sekunden Echtzeit); ein ganzes Jahr sind 32 Minuten. */
export const SEASON_SECONDS = 480

/** Jahreszeit zu einer Unix-Zeit (ms): läuft fest im Kreis, unabhängig vom Spielstand. */
export function seasonAt(nowMs: number): Season {
  const index = Math.floor(nowMs / (SEASON_SECONDS * 1000)) % SEASON_ORDER.length
  return SEASON_ORDER[index]
}

/** Sekunden bis zur nächsten Jahreszeit. */
export function secondsToNextSeason(nowMs: number): number {
  const len = SEASON_SECONDS * 1000
  return Math.ceil((len - (nowMs % len)) / 1000)
}

const WEIGHTS: Record<Season, Array<[WeatherId, number]>> = {
  spring: [['clear', 40], ['rain', 40], ['fog', 20]],
  summer: [['clear', 65], ['rain', 25], ['fog', 10]],
  autumn: [['clear', 35], ['rain', 30], ['fog', 35]],
  winter: [['clear', 35], ['snow', 50], ['fog', 15]],
}

/** Wählt das nächste Wetter; `rand` in [0, 1). */
export function pickWeather(season: Season, rand: number): WeatherId {
  const table = WEIGHTS[season]
  const total = table.reduce((a, [, w]) => a + w, 0)
  let r = rand * total
  for (const [id, w] of table) {
    r -= w
    if (r < 0) return id
  }
  return table[table.length - 1][0]
}

/** Wie lange das Wetter anhält (Sekunden), `rand` in [0, 1): 2 bis 5 Minuten. */
export function weatherDuration(rand: number): number {
  return 120 + rand * 180
}

/** Alle Multiplikatoren aus Jahreszeit und Wetter. */
export function envEffects(env: Environment): EnvEffects {
  const fx: EnvEffects = { production: 1, click: 1, truffle: 1, spores: 1 }
  switch (env.season) {
    case 'spring': fx.truffle *= 1.15; break
    case 'summer': fx.production *= 1.1; break
    case 'autumn': fx.spores *= 1.25; break
    case 'winter': fx.click *= 1.25; break
    default: break
  }
  switch (env.weather) {
    case 'rain': fx.production *= 1.15; break
    case 'fog': fx.truffle *= 1.5; break
    case 'snow': fx.click *= 1.5; break
    default: break
  }
  return fx
}
