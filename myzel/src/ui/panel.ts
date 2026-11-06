import { BUILDINGS, NODES, UPGRADES } from '../game/data.ts'
import { nodeCountOf } from '../game/grid.ts'
import { MAX_PIGS, PIG_RATE_BONUS, getBuffDef, pigCost } from '../game/truffle.ts'
import { HUMUS_BONUS, HUMUS_DIVISOR, HUMUS_UPGRADES } from '../game/prestige.ts'
import { REMOVE_TOOL } from './tooltip.ts'
import type { Tool } from './tooltip.ts'
import { formatNumber } from '../game/format.ts'
import {
  buildingCostFor,
  canBuyBuilding,
  canBuyHumusUpgrade,
  canBuyPig,
  canBuyUpgrade,
  canPrestige,
  clickValue,
  humusLevel,
  humusMult,
  isUpgradeVisible,
  nodeCost,
  prestigeGain,
  productionPerSecond,
  truffleRate,
  unitProduction,
} from '../game/state.ts'
import type { GameState } from '../game/state.ts'

export interface PanelActions {
  selectTool: (tool: Tool) => void
  buyPig: () => void
  prestige: () => void
  buyHumus: (id: string) => void
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
    this.element.innerHTML = `
      <div class="top">
        <header>
          <h1>MYZEL</h1>
        </header>
        <section class="stats">
          <div class="stock">
            <span class="big" data-nutrients>0</span>
            <span class="label">Nährstoffe</span>
          </div>
          <div class="rates">
            <span class="rate main" data-pps>0 / Sek</span>
            <span class="rate" data-ppc>+1 / Klick</span>
          </div>
        </section>
        <div class="buffs" data-buffs></div>
      </div>
      <nav class="tabs" role="tablist">
        <button class="tab" role="tab" data-tab="growth">Wachstum</button>
        <button class="tab" role="tab" data-tab="nodes">Knoten</button>
        <button class="tab" role="tab" data-tab="upgrades">Upgrades<span class="badge zero" data-badge>0</span></button>
        <button class="tab" role="tab" data-tab="autumn">Herbst<span class="badge leaf" data-a-badge hidden>!</span></button>
        <button class="tab" role="tab" data-tab="system">Menü</button>
      </nav>
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
        </section>
        <section data-pane="autumn" hidden>
          <div class="autumn-card">
            <div class="a-row"><span>Herbste</span><span data-a-count>0</span></div>
            <div class="a-row"><span>Humus</span><span class="humus" data-a-humus>0</span></div>
            <div class="a-row"><span>Produktionsbonus</span><span data-a-bonus>×1.00</span></div>
            <div class="a-row dim"><span>Gesammelt (Durchgang)</span><span data-a-run>0</span></div>
            <div class="a-row dim"><span>Gesammelt (gesamt)</span><span data-a-life>0</span></div>
          </div>
          <button class="prestige" data-prestige>Herbst einläuten</button>
          <p class="hint" data-a-hint></p>
          <h2 class="subhead">Humus-Verbesserungen</h2>
          <div class="list" data-humus-list></div>
        </section>
        <section data-pane="system" hidden>
          <footer>
            <button data-act="save">Speichern</button>
            <button data-act="export">Export</button>
            <button data-act="import">Import</button>
            <button data-act="reset" class="danger">Neustart</button>
          </footer>
          <p class="hint">Das Spiel speichert automatisch alle 10 Sekunden. Export kopiert den Spielstand als Text in die Zwischenablage.</p>
        </section>
      </div>`

    const q = <T extends HTMLElement>(sel: string): T => this.element.querySelector<T>(sel)!
    this.nutrients = q('[data-nutrients]')
    this.perSecond = q('[data-pps]')
    this.perClick = q('[data-ppc]')
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

    this.tabButtons = [...this.element.querySelectorAll<HTMLButtonElement>('[data-tab]')]
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

    const act = (name: string, fn: () => void): void => {
      q<HTMLButtonElement>(`[data-act="${name}"]`).addEventListener('click', fn)
    }
    act('save', this.actions.save)
    act('export', this.actions.exportSave)
    act('import', this.actions.importSave)
    act('reset', this.actions.reset)
  }

  update(state: GameState, tool: Tool): void {
    for (const row of this.tools) {
      row.button.classList.toggle('selected', row.id === tool)
      if (row.id === REMOVE_TOOL) continue
      const cost = nodeCost(state, row.id)
      row.cost.textContent = `${formatNumber(cost)} Nährstoffe`
      row.button.classList.toggle('poor', state.nutrients.lt(cost))
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
    this.badge.classList.toggle('zero', affordable === 0)
    this.badge.textContent = String(affordable)
    this.badge.title = `${affordable} Verbesserung${affordable === 1 ? '' : 'en'} kaufbar`

    this.updateAutumn(state)
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
    this.prestigeButton.textContent = gain >= 1 ? `Herbst einläuten · +${gain} Humus` : 'Herbst einläuten'
    const next = formatNumber((gain + 1) * (gain + 1) * HUMUS_DIVISOR)
    this.autumnHint.textContent =
      gain >= 1
        ? `Gebäude, Verbesserungen, Boden und Knoten werden zurückgesetzt. Humus, Schweine und Fundzähler bleiben. Jeder Humus gibt dauerhaft +${Math.round(HUMUS_BONUS * 100)} % Produktion. Nächster Humus bei ${next} Nährstoffen.`
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
