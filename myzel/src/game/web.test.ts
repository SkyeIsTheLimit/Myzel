import { describe, expect, it } from 'vitest'
import { WEB_NODES, connectedTrees, webEffects } from './web.ts'
import { cellIndex } from './grid.ts'
import {
  buyWeb,
  canBuyWeb,
  deserialize,
  newState,
  prestige,
  productionPerSecond,
  serialize,
  sporesPerSecond,
  truffleLifetime,
  truffleRate,
} from './state.ts'
import Decimal from 'break_infinity.js'

const rich = () => {
  const s = newState()
  s.spores = 1e9
  return s
}

describe('Wood Wide Web: Kaufen', () => {
  it('zieht Sporen ab und merkt sich die Forschung', () => {
    const s = rich()
    expect(buyWeb(s, 'fine-roots')).toBe(true)
    expect(s.spores).toBe(1e9 - 100)
    expect(s.web).toEqual(['fine-roots'])
  })

  it('erst wenn die Voraussetzungen erforscht sind', () => {
    const s = rich()
    expect(canBuyWeb(s, 'deep-decay')).toBe(false)
    expect(buyWeb(s, 'deep-decay')).toBe(false)
    buyWeb(s, 'fine-roots')
    expect(canBuyWeb(s, 'deep-decay')).toBe(true)
  })

  it('Sporenfernflug braucht zwei Voraussetzungen', () => {
    const s = rich()
    buyWeb(s, 'scent')
    buyWeb(s, 'warning')
    expect(canBuyWeb(s, 'far-flight')).toBe(false)
    buyWeb(s, 'link-1')
    expect(canBuyWeb(s, 'far-flight')).toBe(true)
  })

  it('doppelt kaufen, zu wenig Sporen und unbekannte id gehen nicht', () => {
    const s = rich()
    buyWeb(s, 'scent')
    expect(buyWeb(s, 'scent')).toBe(false)
    expect(buyWeb(newState(), 'link-1')).toBe(false)
    expect(buyWeb(s, 'gibtsnicht')).toBe(false)
  })

  it('jede Voraussetzung verweist auf einen bekannten Knoten', () => {
    const ids = WEB_NODES.map((n) => n.id)
    for (const n of WEB_NODES) for (const r of n.requires) expect(ids).toContain(r)
  })
})

describe('Wood Wide Web: Wirkung', () => {
  it('Feinwurzeln: Wurzelkontakte ×1,5', () => {
    const s = rich()
    s.grid.claimed[cellIndex(3, 0)] = true
    s.grid.nodes[cellIndex(3, 0)] = 'root'
    const base = productionPerSecond(s).toNumber()
    buyWeb(s, 'fine-roots')
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(base * 1.5)
  })

  it('Mykorrhiza-Mantel verdoppelt Mykorrhiza', () => {
    const s = rich()
    s.buildings.mycorrhiza = 5
    const base = productionPerSecond(s).toNumber()
    for (const id of ['fine-roots', 'deep-decay', 'mantle']) buyWeb(s, id)
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(base * 2)
  })

  it('Verbindungen erhöhen die gesamte Produktion', () => {
    const s = rich()
    s.buildings.hypha = 10
    const base = productionPerSecond(s).toNumber()
    buyWeb(s, 'link-1')
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(base * 1.1)
    buyWeb(s, 'link-2')
    expect(productionPerSecond(s).toNumber()).toBeCloseTo(base * 1.1 * 1.15)
  })

  it('Signale: Trüffel häufiger und länger, Sporen mehr', () => {
    const s = rich()
    s.pigs = 2
    s.buildings.fruiting = 10
    const rate = truffleRate(s)
    const life = truffleLifetime(s)
    const spores = sporesPerSecond(s)
    for (const id of ['scent', 'warning', 'link-1', 'far-flight']) buyWeb(s, id)
    expect(truffleRate(s)).toBeCloseTo(rate * 1.2)
    expect(truffleLifetime(s)).toBe(life + 4)
    expect(sporesPerSecond(s)).toBeCloseTo(spores * 1.5)
  })

  it('verbundene Bäume zählen von 1 bis 3', () => {
    expect(connectedTrees([])).toBe(1)
    expect(connectedTrees(['link-1'])).toBe(2)
    expect(connectedTrees(['link-1', 'link-2'])).toBe(3)
  })

  it('ohne Forschung bleibt alles neutral', () => {
    const fx = webEffects([])
    expect(fx.global).toBe(1)
    expect(fx.sporeMult).toBe(1)
    expect(fx.truffleLifetime).toBe(0)
    expect(Object.values(fx.nodeMult).every((m) => m === 1)).toBe(true)
  })
})

describe('Wood Wide Web: Herbst und Speichern', () => {
  it('überlebt den Herbst', () => {
    const s = rich()
    buyWeb(s, 'link-1')
    s.totalNutrients = new Decimal(1e7)
    s.nutrients = new Decimal(1e7)
    expect(prestige(s)).toBeGreaterThan(0)
    expect(s.web).toEqual(['link-1'])
  })

  it('Round-Trip', () => {
    const s = rich()
    buyWeb(s, 'link-1')
    buyWeb(s, 'scent')
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(s))))!
    expect(loaded.web.sort()).toEqual(['link-1', 'scent'])
  })

  it('alte Spielstände (Version 5) laden ohne Forschung', () => {
    const old = { ...serialize(newState()), version: 5 } as Record<string, unknown>
    delete old.web
    expect(deserialize(old)!.web).toEqual([])
  })

  it('ignoriert unbekannte Einträge', () => {
    const data = serialize(newState())
    data.web = ['link-1', 'unbekannt']
    expect(deserialize(data)!.web).toEqual(['link-1'])
  })
})
