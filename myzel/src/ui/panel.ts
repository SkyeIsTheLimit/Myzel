import { BUILDINGS, NODES, UPGRADES } from '../game/data.ts'
import { nodeCountOf } from '../game/grid.ts'
import { MAX_PIGS, PIG_RATE_BONUS, getBuffDef, pigCost } from '../game/truffle.ts'
import { HUMUS_DIVISOR, HUMUS_UPGRADES, humusMultiplier } from '../game/prestige.ts'
import { ACHIEVEMENTS, ACHIEVEMENT_BONUS } from '../game/achievements.ts'
import { ECO_DIVISOR, ECO_ROW_UNLOCKS, ecoMultiplier, humusForPoints } from '../game/eco.ts'
import { SEASON_NAMES, WEATHERS, envEffects } from '../game/weather.ts'
import { SPORE_UPGRADES } from '../game/spores.ts'
import { WEB_BRANCHES, WEB_NODES, connectedTrees, getWebNode, webRequirementsMet } from '../game/web.ts'
import { showMenu } from './dialog.ts'
import { REMOVE_TOOL } from './tooltip.ts'
import type { Tool } from './tooltip.ts'
import { formatNumber } from '../game/format.ts'
import {
  buildingCostFor,
  canBuyBuilding,
  canBuyHumusUpgrade,
  canBuyPig,
  canBuySporeUpgrade,
  canBuyWeb,
  ecoGainNow,
  nodeUnlocked,
  canBuyUpgrade,
  canPrestige,
  clickValue,
  humusLevel,
  humusMult,
  isUpgradeVisible,
  nodeCost,
  prestigeGain,
  productionPerSecond,
  sporeLevel,
  sporesPerSecond,
  truffleRate,
  unitProduction,
} from '../game/state.ts'
import type { GameState } from '../game/state.ts'

export interface PanelActions {
  selectTool: (tool: Tool) => void
  buyPig: () => void
  prestige: () => void
  eco: () => void
  buyHumus: (id: string) => void
  buySpore: (id: string) => void
  buyWeb: (id: string) => void
  buyBuilding: (id: string) => void
  buyUpgrade: (id: string) => void
  save: () => void
  exportSave: () => void
  importSave: () => void
  reset: () => void
}

interface BuildingRow {
  id: string
  button: HTMLButtonElement
  count: HTMLElement
  cost: HTMLElement
  prod: HTMLElement
}

const TAB_KEY = 'myzel-tab'
const DEFAULT_TAB = 'growth'

function readStoredTab(): string {
  try {
    return localStorage.getItem(TAB_KEY) ?? DEFAULT_TAB
  } catch {
    return DEFAULT_TAB
  }
}

interface HumusRow {
  id: string
  button: HTMLButtonElement
  count: HTMLElement
  cost: HTMLElement
  desc: HTMLElement
}

interface ToolRow {
  id: string
  button: HTMLButtonElement
  cost: HTMLElement
  count: HTMLElement | null
}

export class Panel {
  readonly element: HTMLElement
  /** Kopfbereich (Titel, Ressourcen, Wetter, Buffs): gehört in die linke Spalte über dem Spiel. */
  readonly hud: HTMLElement
  /** Tab-Leiste: gehört in den rechten Teil des durchgehenden Balkens oben. */
  readonly tabsBar: HTMLElement
  private tools: ToolRow[] = []
  private nutrients: HTMLElement
  private perSecond: HTMLElement
  private perClick: HTMLElement
  private rows: BuildingRow[] = []
  private upgradeList: HTMLElement
  private pigButton: HTMLButtonElement
  private pigCount: HTMLElement
  private pigCost: HTMLElement
  private pigRate: HTMLElement
  private pigDesc: HTMLElement
  private buffBox: HTMLElement
  private humusRows: HumusRow[] = []
  private sporeRows: HumusRow[] = []
  private webRows: Array<{ id: string; button: HTMLButtonElement; cost: HTMLElement; desc: HTMLElement; state: HTMLElement }> = []
  private webTab: HTMLButtonElement
  private achRows: Array<{ id: string; row: HTMLElement }> = []
  private achSummary: HTMLElement
  private envBox: HTMLElement
  private envKey = ''
  private ecoSection: HTMLElement
  private ecoButton: HTMLButtonElement
  private ecoHint: HTMLElement
  private ecoFields: Record<'points' | 'bonus' | 'rows' | 'count', HTMLElement>
  private ecoUnlockRows: Array<{ points: number; row: HTMLElement }> = []
  private webSummary: HTMLElement
  private sporeStat: HTMLElement
  private sporeValue: HTMLElement
  private sporeRate: HTMLElement
  private sporeSection: HTMLElement
  private autumnBadge: HTMLElement
  private prestigeButton: HTMLButtonElement
  private autumnHint: HTMLElement
  private autumnFields: Record<'count' | 'humus' | 'bonus' | 'run' | 'life', HTMLElement>
  private buffKey = ''
  private upgradeEmpty: HTMLElement
  private badge: HTMLElement
  private tabButtons: HTMLButtonElement[]
  private panes: HTMLElement[]
  private upgradeKey = ''

  private actions: PanelActions

  constructor(actions: PanelActions) {
    this.actions = actions
    this.element = document.createElement('aside')
    this.element.id = 'panel'
    this.hud = document.createElement('div')
    this.hud.id = 'hud'
    this.hud.innerHTML = `
      <h1>MYZEL</h1>
      <section class="stats">
        <div class="stats-main">
          <div class="stock">
            <span class="big" data-nutrients>0</span>
            <span class="label">Nährstoffe</span>
          </div>
          <div class="rates">
            <span class="rate main" data-pps>0 / Sek</span>
            <span class="rate" data-ppc>+1 / Klick</span>
          </div>
        </div>
        <div class="spore-stat" data-spores hidden>
          <span class="spore-label">Sporen</span>
          <span class="spore-value" data-spore-value></span>
          <span class="spore-rate" data-spore-rate></span>
        </div>
      </section>
      <div class="status-row">
        <div class="env" data-env hidden></div>
        <div class="buffs-row">
          <span class="buffs-label">Buffs</span>
          <div class="buffs" data-buffs></div>
        </div>
      </div>`
    this.tabsBar = document.createElement('nav')
    this.tabsBar.className = 'tabs'
    this.tabsBar.setAttribute('role', 'tablist')
    this.tabsBar.innerHTML = `
        <button class="tab" role="tab" data-tab="growth">Wachstum</button>
        <button class="tab" role="tab" data-tab="nodes">Knoten</button>
        <button class="tab" role="tab" data-tab="upgrades">Upgrades<span class="badge zero" data-badge>0</span></button>
        <button class="tab" role="tab" data-tab="web" data-web-tab>Wood Wide Web</button>
        <button class="tab" role="tab" data-tab="autumn">Laubfall<span class="badge leaf" data-a-badge hidden>!</span></button>
        <div class="tab-pair">
          <button class="tab" role="tab" data-tab="achievements">Erfolge</button>
          <button class="gear" data-gear title="Einstellungen" aria-label="Einstellungen">
      <svg viewBox="0 0 16 16" width="26" height="26" shape-rendering="crispEdges" aria-hidden="true">
        <g fill="currentColor">
          <path fill-rule="evenodd" d="M8 2.5a5.5 5.5 0 1 0 .001 0ZM8 5.8a2.2 2.2 0 1 1-.001 0Z"/>
          <rect x="6.8" y="0.2" width="2.4" height="3"/>
          <rect x="6.8" y="12.8" width="2.4" height="3"/>
          <rect x="0.2" y="6.8" width="3" height="2.4"/>
          <rect x="12.8" y="6.8" width="3" height="2.4"/>
          <rect x="6.8" y="0.2" width="2.4" height="3" transform="rotate(45 8 8)"/>
          <rect x="6.8" y="0.2" width="2.4" height="3" transform="rotate(135 8 8)"/>
          <rect x="6.8" y="0.2" width="2.4" height="3" transform="rotate(225 8 8)"/>
          <rect x="6.8" y="0.2" width="2.4" height="3" transform="rotate(315 8 8)"/>
        </g>
      </svg>
    </button>
        </div>
    `
    this.element.innerHTML = `
      <div class="scroll">
        <section data-pane="growth">
          <p class="hint">Klicke auf das Totholz, um Nährstoffe zu gewinnen.</p>
          <div class="list" data-buildings></div>
          <h2 class="subhead">Trüffelsuche</h2>
          <p class="hint small">Trüffel tauchen im Boden auf und leuchten kurz. Klicke sie an für Boni. Schweine finden sie häufiger.</p>
          <div class="list" data-pig-list></div>
        </section>
        <section data-pane="nodes" hidden>
          <p class="hint small">Dunkle Felder im Boden per Klick erschließen, dann einen Knoten wählen und auf freien Boden setzen. Tasten 1–${NODES.length}, Esc.</p>
          <div class="list" data-tools></div>
        </section>
        <section data-pane="upgrades" hidden>
          <p class="hint" data-upgrade-empty>Noch keine Verbesserungen verfügbar. Sammle weiter Nährstoffe.</p>
          <div class="list" data-upgrades></div>
          <div data-spore-section hidden>
            <h2 class="subhead">Sporenforschung</h2>
            <p class="hint small">Fruchtkörper und Fruchtknoten streuen Sporen. Sie bleiben auch nach dem Laubfall erhalten.</p>
            <div class="list" data-spore-list></div>
          </div>
        </section>
        <section data-pane="web" hidden>
          <p class="hint small">Das Wood Wide Web verbindet die Bäume. Erforsche es mit Sporen. Die Forschung bleibt auch nach dem Laubfall erhalten.</p>
          <div class="web-summary" data-web-summary></div>
          <div data-web-list></div>
        </section>
        <section data-pane="autumn" hidden>
          <div class="autumn-card">
            <div class="a-row"><span>Laubfälle</span><span data-a-count>0</span></div>
            <div class="a-row"><span>Humus</span><span class="humus" data-a-humus>0</span></div>
            <div class="a-row"><span>Produktionsbonus</span><span data-a-bonus>×1.00</span></div>
            <div class="a-row dim"><span>Gesammelt (Durchgang)</span><span data-a-run>0</span></div>
            <div class="a-row dim"><span>Gesammelt (gesamt)</span><span data-a-life>0</span></div>
          </div>
          <button class="prestige" data-prestige>Laubfall einläuten</button>
          <p class="hint" data-a-hint></p>
          <h2 class="subhead">Humus-Verbesserungen</h2>
          <div class="list" data-humus-list></div>
          <div data-eco-section hidden>
            <h2 class="subhead">Ökosystem</h2>
            <div class="autumn-card eco-card">
              <div class="a-row"><span>Wissen</span><span class="eco-points" data-e-points>0</span></div>
              <div class="a-row"><span>Produktionsbonus</span><span data-e-bonus>×1.00</span></div>
              <div class="a-row dim"><span>Gitterreihen</span><span data-e-rows>7</span></div>
              <div class="a-row dim"><span>Ökosysteme</span><span data-e-count>0</span></div>
            </div>
            <button class="prestige eco" data-eco>Ökosystem gründen</button>
            <p class="hint" data-e-hint></p>
            <h2 class="subhead">Mit Wissen freischalten</h2>
            <div class="eco-unlocks" data-e-unlocks></div>
          </div>
        </section>
        <section data-pane="achievements" hidden>
          <p class="hint small" data-ach-summary></p>
          <div class="ach-list" data-ach-list></div>
        </section>
      </div>`

    const q = <T extends HTMLElement>(sel: string): T =>
      (this.element.querySelector<T>(sel) ?? this.hud.querySelector<T>(sel) ?? this.tabsBar.querySelector<T>(sel))!
    this.nutrients = q('[data-nutrients]')
    this.perSecond = q('[data-pps]')
    this.perClick = q('[data-ppc]')
    this.envBox = q('[data-env]')
    this.achSummary = q('[data-ach-summary]')
    const achList = q('[data-ach-list]')
    for (const def of ACHIEVEMENTS) {
      const row = document.createElement('div')
      row.className = 'ach'
      row.innerHTML = `<span class="ach-name">${def.name}</span><span class="ach-desc">${def.desc}</span>`
      achList.appendChild(row)
      this.achRows.push({ id: def.id, row })
    }
    this.webTab = q('[data-web-tab]')
    this.webSummary = q('[data-web-summary]')
    this.sporeStat = q('[data-spores]')
    this.sporeValue = q('[data-spore-value]')
    this.sporeRate = q('[data-spore-rate]')
    this.sporeSection = q('[data-spore-section]')
    this.upgradeList = q('[data-upgrades]')
    this.buffBox = q('[data-buffs]')
    this.upgradeEmpty = q('[data-upgrade-empty]')
    this.badge = q('[data-badge]')
    this.autumnBadge = q('[data-a-badge]')
    this.prestigeButton = q('[data-prestige]')
    this.autumnHint = q('[data-a-hint]')
    this.autumnFields = {
      count: q('[data-a-count]'),
      humus: q('[data-a-humus]'),
      bonus: q('[data-a-bonus]'),
      run: q('[data-a-run]'),
      life: q('[data-a-life]'),
    }
    this.prestigeButton.addEventListener('click', () => this.actions.prestige())

    this.ecoSection = q('[data-eco-section]')
    this.ecoButton = q<HTMLButtonElement>('[data-eco]')
    this.ecoHint = q('[data-e-hint]')
    this.ecoFields = { points: q('[data-e-points]'), bonus: q('[data-e-bonus]'), rows: q('[data-e-rows]'), count: q('[data-e-count]') }
    this.ecoButton.addEventListener('click', () => this.actions.eco())
    // Liste der Freischaltungen: je Wissensstufe neue Gitterreihen und Knoten.
    const unlocks = new Map<number, string[]>()
    const add = (points: number, text: string): void => {
      unlocks.set(points, [...(unlocks.get(points) ?? []), text])
    }
    ECO_ROW_UNLOCKS.forEach((points, i) => add(points, `Gitterreihe ${8 + i}`))
    for (const def of NODES) if (def.unlockPoints) add(def.unlockPoints, `Knoten ${def.name}`)
    const unlockList = q('[data-e-unlocks]')
    for (const points of [...unlocks.keys()].sort((a, b) => a - b)) {
      const row = document.createElement('div')
      row.className = 'eco-unlock'
      row.innerHTML = `<span class="eco-unlock-points">${points} Wissen</span><span>${unlocks.get(points)!.join(' · ')}</span>`
      unlockList.appendChild(row)
      this.ecoUnlockRows.push({ points, row })
    }

    const humusList = q('[data-humus-list]')
    for (const def of HUMUS_UPGRADES) {
      const button = document.createElement('button')
      button.className = 'item humus-item'
      button.innerHTML = `
        <span class="row"><span class="name">${def.name}</span><span class="count" data-count>0</span></span>
        <span class="row sub"><span data-cost></span></span>
        <span class="desc" data-desc></span>`
      button.addEventListener('click', () => this.actions.buyHumus(def.id))
      humusList.appendChild(button)
      this.humusRows.push({
        id: def.id,
        button,
        count: button.querySelector<HTMLElement>('[data-count]')!,
        cost: button.querySelector<HTMLElement>('[data-cost]')!,
        desc: button.querySelector<HTMLElement>('[data-desc]')!,
      })
    }

    const sporeList = q('[data-spore-list]')
    for (const def of SPORE_UPGRADES) {
      const button = document.createElement('button')
      button.className = 'item spore-item'
      button.innerHTML = `
        <span class="row"><span class="name">${def.name}</span><span class="count" data-count>0</span></span>
        <span class="row sub"><span data-cost></span></span>
        <span class="desc" data-desc></span>`
      button.addEventListener('click', () => this.actions.buySpore(def.id))
      sporeList.appendChild(button)
      this.sporeRows.push({
        id: def.id,
        button,
        count: button.querySelector<HTMLElement>('[data-count]')!,
        cost: button.querySelector<HTMLElement>('[data-cost]')!,
        desc: button.querySelector<HTMLElement>('[data-desc]')!,
      })
    }

    const webList = q('[data-web-list]')
    for (const branch of WEB_BRANCHES) {
      const head = document.createElement('h2')
      head.className = 'subhead'
      head.textContent = branch.name
      const hint = document.createElement('p')
      hint.className = 'hint small'
      hint.textContent = branch.desc
      const list = document.createElement('div')
      list.className = 'list'
      for (const def of WEB_NODES.filter((n) => n.branch === branch.id)) {
        const button = document.createElement('button')
        button.className = 'item web-item'
        button.innerHTML = `
          <span class="row"><span class="name">${def.name}</span><span class="count" data-state></span></span>
          <span class="row sub"><span data-cost></span></span>
          <span class="desc">${def.desc}</span>`
        button.addEventListener('click', () => this.actions.buyWeb(def.id))
        list.appendChild(button)
        this.webRows.push({
          id: def.id,
          button,
          cost: button.querySelector<HTMLElement>('[data-cost]')!,
          desc: button.querySelector<HTMLElement>('.desc')!,
          state: button.querySelector<HTMLElement>('[data-state]')!,
        })
      }
      webList.append(head, hint, list)
    }

    this.tabButtons = [...this.tabsBar.querySelectorAll<HTMLButtonElement>('[data-tab]')]
    this.panes = [...this.element.querySelectorAll<HTMLElement>('[data-pane]')]
    for (const button of this.tabButtons) button.addEventListener('click', () => this.setTab(button.dataset.tab!))
    this.setTab(readStoredTab())

    const toolList = q('[data-tools]')
    NODES.forEach((def, i) => {
      const button = document.createElement('button')
      button.className = 'item tool'
      button.innerHTML = `
        <span class="row"><span class="name">${i + 1}. ${def.name}</span><span class="count" data-count>0</span></span>
        <span class="row sub"><span data-cost></span></span>
        <span class="desc">${def.desc}</span>`
      button.addEventListener('click', () => this.actions.selectTool(def.id))
      toolList.appendChild(button)
      this.tools.push({
        id: def.id,
        button,
        cost: button.querySelector<HTMLElement>('[data-cost]')!,
        count: button.querySelector<HTMLElement>('[data-count]'),
      })
    })
    const removeButton = document.createElement('button')
    removeButton.className = 'item tool'
    removeButton.innerHTML = `
      <span class="row"><span class="name">Entfernen</span></span>
      <span class="desc">Knoten anklicken; die Hälfte der Kosten kommt zurück.</span>`
    removeButton.addEventListener('click', () => this.actions.selectTool(REMOVE_TOOL))
    toolList.appendChild(removeButton)
    this.tools.push({ id: REMOVE_TOOL, button: removeButton, cost: removeButton, count: null })

    this.pigButton = document.createElement('button')
    this.pigButton.className = 'item pig'
    this.pigButton.innerHTML = `
      <span class="row"><span class="name">Trüffelschwein</span><span class="count" data-pig-count>0</span></span>
      <span class="row sub"><span data-pig-cost></span><span data-pig-rate></span></span>
      <span class="desc" data-pig-desc></span>`
    this.pigButton.addEventListener('click', () => this.actions.buyPig())
    q('[data-pig-list]').appendChild(this.pigButton)
    this.pigCount = this.pigButton.querySelector<HTMLElement>('[data-pig-count]')!
    this.pigCost = this.pigButton.querySelector<HTMLElement>('[data-pig-cost]')!
    this.pigRate = this.pigButton.querySelector<HTMLElement>('[data-pig-rate]')!
    this.pigDesc = this.pigButton.querySelector<HTMLElement>('[data-pig-desc]')!

    const buildingList = q('[data-buildings]')
    for (const def of BUILDINGS) {
      const button = document.createElement('button')
      button.className = 'item'
      button.title = def.desc
      button.innerHTML = `
        <span class="row"><span class="name">${def.name}</span><span class="count" data-count>0</span></span>
        <span class="row sub"><span data-cost></span><span data-prod></span></span>
        <span class="desc">${def.desc}</span>`
      button.addEventListener('click', () => this.actions.buyBuilding(def.id))
      buildingList.appendChild(button)
      this.rows.push({
        id: def.id,
        button,
        count: button.querySelector<HTMLElement>('[data-count]')!,
        cost: button.querySelector<HTMLElement>('[data-cost]')!,
        prod: button.querySelector<HTMLElement>('[data-prod]')!,
      })
    }

    // Zahnrad: Spielstand und Neustart, getrennt von den Erfolgen.
    q<HTMLButtonElement>('[data-gear]').addEventListener('click', () => {
      showMenu(
        'Einstellungen',
        [
          { label: 'Speichern', run: () => this.actions.save() },
          { label: 'Export', run: () => this.actions.exportSave() },
          { label: 'Import', run: () => this.actions.importSave() },
          { label: 'Neustart', danger: true, run: () => this.actions.reset() },
        ],
        'Das Spiel speichert automatisch alle 10 Sekunden. Export kopiert den Spielstand als Text in die Zwischenablage.',
      )
    })
  }

  update(state: GameState, tool: Tool): void {
    for (const row of this.tools) {
      row.button.classList.toggle('selected', row.id === tool)
      if (row.id === REMOVE_TOOL) continue
      const cost = nodeCost(state, row.id)
      const unlocked = nodeUnlocked(state, row.id)
      row.button.classList.toggle('locked', !unlocked)
      row.button.disabled = !unlocked
      const need = NODES.find((n) => n.id === row.id)?.unlockPoints ?? 0
      row.cost.textContent = unlocked ? `${formatNumber(cost)} Nährstoffe` : `Gesperrt: ab ${need} Wissen (Ökosystem)`
      row.button.classList.toggle('poor', unlocked && state.nutrients.lt(cost))
      if (row.count) row.count.textContent = String(nodeCountOf(state.grid, row.id))
    }

    this.pigCount.textContent = `${state.pigs}/${MAX_PIGS}`
    this.pigCost.textContent = state.pigs >= MAX_PIGS ? 'Maximal' : `${formatNumber(pigCost(state.pigs))} Nährstoffe`
    this.pigRate.textContent = `Fundrate ×${truffleRate(state).toFixed(1)}`
    this.pigDesc.textContent = `Schnüffelt Trüffel auf (+${Math.round(PIG_RATE_BONUS * 100)} % Fundrate je Schwein). Gefunden: ${state.trufflesFound}`
    this.pigButton.disabled = !canBuyPig(state)

    // Aktive Trüffel-Buffs als Chips mit Restzeit.
    const buffs = state.buffs
      .map((b) => ({ def: getBuffDef(b.id), remaining: b.remaining }))
      .filter((b): b is { def: NonNullable<ReturnType<typeof getBuffDef>>; remaining: number } => b.def !== undefined)
    const buffKey = buffs.map((b) => `${b.def.id}:${Math.ceil(b.remaining)}`).join(',')
    if (buffKey !== this.buffKey) {
      this.buffKey = buffKey
      this.buffBox.replaceChildren(
        ...buffs.map((b) => {
          const chip = document.createElement('div')
          chip.className = `buff ${b.def.type}`
          const fill = Math.max(0, Math.min(1, b.remaining / b.def.duration))
          chip.style.setProperty('--fill', `${Math.round(fill * 100)}%`)
          chip.textContent = `${b.def.name} ×${b.def.mult} · ${Math.ceil(b.remaining)}s`
          return chip
        }),
      )
    }

    this.nutrients.textContent = formatNumber(state.nutrients)
    this.perSecond.textContent = `${formatNumber(productionPerSecond(state), 1)} / Sek`
    this.perClick.textContent = `+${formatNumber(clickValue(state), 1)} / Klick`

    for (const row of this.rows) {
      const def = BUILDINGS.find((b) => b.id === row.id)!
      const owned = state.buildings[row.id] ?? 0
      row.count.textContent = String(owned)
      row.cost.textContent = `${formatNumber(buildingCostFor(state, def))} Nährstoffe`
      row.prod.textContent = `+${formatNumber(unitProduction(state, def), 1)} / Sek je`
      row.button.disabled = !canBuyBuilding(state, row.id)
    }

    const visible = UPGRADES.filter((u) => isUpgradeVisible(state, u))
    const key = visible.map((u) => u.id).join(',')
    if (key !== this.upgradeKey) {
      this.upgradeKey = key
      this.upgradeEmpty.hidden = visible.length > 0
      this.upgradeList.replaceChildren(
        ...visible.map((u) => {
          const button = document.createElement('button')
          button.className = 'item upgrade'
          button.dataset.id = u.id
          button.innerHTML = `
            <span class="row"><span class="name">${u.name}</span></span>
            <span class="row sub"><span>${formatNumber(u.cost)} Nährstoffe</span></span>
            <span class="desc">${u.desc}</span>`
          button.addEventListener('click', () => this.actions.buyUpgrade(u.id))
          return button
        }),
      )
    }
    let affordable = 0
    for (const button of this.upgradeList.querySelectorAll<HTMLButtonElement>('button')) {
      const def = UPGRADES.find((u) => u.id === button.dataset.id)
      button.disabled = !def || !canBuyUpgrade(state, def)
      if (!button.disabled) affordable += 1
    }
    affordable += this.updateSpores(state)
    affordable += this.updateWeb(state)
    this.badge.classList.toggle('zero', affordable === 0)
    this.badge.textContent = String(affordable)
    this.badge.title = `${affordable} Verbesserung${affordable === 1 ? '' : 'en'} kaufbar`

    this.updateAutumn(state)
    this.updateAchievements(state)
    this.updateEco(state)
    this.updateEnv(state)
  }

  /** Zeigt Jahreszeit und Wetter samt Wirkung. */
  private updateEnv(state: GameState): void {
    const { season, weather } = state.env
    const key = `${season}|${weather}`
    if (key === this.envKey) return
    this.envKey = key
    this.envBox.hidden = season === null
    if (season === null) return
    const w = WEATHERS.find((x) => x.id === weather)!
    const fx = envEffects(state.env)
    const pct = (m: number): string => `+${Math.round((m - 1) * 100)} %`
    const chips = ([['Prod', fx.production], ['Klick', fx.click * fx.production], ['Trüffel', fx.truffle], ['Sporen', fx.spores]] as Array<[string, number]>)
      .filter(([, m]) => m !== 1)
      .map(([label, m]) => `<span class="env-chip"><i></i>${label} ${pct(m)}</span>`)
      .join('')
    this.envBox.innerHTML = `<span class="env-name">${SEASON_NAMES[season]} · ${w.name}</span><span class="env-fx">${chips}</span>`
  }

  /** Ökosystem-Bereich im Laubfall-Tab. */
  private updateEco(state: GameState): void {
    const known = state.totalHumus >= 100 || state.ecoPoints > 0 || state.ecos > 0
    this.ecoSection.hidden = !known
    if (!known) return
    const gain = ecoGainNow(state)
    const f = this.ecoFields
    f.points.textContent = String(state.ecoPoints)
    f.bonus.textContent = `×${ecoMultiplier(state.ecoPoints).toFixed(2)}`
    f.rows.textContent = String(state.grid.rows)
    f.count.textContent = String(state.ecos)
    this.ecoButton.disabled = gain < 1
    this.ecoButton.textContent = gain >= 1 ? `Ökosystem gründen · +${gain} Wissen` : 'Ökosystem gründen'
    this.ecoHint.textContent =
      gain >= 1
        ? `Setzt ALLES zurück: Gebäude, Humus, Laubfälle, Sporen, Wood Wide Web und Schweine. Es bleiben Wissen, Erfolge und Zähler. Das nächste Wissen gibt es bei ${formatNumber(humusForPoints(gain + 1))} Humus.`
        : `Sammle in einem Durchgang ${formatNumber(ECO_DIVISOR)} Humus für das erste Wissen (jetzt ${formatNumber(state.totalHumus)}). Jedes weitere Wissen braucht mehr: etwa 4.000 für 2, 9.000 für 3.`
    for (const { points, row } of this.ecoUnlockRows) row.classList.toggle('done', state.ecoPoints >= points)
  }

  private updateAchievements(state: GameState): void {
    const n = state.achievements.length
    this.achSummary.textContent = `${n} / ${ACHIEVEMENTS.length} freigeschaltet · +${Math.round(n * ACHIEVEMENT_BONUS * 100)} % Produktion`
    for (const { id, row } of this.achRows) row.classList.toggle('done', state.achievements.includes(id))
  }

  /** Zeigt den Forschungsbaum; gibt die Zahl kaufbarer Forschungen zurück. */
  private updateWeb(state: GameState): number {
    const known = state.spores > 0 || sporesPerSecond(state) > 0 || state.web.length > 0
    // Der Tab bleibt immer an seinem Platz; ohne Sporen wirkt er nur gedämpft.
    this.webTab.classList.toggle('dim', !known)
    if (!known) return 0
    this.webSummary.textContent = `Verbundene Bäume: ${connectedTrees(state.web)} / 3 · Erforscht: ${state.web.length} / ${WEB_NODES.length}`
    let affordable = 0
    for (const row of this.webRows) {
      const def = getWebNode(row.id)!
      const done = state.web.includes(row.id)
      const open = webRequirementsMet(state.web, def)
      row.button.classList.toggle('done', done)
      row.button.classList.toggle('locked', !done && !open)
      row.state.textContent = done ? '✓' : open ? '' : '🔒'
      if (done) row.cost.textContent = 'Erforscht'
      else if (!open) row.cost.textContent = `Braucht: ${def.requires.filter((r) => !state.web.includes(r)).map((r) => getWebNode(r)!.name).join(', ')}`
      else row.cost.textContent = `${formatNumber(def.cost)} Sporen`
      row.button.disabled = !canBuyWeb(state, row.id)
      if (!row.button.disabled) affordable += 1
    }
    return affordable
  }

  /** Zeigt Sporen und ihre Verbesserungen; gibt die Zahl kaufbarer Verbesserungen zurück. */
  private updateSpores(state: GameState): number {
    const perSecond = sporesPerSecond(state)
    const known = state.spores > 0 || perSecond > 0
    this.sporeStat.hidden = !known
    this.sporeSection.hidden = !known
    if (!known) return 0
    this.sporeValue.textContent = formatNumber(state.spores, 1)
    this.sporeRate.textContent = `+${formatNumber(perSecond, 2)} / Sek`
    let affordable = 0
    for (const row of this.sporeRows) {
      const def = SPORE_UPGRADES.find((u) => u.id === row.id)!
      const level = sporeLevel(state, row.id)
      const max = def.costs.length
      row.count.textContent = `${level}/${max}`
      row.cost.textContent = level >= max ? 'Maximal' : `${formatNumber(def.costs[level])} Sporen`
      row.desc.textContent = level >= max ? def.effect(level) : `${def.effect(level)} → ${def.effect(level + 1)}`
      row.button.disabled = !canBuySporeUpgrade(state, row.id)
      if (!row.button.disabled) affordable += 1
    }
    return affordable
  }

  private updateAutumn(state: GameState): void {
    const gain = prestigeGain(state)
    const f = this.autumnFields
    f.count.textContent = String(state.autumns)
    f.humus.textContent = String(state.humus)
    f.bonus.textContent = `×${humusMult(state).toFixed(2)}`
    f.run.textContent = formatNumber(state.totalNutrients)
    f.life.textContent = formatNumber(state.lifetimeNutrients)

    this.autumnBadge.hidden = gain < 1
    this.prestigeButton.disabled = !canPrestige(state)
    this.prestigeButton.textContent = gain >= 1 ? `Laubfall einläuten · +${gain} Humus` : 'Laubfall einläuten'
    const next = formatNumber((gain + 1) * (gain + 1) * HUMUS_DIVISOR)
    this.autumnHint.textContent =
      gain >= 1
        ? `Gebäude, Verbesserungen, Boden und Knoten werden zurückgesetzt. Humus, Schweine und Fundzähler bleiben. Humus erhöht die Produktion dauerhaft (je mehr du hast, desto weniger bringt der einzelne). Dieser Laubfall: +${Math.round((humusMultiplier(state.totalHumus + gain) / humusMultiplier(state.totalHumus) - 1) * 100)} %. Nächster Humus bei ${next} Nährstoffen.`
        : `Sammle in diesem Durchgang ${formatNumber(HUMUS_DIVISOR)} Nährstoffe für den ersten Humus. Die Bäume färben sich schon herbstlich, je näher du kommst.`

    for (const row of this.humusRows) {
      const def = HUMUS_UPGRADES.find((u) => u.id === row.id)!
      const level = humusLevel(state, row.id)
      const max = def.costs.length
      row.count.textContent = `${level}/${max}`
      row.cost.textContent = level >= max ? 'Maximal' : `${def.costs[level]} Humus`
      row.desc.textContent = level >= max ? def.effect(level) : `${def.effect(level)} → ${def.effect(level + 1)}`
      row.button.disabled = !canBuyHumusUpgrade(state, row.id)
    }
  }

  setTab(name: string): void {
    const known = this.tabButtons.some((b) => b.dataset.tab === name)
    const active = known ? name : DEFAULT_TAB
    for (const b of this.tabButtons) b.classList.toggle('active', b.dataset.tab === active)
    for (const p of this.panes) p.hidden = p.dataset.pane !== active
    try {
      localStorage.setItem(TAB_KEY, active)
    } catch {
      // Speicher blockiert: Tab-Wahl wird dann nur nicht gemerkt.
    }
  }
}
