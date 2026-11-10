/**
 * Wood Wide Web: ein Forschungsbaum, den man mit Sporen bezahlt. Er bleibt über den Herbst hinweg erhalten.
 * Drei Äste: Wurzeln (Gitterknoten und Mykorrhiza), Netz (verbindet die drei Bäume) und Signale (Trüffel, Sporen).
 */

export interface WebEffects {
  /** Multiplikator je Gitterknoten-Typ. */
  nodeMult: Record<string, number>
  /** Multiplikator je Gebäude-Typ. */
  buildingMult: Record<string, number>
  /** Multiplikator auf die gesamte Produktion. */
  global: number
  /** Multiplikator auf die Trüffel-Fundrate. */
  truffleRate: number
  /** Zusätzliche Sekunden, die ein Trüffel liegen bleibt. */
  truffleLifetime: number
  /** Multiplikator auf die Sporenproduktion. */
  sporeMult: number
}

export interface WebNodeDef {
  id: string
  branch: 'roots' | 'net' | 'signals'
  name: string
  desc: string
  /** Kosten in Sporen. */
  cost: number
  /** Alle hier genannten Forschungen müssen vorher erforscht sein. */
  requires: string[]
  apply: (fx: WebEffects) => void
}

export const WEB_BRANCHES: Array<{ id: WebNodeDef['branch']; name: string; desc: string }> = [
  { id: 'roots', name: 'Wurzeln', desc: 'Stärkt Gitterknoten und Mykorrhiza.' },
  { id: 'net', name: 'Netz', desc: 'Verbindet die drei Bäume miteinander.' },
  { id: 'signals', name: 'Signale', desc: 'Trüffel und Sporen.' },
]

export const WEB_NODES: WebNodeDef[] = [
  {
    id: 'fine-roots',
    branch: 'roots',
    name: 'Feinwurzeln',
    desc: 'Wurzelkontakte produzieren ×1,5.',
    cost: 100,
    requires: [],
    apply: (fx) => { fx.nodeMult.root *= 1.5 },
  },
  {
    id: 'deep-decay',
    branch: 'roots',
    name: 'Tiefe Zersetzung',
    desc: 'Zersetzer produzieren ×1,5.',
    cost: 2500,
    requires: ['fine-roots'],
    apply: (fx) => { fx.nodeMult.decomposer *= 1.5 },
  },
  {
    id: 'mantle',
    branch: 'roots',
    name: 'Mykorrhiza-Mantel',
    desc: 'Mykorrhiza produziert ×2.',
    cost: 25_000,
    requires: ['deep-decay'],
    apply: (fx) => { fx.buildingMult.mycorrhiza *= 2 },
  },
  {
    id: 'link-1',
    branch: 'net',
    name: 'Erste Verbindung',
    desc: 'Der linke und der mittlere Baum sind verbunden: alle Produktion +10 %.',
    cost: 150,
    requires: [],
    apply: (fx) => { fx.global *= 1.1 },
  },
  {
    id: 'link-2',
    branch: 'net',
    name: 'Zweite Verbindung',
    desc: 'Auch der rechte Baum hängt am Netz: alle Produktion +15 %.',
    cost: 4000,
    requires: ['link-1'],
    apply: (fx) => { fx.global *= 1.15 },
  },
  {
    id: 'closed-net',
    branch: 'net',
    name: 'Geschlossenes Netz',
    desc: 'Nährstoffe fließen zwischen allen Bäumen: alle Produktion +25 %, Leitbahnen ×1,5.',
    cost: 60_000,
    requires: ['link-2'],
    apply: (fx) => {
      fx.global *= 1.25
      fx.nodeMult.conduit *= 1.5
    },
  },
  {
    id: 'scent',
    branch: 'signals',
    name: 'Duftsignale',
    desc: 'Trüffel erscheinen 20 % häufiger.',
    cost: 120,
    requires: [],
    apply: (fx) => { fx.truffleRate *= 1.2 },
  },
  {
    id: 'warning',
    branch: 'signals',
    name: 'Warnsignale',
    desc: 'Trüffel bleiben 4 Sek länger liegen.',
    cost: 1000,
    requires: ['scent'],
    apply: (fx) => { fx.truffleLifetime += 4 },
  },
  {
    id: 'far-flight',
    branch: 'signals',
    name: 'Sporenfernflug',
    desc: 'Sporenproduktion ×1,5, Fruchtknoten ×1,5.',
    cost: 40_000,
    requires: ['warning', 'link-1'],
    apply: (fx) => {
      fx.sporeMult *= 1.5
      fx.nodeMult.fruit *= 1.5
    },
  },
]

export function getWebNode(id: string): WebNodeDef | undefined {
  return WEB_NODES.find((n) => n.id === id)
}

/** Alle Wirkungen der erforschten Knoten zusammengefasst. */
export function webEffects(researched: readonly string[]): WebEffects {
  const fx: WebEffects = {
    nodeMult: { root: 1, decomposer: 1, conduit: 1, fruit: 1 },
    buildingMult: { mycorrhiza: 1 },
    global: 1,
    truffleRate: 1,
    truffleLifetime: 0,
    sporeMult: 1,
  }
  for (const node of WEB_NODES) if (researched.includes(node.id)) node.apply(fx)
  return fx
}

export function webRequirementsMet(researched: readonly string[], node: WebNodeDef): boolean {
  return node.requires.every((r) => researched.includes(r))
}

/** Wie viele der drei Bäume am Netz hängen (für die Anzeige): 0 bis 3. */
export function connectedTrees(researched: readonly string[]): number {
  if (researched.includes('link-2')) return 3
  if (researched.includes('link-1')) return 2
  return 1
}
