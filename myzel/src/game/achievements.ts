import type { GameState } from './state.ts'

/** Jeder Erfolg erhöht die gesamte Produktion dauerhaft um diesen Anteil. */
export const ACHIEVEMENT_BONUS = 0.02

export interface AchievementDef {
  id: string
  name: string
  desc: string
  test: (s: GameState) => boolean
}

const nodes = (s: GameState): number => s.grid.nodes.filter(Boolean).length
const buildings = (s: GameState): number => Object.values(s.buildings).reduce((a, b) => a + b, 0)

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'click-100', name: 'Fingerspitzen', desc: '100 Mal aufs Totholz klicken.', test: (s) => s.clicks >= 100 },
  { id: 'click-1000', name: 'Klopfgeist', desc: '1.000 Mal aufs Totholz klicken.', test: (s) => s.clicks >= 1000 },
  { id: 'build-1', name: 'Erster Faden', desc: 'Das erste Gebäude bauen.', test: (s) => buildings(s) >= 1 },
  { id: 'build-25', name: 'Dichtes Geflecht', desc: '25 Gebäude gleichzeitig besitzen.', test: (s) => buildings(s) >= 25 },
  { id: 'build-100', name: 'Unterirdisches Reich', desc: '100 Gebäude gleichzeitig besitzen.', test: (s) => buildings(s) >= 100 },
  { id: 'nut-1e3', name: 'Erste Ernte', desc: '1.000 Nährstoffe insgesamt gesammelt.', test: (s) => s.lifetimeNutrients.gte(1e3) },
  { id: 'nut-1e6', name: 'Millionär im Moos', desc: '1 Mio. Nährstoffe insgesamt gesammelt.', test: (s) => s.lifetimeNutrients.gte(1e6) },
  { id: 'nut-1e9', name: 'Fülle des Waldes', desc: '1 Mrd. Nährstoffe insgesamt gesammelt.', test: (s) => s.lifetimeNutrients.gte(1e9) },
  { id: 'node-1', name: 'Ins Gitter', desc: 'Den ersten Knoten setzen.', test: (s) => nodes(s) >= 1 },
  { id: 'node-10', name: 'Netzplaner', desc: '10 Knoten gleichzeitig im Boden haben.', test: (s) => nodes(s) >= 10 },
  { id: 'truffle-1', name: 'Gut gerochen', desc: 'Den ersten Trüffel finden.', test: (s) => s.trufflesFound >= 1 },
  { id: 'truffle-25', name: 'Trüffelsucher', desc: '25 Trüffel gefunden.', test: (s) => s.trufflesFound >= 25 },
  { id: 'truffle-100', name: 'Trüffelkönig', desc: '100 Trüffel gefunden.', test: (s) => s.trufflesFound >= 100 },
  { id: 'pig-1', name: 'Rüsselfreund', desc: 'Das erste Trüffelschwein kaufen.', test: (s) => s.pigs >= 1 },
  { id: 'pig-5', name: 'Schweinebande', desc: 'Fünf Trüffelschweine besitzen.', test: (s) => s.pigs >= 5 },
  { id: 'autumn-1', name: 'Blätterfall', desc: 'Den ersten Herbst einläuten.', test: (s) => s.autumns >= 1 },
  { id: 'autumn-5', name: 'Kreislauf', desc: 'Fünf Herbste einläuten.', test: (s) => s.autumns >= 5 },
  { id: 'web-1', name: 'Erste Fäden gesponnen', desc: 'Die erste Forschung im Wood Wide Web.', test: (s) => s.web.length >= 1 },
  { id: 'web-all', name: 'Wood Wide Web', desc: 'Das ganze Netz erforschen.', test: (s) => s.web.length >= 9 },
]

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}

export function achievementMult(count: number): number {
  return 1 + ACHIEVEMENT_BONUS * count
}
