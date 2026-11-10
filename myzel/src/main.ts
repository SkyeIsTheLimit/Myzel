import '@fontsource/silkscreen/400.css'
import '@fontsource/silkscreen/700.css'
import './style.css'
import { Application } from 'pixi.js'
import { NODES } from './game/data.ts'
import { isTreeCell } from './game/grid.ts'
import {
  TICK_RATE,
  applyOffline,
  buyBuilding,
  buyUpgrade,
  canClaim,
  canPlace,
  claimCell,
  click,
  buyHumusUpgrade,
  buyPig,
  buySporeUpgrade,
  buyWeb,
  checkAchievements,
  collectTruffle,
  growthScore,
  newState,
  offlineCap,
  placeNode,
  prestige as startAutumn,
  prestigeGain,
  removeNode,
  tick,
  truffleBonus,
  truffleLifetime,
} from './game/state.ts'
import { autumnProgress, humusMultiplier } from './game/prestige.ts'
import type { GameState } from './game/state.ts'
import { TRUFFLE_FIRST_MAX, TRUFFLE_FIRST_MIN, nextSpawnDelay } from './game/truffle.ts'
import { deleteSave, exportSave, importSave, loadGame, saveGame } from './game/save.ts'
import { formatDuration, formatNumber } from './game/format.ts'
import { GridView } from './render/grid.ts'
import type { HoverInfo } from './render/grid.ts'
import { WORLD_H, WORLD_W } from './render/sprites.ts'
import { connectedTrees } from './game/web.ts'
import { World } from './render/world.ts'
import { askConfirm, askText, showText } from './ui/dialog.ts'
import { Panel } from './ui/panel.ts'
import { REMOVE_TOOL, cellTooltip } from './ui/tooltip.ts'
import type { Tool } from './ui/tooltip.ts'

const AUTOSAVE_MS = 10_000
const UI_REFRESH_MS = 100

async function main(): Promise<void> {
  let state: GameState = loadGame() ?? newState()
  const offline = applyOffline(state)

  const root = document.querySelector<HTMLDivElement>('#app')!
  root.innerHTML = `
    <div id="stage-wrap">
      <div id="stage">
        <div id="popups"></div>
        <div id="tooltip" hidden></div>
        <div id="toast" hidden></div>
      </div>
    </div>`
  const stageEl = root.querySelector<HTMLDivElement>('#stage')!
  const wrapEl = root.querySelector<HTMLDivElement>('#stage-wrap')!
  const popups = root.querySelector<HTMLDivElement>('#popups')!
  const tooltip = root.querySelector<HTMLDivElement>('#tooltip')!
  const toast = root.querySelector<HTMLDivElement>('#toast')!

  const app = new Application()
  await app.init({
    width: WORLD_W,
    height: WORLD_H,
    antialias: false,
    roundPixels: true,
    resolution: 1,
    autoDensity: false,
    backgroundColor: 0x1b1410,
  })
  stageEl.insertBefore(app.canvas, popups)

  const world = new World(app)
  app.stage.addChild(world.stage)
  const gridView = new GridView()
  world.gridLayer.addChild(gridView.container)

  let scale = 1
  const resize = (): void => {
    const panelWidth = window.innerWidth > 860 ? 384 : 0
    const availW = window.innerWidth - panelWidth - 40
    const availH = (window.innerWidth > 860 ? window.innerHeight : window.innerHeight * 0.55) - 40
    // Ganzzahliger Pixel-Maßstab, so groß, dass das Spielfeld (384×216) noch komplett passt.
    scale = Math.max(1, Math.floor(Math.min(availW / WORLD_W, availH / WORLD_H)))
    // Der Canvas füllt die gesamte Fläche; das Spielfeld sitzt zentriert darin.
    const viewW = Math.max(WORLD_W, Math.floor(availW / scale))
    const viewH = Math.max(WORLD_H, Math.floor(availH / scale))
    app.renderer.resize(viewW, viewH)
    world.setViewport(viewW, viewH)
    app.canvas.style.width = `${viewW * scale}px`
    app.canvas.style.height = `${viewH * scale}px`
    stageEl.style.setProperty('--scale', String(scale))
  }
  resize()
  new ResizeObserver(resize).observe(wrapEl)
  window.addEventListener('resize', resize)

  const showToast = (text: string, ms = 5000): void => {
    toast.textContent = text
    toast.hidden = false
    window.setTimeout(() => { toast.hidden = true }, ms)
  }

  const spawnPopup = (text: string, x: number, y: number): void => {
    const el = document.createElement('div')
    el.className = 'popup'
    el.textContent = text
    el.style.left = `${x * scale}px`
    el.style.top = `${(y - 6) * scale}px`
    el.style.fontSize = `${6 * scale}px`
    el.addEventListener('animationend', () => el.remove())
    popups.appendChild(el)
  }

  // --- Werkzeug und Gitter-Interaktion ---------------------------------------
  let tool: Tool = null
  let hover: HoverInfo | null = null

  const refreshGrid = (): void => {
    gridView.refresh(state)
    updateHover()
  }
  const refreshWorld = (): void => {
    world.setGrowth(growthScore(state))
    world.truffles.setPigs(state.pigs)
    world.truffles.lifetime = truffleLifetime(state)
    world.setAutumn(autumnProgress(state.totalNutrients))
    world.setWebLinks(connectedTrees(state.web) - 1)
  }

  // Trüffel: zufällige Funde, Schweine verkürzen die Wartezeit.
  let truffleTimer = TRUFFLE_FIRST_MIN + Math.random() * (TRUFFLE_FIRST_MAX - TRUFFLE_FIRST_MIN)
  world.truffles.onCollect = (x, y) => {
    const result = collectTruffle(state, Math.random())
    spawnPopup(result.title, x, y - 6)
    spawnPopup(result.detail, x, y + 6)
    showToast(`${result.title} ${result.detail}`, 3500)
    panel.update(state, tool)
  }
  const refreshAll = (): void => {
    refreshWorld()
    refreshGrid()
    panel.update(state, tool)
  }

  /** Ist die Aktion auf dem Feld unter dem Mauszeiger möglich? */
  const actionValid = (index: number): boolean => {
    if (isTreeCell(index)) return false
    if (tool === REMOVE_TOOL) return state.grid.nodes[index] !== null
    if (tool) return canPlace(state, index, tool)
    return canClaim(state, index)
  }

  function updateHover(): void {
    if (!hover) {
      gridView.setHighlight(null, false, null)
      tooltip.hidden = true
      return
    }
    const { index } = hover
    const emptyClaimed = state.grid.claimed[index] && state.grid.nodes[index] === null
    const ghost = tool && tool !== REMOVE_TOOL && emptyClaimed ? tool : null
    gridView.setHighlight(index, actionValid(index), ghost)

    tooltip.innerHTML = cellTooltip(state, index, tool)
    tooltip.hidden = false
    const x = hover.x * scale
    const y = hover.y * scale
    const flip = x > app.screen.width * scale - 220
    tooltip.style.left = `${flip ? x - tooltip.offsetWidth - 14 : x + 14}px`
    tooltip.style.top = `${Math.max(4, y - 8)}px`
  }

  gridView.onHover = (info) => {
    hover = info
    updateHover()
  }

  gridView.onCellClick = (index) => {
    if (isTreeCell(index)) return
    let changed = false
    if (tool === REMOVE_TOOL) changed = removeNode(state, index)
    else if (tool) changed = placeNode(state, index, tool)
    else changed = claimCell(state, index)
    if (changed) refreshAll()
  }

  const selectTool = (next: Tool): void => {
    tool = next === tool ? null : next
    if (tool) panel.setTab('nodes')
    panel.update(state, tool)
    updateHover()
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') selectTool(null)
    const n = Number(e.key)
    if (Number.isInteger(n) && n >= 1 && n <= NODES.length && !e.metaKey && !e.ctrlKey) {
      selectTool(NODES[n - 1].id)
    }
  })

  world.onLogClick = (x, y) => {
    const gain = click(state)
    spawnPopup(`+${formatNumber(gain, 1)}`, x, y)
  }

  const panel: Panel = new Panel({
    selectTool,
    buyBuilding: (id) => { if (buyBuilding(state, id)) refreshWorld() },
    buyUpgrade: (id) => { buyUpgrade(state, id) },
    buyPig: () => { if (buyPig(state)) refreshWorld() },
    buyHumus: (id) => { if (buyHumusUpgrade(state, id)) refreshAll() },
    buySpore: (id) => { buySporeUpgrade(state, id) },
    buyWeb: (id) => { if (buyWeb(state, id)) refreshWorld() },
    prestige: async () => {
      const gain = prestigeGain(state)
      if (gain < 1) return
      const bonus = Math.round((humusMultiplier(state.totalHumus + gain) / humusMultiplier(state.totalHumus) - 1) * 100)
      const ok = await askConfirm(
        `Herbst einläuten?\n\nDu erhältst ${gain} Humus (+${bonus} % Produktion dauerhaft).\n` +
          'Gebäude, Verbesserungen, Boden und Knoten werden zurückgesetzt.\nHumus, Schweine und Fundzähler bleiben.',
        'Herbst einläuten',
      )
      if (!ok) return
      startAutumn(state)
      tool = null
      world.leafBurst()
      refreshAll()
      saveGame(state)
      showToast(`Der Herbst ist da! +${gain} Humus`, 6000)
    },
    save: () => { saveGame(state); showToast('Gespeichert.', 1500) },
    exportSave: async () => {
      const text = exportSave(state)
      try {
        await navigator.clipboard.writeText(text)
        showToast('Spielstand in die Zwischenablage kopiert.', 2500)
      } catch {
        await showText('Kopiere den Spielstand aus dem Feld:', text)
      }
    },
    importSave: async () => {
      const text = await askText('Exportierten Spielstand hier einfügen:', 'Laden')
      if (!text) return
      const loaded = importSave(text)
      if (!loaded) { showToast('Spielstand ungültig.', 2500); return }
      state = loaded
      refreshAll()
      saveGame(state)
      showToast('Spielstand geladen.', 2000)
    },
    reset: async () => {
      if (!(await askConfirm('Wirklich alles zurücksetzen? Der gesamte Spielstand geht verloren.', 'Neustart', true))) return
      deleteSave()
      state = newState()
      tool = null
      refreshAll()
    },
  })
  root.appendChild(panel.element)

  // Schon erreichte Erfolge (etwa nach einem Update) still verbuchen, ohne Meldung.
  checkAchievements(state)
  refreshAll()
  if (offline.seconds > 60) {
    showToast(`Willkommen zurück! In ${formatDuration(offline.seconds)} hat das Myzel ${formatNumber(offline.gained)} Nährstoffe gesammelt.`, 7000)
  }

  const step = 1 / TICK_RATE
  let accumulator = 0
  let sinceUi = 0
  let sinceSave = 0
  app.ticker.add((ticker) => {
    const dtMs = ticker.deltaMS
    const dt = dtMs / 1000
    if (dt > 1) {
      // Tab war im Hintergrund: wie Offline-Zeit behandeln.
      tick(state, Math.min(dt, offlineCap(state)))
    } else {
      accumulator += dt
      while (accumulator >= step) {
        tick(state, step)
        accumulator -= step
      }
    }
    const frameMs = Math.min(dtMs, 250)
    world.update(frameMs)
    gridView.update(frameMs)

    truffleTimer -= Math.min(dt, 1)
    if (truffleTimer <= 0) {
      world.truffles.spawn()
      truffleTimer = nextSpawnDelay(Math.random(), state.pigs, truffleBonus(state))
    }

    sinceUi += dtMs
    if (sinceUi >= UI_REFRESH_MS) {
      sinceUi = 0
      for (const a of checkAchievements(state)) showToast(`Erfolg: ${a.name}  (+2 % Produktion)`, 4500)
      world.setAutumn(autumnProgress(state.totalNutrients))
      panel.update(state, tool)
      updateHover()
    }
    sinceSave += dtMs
    if (sinceSave >= AUTOSAVE_MS) {
      sinceSave = 0
      saveGame(state)
    }
  })

  window.addEventListener('beforeunload', () => saveGame(state))

  if (import.meta.env.DEV) {
    // Nur im Dev-Modus: Zugriff auf den Spielzustand für manuelle Tests.
    Object.defineProperty(window, '__game', { get: () => ({ state, refreshAll, world, spawnTruffle: () => world.truffles.spawn() }) })
  }
}

void main()
