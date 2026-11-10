export interface BuildingDef {
  id: string
  name: string
  desc: string
  baseCost: number
  baseProd: number
  costGrowth: number
}

export interface UpgradeDef {
  id: string
  name: string
  desc: string
  cost: number
  /** Sichtbar, sobald der Spieler so viele Nährstoffe insgesamt gesammelt hat. */
  unlockAt: number
  effect:
    | { type: 'click'; mult: number }
    | { type: 'building'; target: string; mult: number }
    | { type: 'global'; mult: number }
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'hypha', name: 'Hyphe', desc: 'Dünner Faden, der Totholz zersetzt.', baseCost: 15, baseProd: 0.1, costGrowth: 1.15 },
  { id: 'strand', name: 'Myzelstrang', desc: 'Gebündelte Hyphen mit besserem Transport.', baseCost: 100, baseProd: 1, costGrowth: 1.15 },
  { id: 'mycorrhiza', name: 'Mykorrhiza', desc: 'Tauscht Nährstoffe mit Baumwurzeln.', baseCost: 1100, baseProd: 8, costGrowth: 1.15 },
  { id: 'fruiting', name: 'Fruchtkörper', desc: 'Pilze an der Oberfläche, die Sporen streuen.', baseCost: 12000, baseProd: 47, costGrowth: 1.15 },
]

export const UPGRADES: UpgradeDef[] = [
  { id: 'moist', name: 'Feuchter Boden', desc: 'Klicken bringt doppelt so viel.', cost: 100, unlockAt: 30, effect: { type: 'click', mult: 2 } },
  { id: 'hypha1', name: 'Feine Spitzen', desc: 'Hyphen produzieren doppelt so viel.', cost: 200, unlockAt: 100, effect: { type: 'building', target: 'hypha', mult: 2 } },
  { id: 'strand1', name: 'Dicke Stränge', desc: 'Myzelstränge produzieren doppelt so viel.', cost: 1500, unlockAt: 500, effect: { type: 'building', target: 'strand', mult: 2 } },
  { id: 'click2', name: 'Pilzenzyme', desc: 'Klicken bringt dreimal so viel.', cost: 2500, unlockAt: 1000, effect: { type: 'click', mult: 3 } },
  { id: 'myc1', name: 'Wood Wide Web', desc: 'Mykorrhiza produziert doppelt so viel.', cost: 15000, unlockAt: 5000, effect: { type: 'building', target: 'mycorrhiza', mult: 2 } },
  { id: 'global1', name: 'Dichtes Geflecht', desc: 'Alle Produktion +25 %.', cost: 40000, unlockAt: 15000, effect: { type: 'global', mult: 1.25 } },
  { id: 'fruit1', name: 'Sporenregen', desc: 'Fruchtkörper produzieren doppelt so viel.', cost: 150000, unlockAt: 50000, effect: { type: 'building', target: 'fruiting', mult: 2 } },
]

export interface NeighborRule {
  /** 'tree' für Baumwurzel-Felder, sonst die id eines Knotentyps. */
  neighbor: string
  /** Zusatzproduktion in Anteilen der Basis, z. B. 1.5 = +150 %, je passendem Nachbarn. */
  bonus: number
}

export interface NodeDef {
  id: string
  name: string
  desc: string
  baseCost: number
  costGrowth: number
  baseProd: number
  /** Höchste erlaubte Reihe (0 = oberste Bodenreihe); fehlt = überall erlaubt. */
  maxRow?: number
  /** Niedrigste erlaubte Reihe (nur tief im Boden). */
  minRow?: number
  /** Ab so viel Ökosystem-Wissen (insgesamt) baubar; fehlt = von Anfang an. */
  unlockPoints?: number
  rules: NeighborRule[]
}

export const NODES: NodeDef[] = [
  {
    id: 'root',
    name: 'Wurzelkontakt',
    desc: 'Tauscht mit Bäumen. +150 % je angrenzender Baumwurzel.',
    baseCost: 60,
    costGrowth: 1.12,
    baseProd: 0.8,
    rules: [{ neighbor: 'tree', bonus: 1.5 }, { neighbor: 'conduit', bonus: 0.4 }],
  },
  {
    id: 'decomposer',
    name: 'Zersetzer',
    desc: '+50 % je Wurzelkontakt, +30 % je Zersetzer nebenan.',
    baseCost: 500,
    costGrowth: 1.12,
    baseProd: 6,
    rules: [
      { neighbor: 'root', bonus: 0.5 },
      { neighbor: 'decomposer', bonus: 0.3 },
      { neighbor: 'conduit', bonus: 0.4 },
    ],
  },
  {
    id: 'conduit',
    name: 'Leitbahn',
    desc: 'Verstärkt jeden Nachbarn um +40 %.',
    baseCost: 250,
    costGrowth: 1.12,
    baseProd: 0.5,
    rules: [],
  },
  {
    id: 'fruit',
    name: 'Fruchtknoten',
    desc: 'Nur in den obersten zwei Reihen. +75 % je Leitbahn. Streut Sporen.',
    baseCost: 3000,
    costGrowth: 1.12,
    baseProd: 40,
    maxRow: 1,
    rules: [{ neighbor: 'conduit', bonus: 0.75 }],
  },
  {
    id: 'glow',
    name: 'Leuchtpilz',
    desc: '+50 % je Zersetzer und Fruchtknoten, +25 % je Leuchtpilz nebenan.',
    baseCost: 25_000,
    costGrowth: 1.13,
    baseProd: 250,
    unlockPoints: 1,
    rules: [
      { neighbor: 'decomposer', bonus: 0.5 },
      { neighbor: 'fruit', bonus: 0.5 },
      { neighbor: 'glow', bonus: 0.25 },
    ],
  },
  {
    id: 'slime',
    name: 'Schleimpilz',
    desc: 'Nur ab der vierten Reihe. +80 % je Leitbahn, +40 % je Wurzelkontakt.',
    baseCost: 150_000,
    costGrowth: 1.13,
    baseProd: 1500,
    minRow: 3,
    unlockPoints: 2,
    rules: [
      { neighbor: 'conduit', bonus: 0.8 },
      { neighbor: 'root', bonus: 0.4 },
    ],
  },
  {
    id: 'moss',
    name: 'Torfmoos',
    desc: 'Nur ab der sechsten Reihe. +100 % je Leuchtpilz und Schleimpilz, +30 % je Torfmoos.',
    baseCost: 1_000_000,
    costGrowth: 1.13,
    baseProd: 9000,
    minRow: 5,
    unlockPoints: 4,
    rules: [
      { neighbor: 'glow', bonus: 1 },
      { neighbor: 'slime', bonus: 1 },
      { neighbor: 'moss', bonus: 0.3 },
    ],
  },
]

export function getNode(id: string): NodeDef {
  const def = NODES.find((n) => n.id === id)
  if (!def) throw new Error(`Unbekannter Knoten: ${id}`)
  return def
}

export function getBuilding(id: string): BuildingDef {
  const def = BUILDINGS.find((b) => b.id === id)
  if (!def) throw new Error(`Unbekanntes Gebäude: ${id}`)
  return def
}
