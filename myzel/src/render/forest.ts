import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { SURFACE_Y, WORLD_W, buildCanopyTexture, buildHillTexture, buildPineTexture, buildPlantTextures, rng } from './sprites.ts'
import type { PinePalette, TrunkStyle } from './sprites.ts'

const MARGIN = 48

interface Layer {
  container: Container
  /** Farbe bei Nacht; die Ebene wird zwischen dieser und Weiß (Tag) getönt. */
  night: number
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)
}

// Ferne Reihe: alles bläulich-dunstig.
const FAR_PINE: PinePalette[] = [
  { light: '#a6cdc4', mid: '#93bdb4', dark: '#7fa8a3' },
  { light: '#9fc4cf', mid: '#8bb2c0', dark: '#779eae' },
]
const FAR_LEAF: PinePalette[] = [
  { light: '#b0d2b4', mid: '#9cc2a4', dark: '#86ab94' },
  { light: '#c9d2b0', mid: '#b4bf9c', dark: '#9aa886' },
]

// Mittlere Reihe: kräftigere, unterschiedliche Grüntöne.
const MID_PINE: PinePalette[] = [
  { light: '#4f9a5a', mid: '#3d7f4c', dark: '#2c6141' },
  { light: '#4a9a82', mid: '#38806b', dark: '#2a6256' },
  { light: '#7aa84a', mid: '#608f3c', dark: '#46702f' },
  { light: '#3b7a52', mid: '#2d6244', dark: '#204a36' },
]
const MID_LEAF: PinePalette[] = [
  { light: '#6fb454', mid: '#4f9a42', dark: '#35732f' },
  { light: '#5fa86a', mid: '#46904f', dark: '#2f6c3a' },
  { light: '#8cc060', mid: '#6ea84a', dark: '#4c8236' },
]
const AUTUMN_LEAF: PinePalette[] = [
  { light: '#e6b04a', mid: '#cf8434', dark: '#a05a28' },
  { light: '#dccb55', mid: '#b8a23f', dark: '#867430' },
]
const BIRCH_LEAF: PinePalette = { light: '#b4dd7c', mid: '#8fc460', dark: '#68a048' }

const OAK_TRUNK: TrunkStyle = { main: '#6b4a2b', dark: '#4a3220' }
const BIRCH_TRUNK: TrunkStyle = { main: '#e9e5d8', dark: '#bdb8a6', mark: '#3a3a3a' }
const FAR_TRUNK: TrunkStyle = { main: '#8aa9a8', dark: '#738f93' }

interface Kind {
  textures: Texture[]
  weight: number
}

/**
 * Wald-Tiefe: Hügel und Tannenreihen hinter dem Spielfeld, Dunst, Lichtstrahlen,
 * Pflanzen im Vordergrund und nachts Glühwürmchen.
 */
export class Forest {
  /** Hinter Spielbäumen und Boden. */
  readonly back = new Container()
  /** Vor Spielbäumen, auf dem Gras. */
  readonly front = new Container()
  /** Über der Nacht-Abdunklung, damit sie leuchten. */
  readonly fireflies = new Container()

  private layers: Layer[] = []
  private rays: Array<{ g: Graphics; phase: number }> = []
  private flies: Array<{ s: Sprite; x: number; y: number; phase: number; speed: number }> = []
  private random = rng(909)
  private time = 0

  constructor(side: number, skyExtra: number) {
    const left = -side - MARGIN
    const span = WORLD_W + 2 * side + 2 * MARGIN
    const addLayer = (night: number): Container => {
      const container = new Container()
      this.layers.push({ container, night })
      this.back.addChild(container)
      return container
    }

    // Ferne Hügel
    const hillsFar = addLayer(0x1a2350)
    const far = new Sprite(buildHillTexture(3, span, 60, 38, 16, '#b7d4e4', '#c9e2ef'))
    far.position.set(left, SURFACE_Y + 8 - 60)
    hillsFar.addChild(far)
    const hillsNear = addLayer(0x1d2a4a)
    const near = new Sprite(buildHillTexture(8, span, 48, 26, 12, '#9cc4b6', '#b0d6c6'))
    near.position.set(left, SURFACE_Y + 8 - 48)
    hillsNear.addChild(near)

    // Ferne Tannenreihe im Dunst
    const farPines = addLayer(0x1f2d4e)
    const farKinds: Kind[] = [
      {
        textures: [0, 1, 2, 3, 4].map((i) => buildPineTexture(30 + i, 11 + (i % 3) * 3, 20 + i * 5, FAR_PINE[i % 2])),
        weight: 6,
      },
      {
        textures: [0, 1, 2].map((i) => buildCanopyTexture(40 + i, 17 + i * 3, 26 + i * 4, FAR_LEAF[i % 2], FAR_TRUNK)),
        weight: 3,
      },
    ]
    this.scatter(farPines, farKinds, left, left + span, 6, 16)

    // Dunstbänder, damit die ferne Reihe weich im Hintergrund liegt
    const haze = addLayer(0x26345c)
    for (let i = 0; i < 6; i++) {
      const band = new Sprite(Texture.WHITE)
      band.tint = 0xe8f6fa
      band.alpha = 0.07 + i * 0.035
      band.position.set(left, SURFACE_Y - 36 + i * 7)
      band.width = span
      band.height = 7
      haze.addChild(band)
    }

    // Mittlere Tannenreihe, kräftigere Farben
    const midPines = addLayer(0x142a40)
    const midKinds: Kind[] = [
      // Tannen in vier Grüntönen und mehreren Größen
      {
        textures: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => buildPineTexture(60 + i, 19 + (i % 4) * 3, 38 + (i % 5) * 7, MID_PINE[i % 4])),
        weight: 8,
      },
      // schlanke, hohe Fichten
      {
        textures: [0, 1].map((i) => buildPineTexture(80 + i, 13 + i * 2, 62 + i * 8, MID_PINE[3])),
        weight: 2,
      },
      // Laubbäume in Grün
      {
        textures: [0, 1, 2, 3, 4].map((i) => buildCanopyTexture(90 + i, 26 + (i % 3) * 5, 44 + (i % 4) * 6, MID_LEAF[i % 3], OAK_TRUNK)),
        weight: 5,
      },
      // einzelne Herbstbäume als Farbtupfer
      {
        textures: [0, 1, 2].map((i) => buildCanopyTexture(100 + i, 26 + i * 4, 46 + i * 5, AUTUMN_LEAF[i % 2], OAK_TRUNK)),
        weight: 1,
      },
      // Birken
      {
        textures: [0, 1, 2].map((i) => buildCanopyTexture(110 + i, 18 + i * 2, 48 + i * 6, BIRCH_LEAF, BIRCH_TRUNK)),
        weight: 2,
      },
    ]
    this.scatter(midPines, midKinds, left, left + span, 12, 30)

    // Lichtstrahlen
    const rayLayer = addLayer(0x000000)
    for (let k = -3; k < 11; k++) {
      const g = new Graphics()
      const w = 18 + this.random() * 26
      const x0 = k * 96 + this.random() * 40
      const top = -skyExtra * 0.6
      g.poly([x0, top, x0 + w, top, x0 + w - 90, SURFACE_Y, x0 - 90, SURFACE_Y]).fill({ color: 0xfff2c0, alpha: 0.09 })
      g.blendMode = 'add'
      rayLayer.addChild(g)
      this.rays.push({ g, phase: this.random() * 6 })
    }

    // Vordergrund: Gras, Farn, Büsche, Blumen
    const plants = buildPlantTextures()
    const frontLayer = new Container()
    this.layers.push({ container: frontLayer, night: 0x1c2748 })
    this.front.addChild(frontLayer)
    let x = left
    while (x < left + span) {
      x += 10 + this.random() * 22
      if (x > 108 && x < 156) continue // Totholz bleibt frei
      const roll = this.random()
      let tex: Texture
      let lift = 4
      if (roll < 0.55) tex = plants.tuft[Math.floor(this.random() * plants.tuft.length)]
      else if (roll < 0.72) tex = plants.fern
      else if (roll < 0.8) { tex = plants.bush; lift = 5 }
      else tex = plants.flowers[Math.floor(this.random() * plants.flowers.length)]
      const sprite = new Sprite(tex)
      sprite.anchor.set(0.5, 1)
      sprite.position.set(Math.round(x), SURFACE_Y + lift)
      frontLayer.addChild(sprite)
    }

    // Glühwürmchen
    for (let i = 0; i < 18; i++) {
      const s = new Sprite(Texture.WHITE)
      s.tint = 0xe8ff9a
      s.width = s.height = 2
      s.blendMode = 'add'
      s.alpha = 0
      this.fireflies.addChild(s)
      this.flies.push({
        s,
        x: -60 + this.random() * (WORLD_W + 120),
        y: SURFACE_Y - 56 + this.random() * 52,
        phase: this.random() * 10,
        speed: 0.3 + this.random() * 0.5,
      })
    }
  }

  update(dtMs: number, light: number): void {
    const dt = dtMs / 1000
    this.time += dt

    for (const layer of this.layers) {
      layer.container.tint = lerpColor(layer.night, 0xffffff, light)
    }

    for (const ray of this.rays) {
      ray.g.alpha = light * light * (0.45 + 0.55 * Math.sin(this.time * 0.35 + ray.phase))
    }

    const dark = (1 - light) * (1 - light)
    for (const f of this.flies) {
      f.s.x = Math.round(f.x + Math.sin(this.time * f.speed + f.phase) * 12)
      f.s.y = Math.round(f.y + Math.cos(this.time * f.speed * 1.4 + f.phase) * 6)
      f.s.alpha = dark * Math.max(0, 0.35 + 0.65 * Math.sin(this.time * 2.2 + f.phase * 3))
    }
  }

  /** Verteilt zufällig gewählte Bäume mit unregelmäßigen Abständen; Füße stehen tief im Boden. */
  private scatter(layer: Container, kinds: Kind[], from: number, to: number, minGap: number, maxGap: number): void {
    const total = kinds.reduce((sum, k) => sum + k.weight, 0)
    let x = from
    while (x < to) {
      // Gelegentlich dicht beieinander, damit Gruppen und Lichtungen entstehen.
      x += this.random() < 0.2 ? 2 + this.random() * 4 : minGap + this.random() * (maxGap - minGap)
      let pick = this.random() * total
      const kind = kinds.find((k) => (pick -= k.weight) < 0) ?? kinds[0]
      const sprite = new Sprite(kind.textures[Math.floor(this.random() * kind.textures.length)])
      sprite.anchor.set(0.5, 1)
      // Der Fuß liegt unter der Grasreihe, die ihn verdeckt: keine Lücke zwischen Stamm und Boden.
      sprite.position.set(Math.round(x), SURFACE_Y + 5 + Math.floor(this.random() * 4))
      if (this.random() < 0.5) sprite.scale.x = -1
      const shade = 218 + Math.floor(this.random() * 38)
      sprite.tint = (shade << 16) | (shade << 8) | shade
      layer.addChild(sprite)
    }
  }
}
