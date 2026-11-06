// Balance-Simulation: ein gieriger Spieler kauft stets das, was sich am schnellsten amortisiert.
// Aufruf: node scripts/sim.ts [klicks_pro_sekunde] [herbste] [min_humus_fuer_herbst]
import Decimal from 'break_infinity.js'
import { BUILDINGS, NODES, UPGRADES } from '../src/game/data.ts'
import { CELLS, canPlaceAt, isClaimable } from '../src/game/grid.ts'
import { HUMUS_UPGRADES } from '../src/game/prestige.ts'
import { MAX_PIGS, nextSpawnDelay, pigCost } from '../src/game/truffle.ts'
import {
  buildingCostFor,
  buyBuilding,
  buyHumusUpgrade,
  buyPig,
  buyUpgrade,
  canBuyPig,
  claimCell,
  claimCost,
  clickValue,
  collectTruffle,
  isUpgradeVisible,
  newState,
  nodeCost,
  placeNode,
  placementGainPerSecond,
  prestige,
  prestigeGain,
  productionPerSecond,
  tick,
  truffleRate,
  addNutrients,
} from '../src/game/state.ts'
import type { GameState } from '../src/game/state.ts'

const CPS = Number(process.argv[2] ?? 4)
const AUTUMNS = Number(process.argv[3] ?? 6)
const MIN_GAIN = Number(process.argv[4] ?? 1)
const HUMUS_ORDER = ['seed', 'cheap', 'web', 'sniff', 'scent', 'sleep']

let seed = 12345
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

interface Option {
  cost: Decimal
  gain: number
  buy: () => void
}

function options(s: GameState): Option[] {
  const out: Option[] = []
  const base = productionPerSecond(s, false)
  const clickGain = (): number => 0
  void clickGain
  for (const def of BUILDINGS) {
    const cost = buildingCostFor(s, def)
    s.buildings[def.id]++
    const gain = productionPerSecond(s, false).sub(base).toNumber()
    s.buildings[def.id]--
    out.push({ cost, gain, buy: () => buyBuilding(s, def.id) })
  }
  const clicksBase = clickValue(s).mul(CPS)
  for (const u of UPGRADES) {
    if (!isUpgradeVisible(s, u)) continue
    s.upgrades.push(u.id)
    const gain = productionPerSecond(s, false).sub(base).add(clickValue(s).mul(CPS).sub(clicksBase)).toNumber()
    s.upgrades.pop()
    out.push({ cost: new Decimal(u.cost), gain, buy: () => buyUpgrade(s, u.id) })
  }
  // Gitter: je Knotentyp das beste Feld (belegbar oder erst zu erschließen).
  for (const node of NODES) {
    let best: Option | null = null
    for (let i = 0; i < CELLS; i++) {
      const owned = s.grid.claimed[i]
      if (owned ? !canPlaceAt(s.grid, i, node.id) : !isClaimable(s.grid, i) || !canPlaceAt({ ...s.grid, claimed: s.grid.claimed.map((c, k) => c || k === i) }, i, node.id)) continue
      const gain = nodeGain(s, i, node.id)
      const cost = owned ? nodeCost(s, node.id) : nodeCost(s, node.id).add(claimCost(s, i))
      if (!best || gain / cost.toNumber() > best.gain / best.cost.toNumber()) {
        best = { cost, gain, buy: () => { if (!owned) claimCell(s, i); placeNode(s, i, node.id) } }
      }
    }
    if (best) out.push(best)
  }
  return out
}

function nodeGain(s: GameState, i: number, id: string): number {
  return placementGainPerSecond(s, i, id).mul(s.totalHumus * 0.15 + 1).toNumber()
}

/** Kauft, was geht; gibt zurück, ob etwas gekauft wurde. */
function shop(s: GameState): boolean {
  if (canBuyPig(s) && s.nutrients.gte(pigCost(s.pigs) * 1.5) && productionPerSecond(s, false).mul(600).gte(pigCost(s.pigs))) {
    buyPig(s)
    return true
  }
  const opts = options(s).filter((o) => o.gain > 0)
  if (opts.length === 0) return false
  // Beste Amortisation; ist sie bezahlbar, kaufen. Sonst warten – außer ein anderes Angebot ist viel schneller bezahlt.
  opts.sort((a, b) => a.cost.toNumber() / a.gain - b.cost.toNumber() / b.gain)
  const best = opts[0]
  if (s.nutrients.gte(best.cost)) {
    best.buy()
    return true
  }
  return false
}

const fmt = (n: number): string => {
  if (n < 60) return `${n.toFixed(0)}s`
  if (n < 3600) return `${(n / 60).toFixed(1)}min`
  return `${(n / 3600).toFixed(2)}h`
}

const s = newState(0)
let t = 0
let runStart = 0
let nextTruffle = 60 + rand() * 90
let truffleStats = 0
const marks = [1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12]
let markIdx = 0
const log: string[] = []

while (s.autumns < AUTUMNS && t < 3600 * Number(process.argv[5] ?? 24)) {
  // Aktiver Spieler: Klicks pro Sekunde.
  if (CPS > 0) addNutrients(s, clickValue(s).mul(CPS))
  tick(s, 1)
  t += 1
  // Trüffel erscheinen und werden (meist) eingesammelt.
  nextTruffle -= 1
  if (nextTruffle <= 0) {
    collectTruffle(s, rand())
    truffleStats++
    nextTruffle = nextSpawnDelay(rand(), s.pigs, truffleRate(s) / (1 + 0.4 * s.pigs))
  }
  let guard = 0
  while (shop(s) && guard++ < 50);

  const run = t - runStart
  while (markIdx < marks.length && s.totalNutrients.gte(marks[markIdx])) {
    log.push(`  Herbst ${s.autumns}: ${marks[markIdx].toExponential(0)} gesammelt nach ${fmt(run)}  (Prod ${productionPerSecond(s, false).toNumber().toFixed(1)}/s, Schweine ${s.pigs})`)
    markIdx++
  }
  // Herbst, sobald er sich lohnt: mindestens 1 Humus und der Zuwachs ist spürbar gegenüber dem bisherigen Bestand.
  const gain = prestigeGain(s)
  if (gain >= MIN_GAIN && gain >= Math.max(1, s.totalHumus * 0.5)) {
    log.push(`>> Herbst ${s.autumns + 1} nach ${fmt(run)}: +${gain} Humus (gesamt ${s.totalHumus + gain}), gesammelt ${s.totalNutrients.toExponential(2)}`)
    prestige(s)
    for (const id of HUMUS_ORDER) while (buyHumusUpgrade(s, id));
    // Reihenfolge nach Stufen statt alles auf einmal: eine Stufe je Runde in der Reihenfolge.
    runStart = t
    markIdx = 0
  }
}

console.log(`Klicks/s: ${CPS}, Herbste: ${s.autumns}, Zeit gesamt: ${fmt(t)}, Trüffel: ${truffleStats}`)
console.log(log.join('\n'))
console.log('Humus-Stufen:', JSON.stringify(s.humusLevels), 'Humus frei:', s.humus, 'Humus gesamt:', s.totalHumus)
void HUMUS_UPGRADES
void MAX_PIGS
