import { Container, Graphics, Rectangle, Sprite } from 'pixi.js'
import type { FederatedPointerEvent, Texture } from 'pixi.js'
import { CELLS, GRID_COLS, GRID_ROWS, colOf, isClaimable, isTreeCell, neighbors, rowOf } from '../game/grid.ts'
import type { GameState } from '../game/state.ts'
import { SURFACE_Y, TILE, WORLD_W, buildGlowTexture, buildNodeTextures } from './sprites.ts'
import type { NodeTextures } from './sprites.ts'

/** Obere Kante der ersten Gitterreihe (unter der Grasreihe). */
export const GRID_TOP = SURFACE_Y + TILE

export interface HoverInfo {
  index: number
  /** Mausposition in Weltpixeln. */
  x: number
  y: number
}

export class GridView {
  readonly container = new Container()
  onCellClick: (index: number) => void = () => {}
  onHover: (info: HoverInfo | null) => void = () => {}

  private textures: NodeTextures = buildNodeTextures()
  private glowTexture = buildGlowTexture()
  private overlay = new Graphics()
  /** Hyphenfäden zwischen den erschlossenen Feldern. */
  private threads = new Graphics()
  private dots = new Graphics()
  private activeLinks: Array<{ ax: number; ay: number; bx: number; by: number; phase: number }> = []
  private nodeLayer = new Container()
  private highlight = new Graphics()
  private ghost = new Sprite()
  private pulses: Array<{ sprite: Sprite; phase: number }> = []
  private time = 0

  constructor() {
    this.container.hitArea = new Rectangle(0, GRID_TOP, WORLD_W, GRID_ROWS * TILE)
    this.container.eventMode = 'static'
    this.container.cursor = 'pointer'
    this.ghost.alpha = 0.6
    this.ghost.visible = false
    this.container.addChild(this.overlay, this.threads, this.nodeLayer, this.dots, this.ghost, this.highlight)

    const cellAt = (e: FederatedPointerEvent): number => {
      // Lokale Koordinaten, weil die Welt im Canvas verschoben sein kann.
      const p = this.container.toLocal(e.global)
      const col = Math.floor(p.x / TILE)
      const row = Math.floor((p.y - GRID_TOP) / TILE)
      if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return -1
      return row * GRID_COLS + col
    }
    this.container.on('pointermove', (e: FederatedPointerEvent) => {
      const index = cellAt(e)
      this.onHover(index < 0 ? null : { index, x: e.global.x, y: e.global.y })
    })
    this.container.on('pointerout', () => this.onHover(null))
    this.container.on('pointerdown', (e: FederatedPointerEvent) => {
      const index = cellAt(e)
      if (index >= 0) this.onCellClick(index)
    })
  }

  /** Zeichnet gesperrte Felder und Knoten neu. Nach jeder Zustandsänderung aufrufen. */
  refresh(state: GameState): void {
    const { grid } = state
    this.overlay.clear()
    this.nodeLayer.removeChildren().forEach((c) => c.destroy())
    this.pulses = []
    this.drawThreads(state)

    for (let i = 0; i < CELLS; i++) {
      const x = colOf(i) * TILE
      const y = GRID_TOP + rowOf(i) * TILE
      // Baumwurzelfelder werden von der Welt gezeichnet (unter dem Myzel).
      if (isTreeCell(i)) continue
      if (!grid.claimed[i]) {
        const claimable = isClaimable(grid, i)
        this.overlay.rect(x, y, TILE, TILE).fill({ color: 0x0a0604, alpha: claimable ? 0.38 : 0.6 })
        if (claimable) this.overlay.rect(x + 0.5, y + 0.5, TILE - 1, TILE - 1).stroke({ width: 1, color: 0x9fe8c8, alpha: 0.45 })
        continue
      }
      this.overlay.rect(x + 0.5, y + 0.5, TILE - 1, TILE - 1).stroke({ width: 1, color: 0xffffff, alpha: 0.07 })

      const id = grid.nodes[i]
      if (!id) continue
      const glow = new Sprite(this.glowTexture)
      glow.position.set(x, y)
      glow.blendMode = 'add'
      this.nodeLayer.addChild(glow)
      this.pulses.push({ sprite: glow, phase: i * 0.7 })
      const icon = new Sprite(this.textures[id as keyof NodeTextures])
      icon.position.set(x, y)
      this.nodeLayer.addChild(icon)
    }
  }

  /**
   * Zeichnet Hyphenfäden zwischen allen erschlossenen Nachbarfeldern (und den Baumwurzeln). Zwischen Feldern mit
   * Knoten leuchten sie und Nährstoffe wandern darüber; so hängt das ganze Gitter sichtbar am Geflecht.
   */
  private drawThreads(state: GameState): void {
    const { grid } = state
    this.threads.clear()
    this.activeLinks = []
    const live = (i: number): boolean => isTreeCell(i) || grid.claimed[i]
    const center = (i: number): [number, number] => [colOf(i) * TILE + TILE / 2, GRID_TOP + rowOf(i) * TILE + TILE / 2]
    for (let a = 0; a < CELLS; a++) {
      if (!live(a)) continue
      for (const b of neighbors(a)) {
        if (b < a || !live(b)) continue
        if (isTreeCell(a) && isTreeCell(b)) continue
        const [ax, ay] = center(a)
        const [bx, by] = center(b)
        const active = (isTreeCell(a) || grid.nodes[a] !== null) && (isTreeCell(b) || grid.nodes[b] !== null)
        // Leichter Bogen, damit die Fäden nicht wie ein Raster aussehen.
        const bend = (((a * 7 + b * 13) % 5) - 2) * 0.7
        const mx = (ax + bx) / 2 + (ay === by ? 0 : bend)
        const my = (ay + by) / 2 + (ay === by ? bend : 0)
        this.threads
          .moveTo(ax, ay)
          .quadraticCurveTo(mx, my, bx, by)
          .stroke({ width: 1, color: active ? 0x9fe8c8 : 0xd9c79d, alpha: active ? 0.55 : 0.16 })
        if (active) this.activeLinks.push({ ax, ay, bx, by, phase: ((a * 31 + b * 17) % 100) / 100 })
      }
    }
  }

  /** Hebt ein Feld hervor; `ghostType` zeigt eine Vorschau des Knotens, der gesetzt würde. */
  setHighlight(index: number | null, valid: boolean, ghostType: string | null): void {
    this.highlight.clear()
    this.ghost.visible = false
    if (index === null || index < 0) return
    const x = colOf(index) * TILE
    const y = GRID_TOP + rowOf(index) * TILE
    this.highlight.rect(x + 0.5, y + 0.5, TILE - 1, TILE - 1).stroke({ width: 1, color: valid ? 0xb8ffd8 : 0xff7a6a, alpha: 0.95 })
    if (ghostType && ghostType in this.textures) {
      this.ghost.texture = this.textures[ghostType as keyof NodeTextures] as Texture
      this.ghost.position.set(x, y)
      this.ghost.alpha = valid ? 0.65 : 0.35
      this.ghost.visible = true
    }
  }

  update(dtMs: number): void {
    this.time += dtMs / 1000
    this.dots.clear()
    for (const l of this.activeLinks) {
      const f = (this.time * 0.45 + l.phase) % 1
      this.dots.rect(l.ax + (l.bx - l.ax) * f - 0.5, l.ay + (l.by - l.ay) * f - 0.5, 1.5, 1.5).fill({ color: 0xf2ffd8, alpha: 0.9 })
    }
    for (const p of this.pulses) p.sprite.alpha = 0.45 + 0.4 * Math.sin(this.time * 2.4 + p.phase)
  }
}
