import { Texture } from 'pixi.js'

/** Spielwelt-Auflösung in "echten" Pixeln; wird ganzzahlig auf den Bildschirm hochskaliert. */
export const WORLD_W = 384
export const WORLD_H = 216
export const TILE = 16
/** Obere Kante der Grasreihe. Darüber ist Himmel, darunter sind 8 Bodenreihen à 16 px. */
export const SURFACE_Y = 88

export const COLORS = {
  skyDay: [0x7cc8ee, 0x96d4f2, 0xb0e0f6, 0xcbebf9, 0xe2f4fb],
  skyNight: [0x0b1026, 0x10183a, 0x172148, 0x1f2b57, 0x2a376a],
  nightTint: 0x0a1230,
  mycelCore: '#f4efd0',
  mycelGlow: 'rgba(130,240,190,0.13)',
}

export function rng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

export function toTexture(canvas: HTMLCanvasElement): Texture {
  const tex = Texture.from(canvas)
  tex.source.scaleMode = 'nearest'
  return tex
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, w = 1, h = 1): void {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function soilTile(seed: number, base: string, dark: string, light: string, pebble: string | null): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(TILE, TILE)
  const r = rng(seed)
  px(ctx, 0, 0, base, TILE, TILE)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const v = r()
      if (v < 0.13) px(ctx, x, y, dark)
      else if (v < 0.22) px(ctx, x, y, light)
    }
  }
  if (pebble) {
    for (let i = 0; i < 2; i++) {
      const x = 1 + Math.floor(r() * 11)
      const y = 1 + Math.floor(r() * 11)
      px(ctx, x, y, pebble, 3, 2)
      px(ctx, x, y + 2, dark, 3, 1)
      px(ctx, x, y, light)
    }
  }
  return canvas
}

function grassTile(seed: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(TILE, TILE)
  const r = rng(seed)
  const soil = soilTile(seed + 99, '#6a4328', '#4f301c', '#7d5233', null)
  ctx.drawImage(soil, 0, 0)
  for (let x = 0; x < TILE; x++) {
    const h = 4 + Math.floor(r() * 3)
    // Obere Kante ausschneiden, damit der Himmel durchscheint und Halme entstehen.
    ctx.clearRect(x, 0, 1, 6 - h + 2)
    px(ctx, x, 8 - h, '#5fb04a', 1, 1)
    px(ctx, x, 9 - h, '#468e3a', 1, h - 3)
    px(ctx, x, 6, '#2f6a2e')
    if (r() < 0.25) px(ctx, x, 7, '#2f6a2e')
  }
  return canvas
}

export function buildSoilTextures(): {
  grass: Texture[]
  humus: Texture[]
  dirt: Texture[]
  clay: Texture[]
  stone: Texture[]
  deep: Texture[]
  bedrock: Texture[]
} {
  const make = (base: string, dark: string, light: string, pebble: string | null, seed: number): Texture[] =>
    [0, 1, 2, 3].map((i) => toTexture(soilTile(seed + i * 17, base, dark, light, pebble)))
  return {
    grass: [0, 1, 2, 3].map((i) => toTexture(grassTile(1 + i * 31))),
    humus: make('#5a3820', '#42261a', '#6e4629', null, 100),
    dirt: make('#6a4328', '#4f301c', '#7d5233', '#8a6a4a', 200),
    clay: make('#7a4a30', '#5e3624', '#8f5c3d', '#a06a48', 300),
    stone: make('#5d616c', '#464a54', '#727786', '#8a8f9e', 400),
    deep: make('#464a58', '#363946', '#565b6c', '#6a7084', 500),
    bedrock: make('#2e303c', '#22242e', '#3a3d4b', '#4b4f61', 600),
  }
}

function filledCircle(mask: boolean[][], cx: number, cy: number, radius: number): void {
  for (let y = 0; y < mask.length; y++) {
    for (let x = 0; x < mask[0].length; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= radius * radius) mask[y][x] = true
    }
  }
}

export interface TreePalette {
  light: string
  mid: string
  dark: string
  edge: string
}

export const GREEN_TREE: TreePalette = { light: '#5fb054', mid: '#3f8f3a', dark: '#2d6a2e', edge: '#234f27' }
export const AUTUMN_TREE: TreePalette = { light: '#f2c14e', mid: '#e08a2f', dark: '#b8561f', edge: '#7a3a14' }

export function buildTreeTexture(seed: number, palette: TreePalette = GREEN_TREE): Texture {
  const w = 48
  const h = 76
  const { canvas, ctx } = makeCanvas(w, h)
  const r = rng(seed)

  // Stamm
  for (let y = 34; y < h; y++) {
    const flare = y > h - 5 ? (y - (h - 5)) : 0
    const left = 20 - flare
    const width = 8 + flare * 2
    px(ctx, left, y, '#7d5833', width, 1)
    px(ctx, left, y, '#6b4a2b', 2, 1)
    px(ctx, left + width - 2, y, '#523620', 2, 1)
    if (r() < 0.3) px(ctx, left + 2 + Math.floor(r() * (width - 4)), y, '#523620')
  }

  // Krone
  const mask: boolean[][] = Array.from({ length: 48 }, () => Array<boolean>(w).fill(false))
  filledCircle(mask, 24, 22, 16)
  filledCircle(mask, 12, 31, 11)
  filledCircle(mask, 36, 31, 11)
  filledCircle(mask, 24, 11, 11)
  filledCircle(mask, 15, 18, 9)
  filledCircle(mask, 33, 18, 9)
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y][x]) continue
      const edge = !mask[y - 1]?.[x] || !mask[y + 1]?.[x] || !mask[y]?.[x - 1] || !mask[y]?.[x + 1]
      const v = (x / w) * 0.4 + (y / 44) * 0.6 + (r() - 0.5) * 0.4
      let color = palette.mid
      if (v < 0.28) color = palette.light
      else if (v > 0.68) color = palette.dark
      if (edge) color = palette.edge
      px(ctx, x, y, color)
    }
  }
  return toTexture(canvas)
}

export function buildLogTexture(): Texture {
  const w = 40
  const h = 14
  const { canvas, ctx } = makeCanvas(w, h)
  px(ctx, 2, 2, '#6b4a2b', w - 4, 10)
  px(ctx, 1, 3, '#6b4a2b', w - 2, 8)
  px(ctx, 3, 2, '#8a6238', w - 6, 1)
  px(ctx, 3, 11, '#4a3220', w - 6, 1)
  px(ctx, 2, 10, '#4a3220', w - 4, 1)
  for (let x = 7; x < w - 3; x += 4) px(ctx, x, 4, '#523620', 1, 5)
  // Stirnseite mit Jahresringen
  px(ctx, 0, 3, '#c9a46a', 3, 8)
  px(ctx, 1, 4, '#a8844a', 1, 6)
  px(ctx, 1, 6, '#c9a46a', 1, 2)
  // Moos
  for (const x of [10, 11, 12, 22, 23, 29, 30, 31]) px(ctx, x, 1, '#4f9a47')
  px(ctx, 11, 2, '#3f8f3a', 3, 1)
  px(ctx, 29, 2, '#3f8f3a', 3, 1)
  return toTexture(canvas)
}

export function buildMushroomTexture(): Texture {
  const { canvas, ctx } = makeCanvas(12, 14)
  px(ctx, 4, 8, '#efe6d0', 4, 6)
  px(ctx, 7, 8, '#cdbf9f', 1, 6)
  const rows: Array<[number, number]> = [
    [4, 4], [2, 8], [1, 10], [0, 12], [0, 12], [0, 12],
  ]
  rows.forEach(([x, width], i) => {
    px(ctx, x, 1 + i, '#d94f4f', width, 1)
    px(ctx, x, 1 + i, '#e87474', 1, 1)
  })
  px(ctx, 0, 6, '#a83636', 12, 1)
  px(ctx, 1, 7, '#8a2a2a', 10, 1)
  for (const [x, y] of [[3, 3], [7, 2], [9, 4], [5, 5]]) px(ctx, x, y, '#fff2e0', 2, 1)
  return toTexture(canvas)
}

export interface NodeTextures {
  root: Texture
  decomposer: Texture
  conduit: Texture
  fruit: Texture
}

export function buildNodeTextures(): NodeTextures {
  const make = (draw: (ctx: CanvasRenderingContext2D) => void): Texture => {
    const { canvas, ctx } = makeCanvas(TILE, TILE)
    draw(ctx)
    return toTexture(canvas)
  }
  const disc = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: (dx: number, dy: number) => string): void => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= radius * radius) px(ctx, x, y, color(dx, dy))
      }
    }
  }

  return {
    root: make((ctx) => {
      for (const [x, y, w, h] of [[7, 0, 1, 4], [8, 12, 1, 4], [0, 8, 4, 1], [12, 7, 4, 1], [3, 3, 1, 1], [12, 3, 1, 1], [3, 12, 1, 1], [12, 12, 1, 1]]) {
        px(ctx, x, y, '#e9dcc0', w, h)
      }
      disc(ctx, 7.5, 7.5, 4.6, (dx, dy) => (dx + dy > 3 ? '#6b4a2b' : '#8a6238'))
      px(ctx, 5, 5, '#c9a46a', 2, 1)
      px(ctx, 7, 7, '#9fe8c8', 2, 2)
    }),
    decomposer: make((ctx) => {
      disc(ctx, 7.5, 8, 6.2, (dx, dy) => (dx + dy > 4 ? '#a8741f' : dx + dy < -4 ? '#f3cf7a' : '#d9a441'))
      for (const [x, y] of [[5, 6], [9, 5], [8, 9], [5, 10], [10, 10]]) px(ctx, x, y, '#6b4a2b', 1, 1)
    }),
    conduit: make((ctx) => {
      px(ctx, 0, 6, '#2f6a5a', 16, 4)
      px(ctx, 6, 0, '#2f6a5a', 4, 16)
      px(ctx, 0, 7, '#9fe8c8', 16, 2)
      px(ctx, 7, 0, '#9fe8c8', 2, 16)
      px(ctx, 6, 6, '#e9fff3', 4, 4)
    }),
    fruit: make((ctx) => {
      px(ctx, 6, 9, '#efe6d0', 4, 7)
      px(ctx, 9, 9, '#cdbf9f', 1, 7)
      const rows: Array<[number, number]> = [[5, 6], [3, 10], [2, 12], [1, 14], [1, 14], [1, 14]]
      rows.forEach(([x, w], i) => {
        px(ctx, x, 2 + i, '#d94f4f', w, 1)
        px(ctx, x, 2 + i, '#e87474', 1, 1)
      })
      px(ctx, 1, 8, '#a83636', 14, 1)
      for (const [x, y] of [[4, 4], [9, 3], [11, 5], [7, 6]]) px(ctx, x, y, '#fff2e0', 2, 1)
    }),
  }
}

/** Weicher Lichtschein, mit additivem Blending für pulsierende Knoten; `rgb` z. B. '255,214,120' für Gold. */
export function buildGlowTexture(rgb = '159,232,200'): Texture {
  const { canvas, ctx } = makeCanvas(TILE, TILE)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 8
      const a = Math.max(0, 1 - d)
      if (a > 0) px(ctx, x, y, `rgba(${rgb},${(Math.round(a * 4) / 4) * 0.5})`)
    }
  }
  return toTexture(canvas)
}

/** Hügelsilhouette als Pixelsäulen; `base` ist die mittlere Höhe, `amp` die Schwankung. */
export function buildHillTexture(seed: number, width: number, height: number, base: number, amp: number, color: string, edge: string): Texture {
  const { canvas, ctx } = makeCanvas(width, height)
  const r = rng(seed)
  const p1 = r() * 6, p2 = r() * 6, p3 = r() * 6
  for (let x = 0; x < width; x++) {
    const h = base + amp * (0.55 * Math.sin(x / 47 + p1) + 0.3 * Math.sin(x / 19 + p2) + 0.15 * Math.sin(x / 7 + p3))
    const top = height - Math.round(h)
    px(ctx, x, top, color, 1, height - top)
    px(ctx, x, top, edge, 1, 1)
  }
  return toTexture(canvas)
}

export interface PinePalette {
  light: string
  mid: string
  dark: string
}

/** Tanne aus gestaffelten Stufen; links hell, rechts dunkel. */
export function buildPineTexture(seed: number, w: number, h: number, c: PinePalette): Texture {
  const { canvas, ctx } = makeCanvas(w, h)
  const r = rng(seed)
  const trunk = Math.max(2, Math.round(h * 0.12))
  const body = h - trunk
  const tiers = Math.max(3, Math.round(body / 9))
  const cx = (w - 1) / 2
  px(ctx, Math.floor(cx), body, c.dark, Math.max(1, Math.round(w / 8)), trunk)
  for (let y = 0; y < body; y++) {
    const t = y / body
    const k = Math.floor(t * tiers)
    const u = t * tiers - k
    // Leicht unregelmäßige Kanten, damit nicht jede Tanne wie ein Dreieck aussieht.
    const hw = ((k + 1 + u * 0.85) / (tiers + 0.5)) * (w / 2) + (r() - 0.5) * 1.6
    const x0 = Math.round(cx - hw)
    const x1 = Math.round(cx + hw)
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / Math.max(hw, 1)
      let color = dx < -0.35 ? c.light : dx > 0.25 ? c.dark : c.mid
      if (x === x0 || x === x1) color = c.dark
      else if (r() < 0.07) color = c.dark
      px(ctx, x, y, color)
    }
  }
  return toTexture(canvas)
}

export interface TrunkStyle {
  main: string
  dark: string
  /** Optionale Rindenmarkierungen (z. B. bei Birken). */
  mark?: string
}

/** Laubbaum mit runder Krone aus mehreren Kreisen; Stamm unten, Krone oben. */
export function buildCanopyTexture(seed: number, w: number, h: number, c: PinePalette, trunk: TrunkStyle): Texture {
  const { canvas, ctx } = makeCanvas(w, h)
  const r = rng(seed)
  const cx = (w - 1) / 2
  const canopyH = Math.round(h * 0.64)

  const trunkW = Math.max(2, Math.round(w / 9))
  const trunkX = Math.floor(cx - trunkW / 2 + 0.5)
  for (let y = Math.round(canopyH * 0.6); y < h; y++) {
    const flare = y > h - 3 ? 1 : 0
    px(ctx, trunkX - flare, y, trunk.main, trunkW + flare * 2, 1)
    px(ctx, trunkX + trunkW - 1 + flare, y, trunk.dark, 1, 1)
    if (trunk.mark && r() < 0.22) px(ctx, trunkX + Math.floor(r() * trunkW), y, trunk.mark)
  }

  const mask: boolean[][] = Array.from({ length: canopyH + 1 }, () => Array<boolean>(w).fill(false))
  filledCircle(mask, cx, canopyH * 0.5, w * 0.34)
  filledCircle(mask, cx - w * 0.2, canopyH * 0.64, w * 0.26)
  filledCircle(mask, cx + w * 0.2, canopyH * 0.64, w * 0.26)
  filledCircle(mask, cx + (r() - 0.5) * w * 0.2, canopyH * 0.3, w * 0.25)
  for (let y = 0; y < mask.length; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y][x]) continue
      const edge = !mask[y - 1]?.[x] || !mask[y + 1]?.[x] || !mask[y]?.[x - 1] || !mask[y]?.[x + 1]
      const v = (x / w) * 0.4 + (y / canopyH) * 0.6 + (r() - 0.5) * 0.4
      let color = c.mid
      if (v < 0.3) color = c.light
      else if (v > 0.68) color = c.dark
      px(ctx, x, y, edge ? c.dark : color)
    }
  }
  return toTexture(canvas)
}

export interface PlantTextures {
  tuft: Texture[]
  fern: Texture
  bush: Texture
  flowers: Texture[]
}

/** Vordergrund-Pflanzen: Grasbüschel, Farn, Busch und Blumen. */
export function buildPlantTextures(): PlantTextures {
  const tuft = [11, 23].map((seed) => {
    const { canvas, ctx } = makeCanvas(10, 8)
    const r = rng(seed)
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(r() * 8)
      const h = 3 + Math.floor(r() * 5)
      px(ctx, x, 8 - h, '#8fd06a')
      px(ctx, x, 9 - h, '#5fb04a', 1, h - 2)
      px(ctx, x, 7, '#2f6a2e')
    }
    return toTexture(canvas)
  })

  const fernCanvas = makeCanvas(14, 10)
  for (const [dir, len] of [[-1, 6], [-1, 4], [0, 8], [1, 4], [1, 6]] as Array<[number, number]>) {
    for (let i = 0; i < len; i++) {
      const x = 6 + dir * Math.round(i * 0.9) + (dir === 0 ? 0 : 0)
      const y = 9 - i - (dir === 0 ? 0 : Math.floor(i / 3))
      px(fernCanvas.ctx, x, y, i % 2 === 0 ? '#3f8f3a' : '#5fb054')
      if (i > 1 && dir !== 0) px(fernCanvas.ctx, x + dir, y + 1, '#2f6a2e')
    }
  }

  const bushCanvas = makeCanvas(22, 13)
  const mask: boolean[][] = Array.from({ length: 13 }, () => Array<boolean>(22).fill(false))
  filledCircle(mask, 6, 8, 5)
  filledCircle(mask, 15, 8, 5.5)
  filledCircle(mask, 11, 6, 6)
  const rb = rng(77)
  for (let y = 0; y < 13; y++) {
    for (let x = 0; x < 22; x++) {
      if (!mask[y][x]) continue
      const edge = !mask[y - 1]?.[x] || !mask[y]?.[x - 1] || !mask[y]?.[x + 1]
      const v = y / 13 + (rb() - 0.5) * 0.5
      px(bushCanvas.ctx, x, y, edge ? '#234f27' : v < 0.35 ? '#5fb054' : v > 0.7 ? '#2d6a2e' : '#3f8f3a')
    }
  }

  const flowers = ['#f2e66a', '#f4f0ff', '#e68bd0'].map((head) => {
    const { canvas, ctx } = makeCanvas(5, 8)
    px(ctx, 2, 3, '#468e3a', 1, 5)
    px(ctx, 1, 6, '#5fb04a', 1, 1)
    px(ctx, 3, 5, '#5fb04a', 1, 1)
    px(ctx, 1, 1, head, 3, 3)
    px(ctx, 2, 2, '#fff6c8')
    return toTexture(canvas)
  })

  return { tuft, fern: toTexture(fernCanvas.canvas), bush: toTexture(bushCanvas.canvas), flowers }
}

export function buildCloudTexture(seed: number): Texture {
  const w = 36
  const h = 12
  const { canvas, ctx } = makeCanvas(w, h)
  const r = rng(seed)
  const mask: boolean[][] = Array.from({ length: h }, () => Array<boolean>(w).fill(false))
  filledCircle(mask, 10, 7, 5)
  filledCircle(mask, 18, 5, 6)
  filledCircle(mask, 26, 7, 5)
  filledCircle(mask, 15 + Math.floor(r() * 6), 8, 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y][x]) continue
      px(ctx, x, y, mask[y + 1]?.[x] ? '#f4fbff' : '#d3e6f2')
    }
  }
  return toTexture(canvas)
}

export function buildSunTexture(): Texture {
  const { canvas, ctx } = makeCanvas(14, 14)
  const mask: boolean[][] = Array.from({ length: 14 }, () => Array<boolean>(14).fill(false))
  filledCircle(mask, 6.5, 6.5, 6.5)
  for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) if (mask[y][x]) px(ctx, x, y, '#ffe27a')
  px(ctx, 4, 4, '#fff3b0', 5, 5)
  return toTexture(canvas)
}

export function buildMoonTexture(): Texture {
  const { canvas, ctx } = makeCanvas(12, 12)
  const mask: boolean[][] = Array.from({ length: 12 }, () => Array<boolean>(12).fill(false))
  filledCircle(mask, 5.5, 5.5, 5.5)
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (mask[y][x]) px(ctx, x, y, '#e8ecf4')
  px(ctx, 3, 3, '#c5cbdb', 2, 2)
  px(ctx, 7, 6, '#c5cbdb', 3, 2)
  px(ctx, 4, 8, '#c5cbdb', 2, 1)
  return toTexture(canvas)
}

/** Trüffel: dunkle, knollige Kugel mit hellen Adern, 12×10 Pixel. */
export function buildTruffleTexture(): Texture {
  const { canvas, ctx } = makeCanvas(12, 10)
  const r = rng(5)
  const mask: boolean[][] = Array.from({ length: 10 }, () => Array<boolean>(12).fill(false))
  filledCircle(mask, 5.5, 5.2, 4.6)
  filledCircle(mask, 3.5, 6.2, 3.2)
  filledCircle(mask, 8.2, 6, 3.4)
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 12; x++) {
      if (!mask[y][x]) continue
      const edge = !mask[y - 1]?.[x] || !mask[y]?.[x - 1] || !mask[y]?.[x + 1] || !mask[y + 1]?.[x]
      const v = (x / 12) * 0.5 + (y / 10) * 0.7 + (r() - 0.5) * 0.35
      let color = '#4a3428'
      if (v < 0.35) color = '#6e5240'
      else if (v > 0.95) color = '#2a1c16'
      if (edge) color = '#1f1410'
      px(ctx, x, y, color)
    }
  }
  for (const [x, y] of [[4, 3], [7, 4], [5, 6], [8, 7]]) px(ctx, x, y, '#b8a088')
  return toTexture(canvas)
}

export interface PigTextures {
  walkA: Texture
  walkB: Texture
  sniff: Texture
}

/** Trüffelschwein, 20×12 Pixel, blickt nach rechts. Drei Posen: Gehen (zwei Beinstellungen) und Schnüffeln. */
export function buildPigTextures(): PigTextures {
  const draw = (legPhase: number, headDrop: number): Texture => {
    const { canvas, ctx } = makeCanvas(20, 12)
    const body = '#f2a7a0'
    const shade = '#d98a86'
    const dark = '#8a3b3b'
    // Beine: zwei Paare, wechselseitig angehoben
    for (const [x, lift] of [[4, legPhase], [6, 1 - legPhase], [11, 1 - legPhase], [13, legPhase]]) {
      px(ctx, x, 9, shade, 2, 2 - lift)
      px(ctx, x, 11 - lift, '#6b4a3a', 2, 1)
    }
    // Rumpf
    px(ctx, 3, 3, body, 12, 6)
    px(ctx, 4, 2, body, 10, 1)
    px(ctx, 3, 8, shade, 12, 1)
    px(ctx, 4, 4, '#f8c4be', 4, 1)
    // Ringelschwanz
    px(ctx, 2, 3, shade, 1, 2)
    px(ctx, 1, 2, shade, 1, 1)
    // Kopf (beim Schnüffeln gesenkt)
    px(ctx, 14, 2 + headDrop, body, 4, 6)
    px(ctx, 14, 2 + headDrop, '#f8c4be', 2, 1)
    px(ctx, 14, 1 + headDrop, shade, 2, 1)
    // Schnauze, Nasenlöcher, Auge
    px(ctx, 17, 5 + headDrop, '#e58a8a', 3, 3)
    px(ctx, 18, 6 + headDrop, dark)
    px(ctx, 19, 6 + headDrop, dark)
    px(ctx, 16, 4 + headDrop, '#2a1a1a')
    return toTexture(canvas)
  }
  return { walkA: draw(0, 0), walkB: draw(1, 0), sniff: draw(0, 2) }
}
