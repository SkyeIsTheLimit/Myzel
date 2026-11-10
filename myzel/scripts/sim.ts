// Balance-Simulation mit einem menschenähnlichen Spieler.
// Aufruf: node scripts/sim.ts [spieler] [tage]   (spieler: gelegenheit | normal | intensiv)
//
// Der Spieler ist nicht immer da (Spielsitzungen, dazwischen läuft nur die Offline-Produktion bis zur Obergrenze),
// schaut nur alle paar Sekunden in den Shop, macht manchmal Fehlkäufe, verpasst Trüffel und klickt mit der Zeit
// weniger. Den Herbst läutet er ein, wenn der Fortschritt stockt oder sich der Humus mindestens verdoppeln würde.
import Decimal from 'break_infinity.js'
import { BUILDINGS, NODES, UPGRADES } from '../src/game/data.ts'
import { CELLS, canPlaceAt, isClaimable } from '../src/game/grid.ts'
import { humusMultiplier, offlineEffectiveSeconds } from '../src/game/prestige.ts'
import { nextSpawnDelay, pigCost } from '../src/game/truffle.ts'
import {
  addNutrients,
  buildingCostFor,
  buyBuilding,
  buyHumusUpgrade,
  buyPig,
  buySporeUpgrade,
  buyUpgrade,
  canBuyPig,
  claimCell,
  claimCost,
  clickValue,
  collectTruffle,
  isUpgradeVisible,
  newState,
  nodeCost,
  offlineCap,
  placeNode,
  placementGainPerSecond,
  prestige,
  prestigeGain,
  productionPerSecond,
  tick,
  truffleLifetime,
  truffleRate,
} from '../src/game/state.ts'
import type { GameState } from '../src/game/state.ts'

interface Persona {
  name: string
  /** Sitzungen je Tag als [Beginn, Ende] in Stunden. */
  sessions: Array<[number, number]>
  /** Klicks pro Sekunde zu Beginn einer Sitzung. */
  cps: number
  /** Sekunden zwischen zwei Blicken in den Shop. */
  check: number
  /** Wahrscheinlichkeit, einen sichtbaren Trüffel rechtzeitig zu erwischen. */
  truffleCatch: number
}

const PERSONAS: Record<string, Persona> = {
  gelegenheit: { name: 'Gelegenheitsspieler (3 kurze Sitzungen)', sessions: [[8, 8.25], [12.5, 12.65], [19, 19.5]], cps: 2, check: 40, truffleCatch: 0.5 },
  normal: { name: 'Normalspieler (abends 2 Std, mittags kurz)', sessions: [[12.5, 12.75], [19, 21]], cps: 3, check: 20, truffleCatch: 0.8 },
  intensiv: { name: 'Intensivspieler (2 x 3 Std)', sessions: [[9, 12], [15, 18]], cps: 4, check: 10, truffleCatch: 0.95 },
}

const persona = PERSONAS[process.argv[2] ?? 'normal']
if (!persona) throw new Error(`Spieler: ${Object.keys(PERSONAS).join(' | ')}`)
const DAYS = Number(process.argv[3] ?? 3)
/** Der Spieler beginnt seinen ersten Tag zu Beginn der ersten Sitzung. */
const START_HOUR = persona.sessions[0][0]
const SPORE_ORDER = ['dense', 'germ', 'bloom', 'harvest']
const HUMUS_ORDER = ['seed', 'cheap', 'web', 'sniff', 'scent', 'sleep']

let seed = 987654
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

interface Option {
  cost: Decimal
  gain: number
  buy: () => void
}

function nodeGain(s: GameState, i: number, id: string): number {
  return placementGainPerSecond(s, i, id).mul(humusMultiplier(s.totalHumus)).toNumber()
}

function options(s: GameState, cps: number): Option[] {
  const out: Option[] = []
  const base = productionPerSecond(s, false)
  for (const def of BUILDINGS) {
    const cost = buildingCostFor(s, def)
    s.buildings[def.id]++
    const gain = productionPerSecond(s, false).sub(base).toNumber()
    s.buildings[def.id]--
    out.push({ cost, gain, buy: () => buyBuilding(s, def.id) })
  }
  const clicksBase = clickValue(s).mul(cps)
  for (const u of UPGRADES) {
    if (!isUpgradeVisible(s, u)) continue
    s.upgrades.push(u.id)
    const gain = productionPerSecond(s, false).sub(base).add(clickValue(s).mul(cps).sub(clicksBase)).toNumber()
    s.upgrades.pop()
    out.push({ cost: new Decimal(u.cost), gain, buy: () => buyUpgrade(s, u.id) })
  }
  for (const node of NODES) {
    let best: Option | null = null
    for (let i = 0; i < CELLS; i++) {
      const owned = s.grid.claimed[i]
      const claimable = !owned && isClaimable(s.grid, i)
      if (!owned && !claimable) continue
      if (!canPlaceAt({ ...s.grid, claimed: s.grid.claimed.map((c, k) => c || k === i) }, i, node.id)) continue
      const gain = nodeGain(s, i, node.id)
      const cost = owned ? nodeCost(s, node.id) : nodeCost(s, node.id).add(claimCost(s, i))
      if (!best || gain / cost.toNumber() > best.gain / best.cost.toNumber()) {
        best = { cost, gain, buy: () => { if (!owned) claimCell(s, i); placeNode(s, i, node.id) } }
      }
    }
    if (best) out.push(best)
  }
  return out.filter((o) => o.gain > 0)
}

/** Sekunden, bis sich das beste Angebot leisten lässt; 0 = sofort. */
function waitForBest(s: GameState, opts: Option[]): number {
  if (opts.length === 0) return Infinity
  const best = [...opts].sort((a, b) => a.cost.toNumber() / a.gain - b.cost.toNumber() / b.gain)[0]
  const missing = best.cost.sub(s.nutrients).toNumber()
  return missing <= 0 ? 0 : missing / Math.max(1e-9, productionPerSecond(s, false).toNumber())
}

/** Ein Blick in den Shop: kauft in Reihenfolge der Amortisation, vertut sich aber ab und zu. */
function shop(s: GameState, cps: number): void {
  for (let guard = 0; guard < 60; guard++) {
    if (canBuyPig(s) && s.nutrients.gte(pigCost(s.pigs) * 1.5) && productionPerSecond(s, false).mul(600).gte(pigCost(s.pigs))) {
      buyPig(s)
      continue
    }
    const opts = options(s, cps)
    if (opts.length === 0) return
    opts.sort((a, b) => a.cost.toNumber() / a.gain - b.cost.toNumber() / b.gain)
    // Mit 20 % Wahrscheinlichkeit nimmt der Spieler irgendein bezahlbares Angebot statt des besten.
    const affordable = opts.filter((o) => s.nutrients.gte(o.cost))
    if (affordable.length === 0) return
    const pick = rand() < 0.2 ? affordable[Math.floor(rand() * affordable.length)] : opts[0]
    if (!s.nutrients.gte(pick.cost)) return
    pick.buy()
  }
}

const fmtTime = (sec: number): string => {
  if (sec < 120) return `${sec.toFixed(0)}s`
  if (sec < 7200) return `${(sec / 60).toFixed(0)}min`
  if (sec < 172800) return `${(sec / 3600).toFixed(1)}h`
  return `${(sec / 86400).toFixed(1)}d`
}

const s = newState(0)
let t = 0
let runStart = 0
let runPlayed = 0
let played = 0
let away = 0
let nextCheck = 0
let truffleTimer = 60 + rand() * 90
let sessionStart = -1
const timeline: string[] = []
const marks = [1e5, 1e7, 1e9]
let markIdx = 0

const inSession = (sec: number): boolean => {
  const hour = (START_HOUR + sec / 3600) % 24
  return persona.sessions.some(([a, b]) => hour >= a && hour < b)
}

const end = DAYS * 86400
while (t < end) {
  const present = inSession(t)
  if (present && sessionStart < 0) {
    sessionStart = t
    away = 0
    nextCheck = t
  }
  if (!present) sessionStart = -1

  if (present) {
    const sessionAge = t - sessionStart
    // Klickfreude lässt nach: nach ein paar Minuten klickt man nur noch gelegentlich.
    const cps = persona.cps * Math.exp(-sessionAge / 240) + 0.1
    if (rand() < 0.9) addNutrients(s, clickValue(s).mul(cps))
    tick(s, 1)
    played++
    runPlayed++
    if (t >= nextCheck) {
      shop(s, cps)
      for (const id of SPORE_ORDER) while (buySporeUpgrade(s, id));
      nextCheck = t + persona.check * (0.6 + rand() * 0.8)
    }
  } else {
    away++
    // Offline läuft die Produktion nur bis zur Obergrenze (Langer Schlaf verlängert sie).
    if (away <= offlineCap(s)) tick(s, offlineEffectiveSeconds(away) - offlineEffectiveSeconds(away - 1))
  }

  // Trüffel erscheinen in Echtzeit; nur wer gerade da ist, kann einen erwischen.
  truffleTimer -= 1
  if (truffleTimer <= 0) {
    if (present && rand() < persona.truffleCatch * Math.min(1, (truffleLifetime(s) / 16) * 0.8)) collectTruffle(s, rand())
    truffleTimer = nextSpawnDelay(rand(), s.pigs, truffleRate(s) / (1 + 0.4 * s.pigs))
  }

  while (markIdx < marks.length && s.totalNutrients.gte(marks[markIdx])) {
    timeline.push(`    ${marks[markIdx].toExponential(0)} nach ${fmtTime(t - runStart)} (gespielt ${fmtTime(runPlayed)})`)
    markIdx++
  }

  // Herbst: nur in einer Sitzung, wenn der Fortschritt stockt oder sich der Humus verdoppeln würde.
  const gain = prestigeGain(s)
  if (present && gain >= 1 && t === Math.floor(nextCheck - persona.check * 0.5)) {
    const stalled = waitForBest(s, options(s, 0)) > 900
    if (gain >= Math.max(10, s.totalHumus) || (stalled && gain >= Math.max(3, s.totalHumus * 0.5))) {
      console.log(`Herbst ${s.autumns + 1}: Tag ${(t / 86400).toFixed(1)}, Durchgang ${fmtTime(t - runStart)} (gespielt ${fmtTime(runPlayed)}), +${gain} Humus → ${s.totalHumus + gain}, Sporen ${s.spores.toFixed(0)}`)
      if (timeline.length) console.log(timeline.join('\n'))
      prestige(s)
      for (const id of HUMUS_ORDER) while (buyHumusUpgrade(s, id));
      runStart = t
      runPlayed = 0
      markIdx = 0
      timeline.length = 0
    }
  }
  t++
}

console.log(`\n${persona.name}, ${DAYS} Tage: ${s.autumns} Herbste, gespielt ${fmtTime(played)}, Trüffel ${s.trufflesFound}`)
console.log(`Humus ${s.totalHumus}, Humus-Stufen ${JSON.stringify(s.humusLevels)}, Sporen-Stufen ${JSON.stringify(s.sporeLevels)}, Schweine ${s.pigs}`)
