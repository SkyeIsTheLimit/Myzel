import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { SURFACE_Y, WORLD_W, buildBareCanopyTexture, buildCanopyTexture, buildHillTexture, buildMushroomTexture, buildPineTexture, buildPlantTextures, rng } from './sprites.ts'
import type { PinePalette, TrunkStyle } from './sprites.ts'
import type { Season } from '../game/weather.ts'

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
const FAR_AUTUMN: PinePalette[] = [
  { light: '#e3cf9c', mid: '#d4b887', dark: '#bda279' },
  { light: '#dcc3a0', mid: '#cba886', dark: '#b39274' },
]
/** Frühling: Kirschblüte und junges Laub. */
const BLOSSOM: PinePalette[] = [
  { light: '#ffd6e6', mid: '#f4a6c4', dark: '#d9789f' },
  { light: '#fff0f4', mid: '#f6c8d8', dark: '#d9a0b8' },
]
const FRESH: PinePalette[] = [
  { light: '#b4e86a', mid: '#8cd04a', dark: '#5ea638' },
  { light: '#c8f080', mid: '#a0da58', dark: '#74b440' },
]
const FAR_SPRING: PinePalette[] = [
  { light: '#f2d6e2', mid: '#e4bfd0', dark: '#cca5b8' },
  { light: '#cfe6b0', mid: '#bcd69c', dark: '#a4be88' },
]
/** Sommer: sattes, tiefes Grün. */
const SUMMER_LEAF: PinePalette[] = [
  { light: '#58bc4a', mid: '#37a03c', dark: '#1f7a2e' },
  { light: '#4cb460', mid: '#2e9a4c', dark: '#1d7a38' },
  { light: '#72c64c', mid: '#52ac3c', dark: '#348630' },
]
const BIRCH_SUMMER: PinePalette = { light: '#8ede58', mid: '#66c442', dark: '#449e34' }
const BIRCH_SPRING: PinePalette = { light: '#cdf08c', mid: '#aadf66', dark: '#82bb4c' }
const BIRCH_AUTUMN: PinePalette = { light: '#f3de80', mid: '#dcbc4e', dark: '#b4923a' }
/** Tannen im Winter: bereift. */
const SNOW_PINE: PinePalette = { light: '#e4f0ea', mid: '#b9d2c8', dark: '#8aa89f' }
const BIRCH_LEAF: PinePalette = { light: '#b4dd7c', mid: '#8fc460', dark: '#68a048' }

const OAK_TRUNK: TrunkStyle = { main: '#6b4a2b', dark: '#4a3220' }
const BIRCH_TRUNK: TrunkStyle = { main: '#e9e5d8', dark: '#bdb8a6', mark: '#3a3a3a' }
const FAR_TRUNK: TrunkStyle = { main: '#8aa9a8', dark: '#738f93' }

interface Kind {
  textures: Texture[]
  weight: number
  /** Gleich viele Bilder wie `textures`; werden in der jeweiligen Jahreszeit statt der normalen gezeigt. */
  autumn?: Texture[]
  winter?: Texture[]
  spring?: Texture[]
  summer?: Texture[]
}

interface SeasonalTree {
  sprite: Sprite
  base: Texture
  autumn?: Texture
  winter?: Texture
  spring?: Texture
  summer?: Texture
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
  private seasonal: SeasonalTree[] = []
  /** Zusätzliche Blumen auf dem Gras, nur im Frühling sichtbar. */
  private springFlowers = new Container()
  /** Pilze im Gras, nur im Herbst sichtbar. */
  private autumnMushrooms = new Container()
  private leafBoost = 1
  /** Baumkronen, aus denen im Herbst Laub fällt: Mitte und Breite der Krone. */
  private crowns: Array<{ x: number; y: number; w: number }> = []
  private rays: Array<{ g: Graphics; phase: number }> = []
  private flies: Array<{ s: Sprite; x: number; y: number; phase: number; speed: number }> = []
  private random = rng(909)
  private time = 0
  private leafLayer = new Container()
  private leaves: Array<{ s: Sprite; vx: number; vy: number; phase: number; landY: number; fade: number }> = []
  private autumn = 0
  private rayBoost = 1
  private burstTime = 0
  private leafAccum = 0

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
        winter: [0, 1, 2, 3, 4].map((i) => buildPineTexture(30 + i, 11 + (i % 3) * 3, 20 + i * 5, SNOW_PINE)),
        weight: 6,
      },
      {
        textures: [0, 1, 2].map((i) => buildCanopyTexture(40 + i, 17 + i * 3, 26 + i * 4, FAR_LEAF[i % 2], FAR_TRUNK)),
        autumn: [0, 1, 2].map((i) => buildCanopyTexture(40 + i, 17 + i * 3, 26 + i * 4, FAR_AUTUMN[i % 2], FAR_TRUNK)),
        winter: [0, 1, 2].map((i) => buildBareCanopyTexture(40 + i, 17 + i * 3, 26 + i * 4, FAR_TRUNK)),
        spring: [0, 1, 2].map((i) => buildCanopyTexture(40 + i, 17 + i * 3, 26 + i * 4, FAR_SPRING[i % 2], FAR_TRUNK)),
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
        winter: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => buildPineTexture(60 + i, 19 + (i % 4) * 3, 38 + (i % 5) * 7, SNOW_PINE)),
        weight: 8,
      },
      // schlanke, hohe Fichten
      {
        textures: [0, 1].map((i) => buildPineTexture(80 + i, 13 + i * 2, 62 + i * 8, MID_PINE[3])),
        winter: [0, 1].map((i) => buildPineTexture(80 + i, 13 + i * 2, 62 + i * 8, SNOW_PINE)),
        weight: 2,
      },
      // Laubbäume in Grün
      {
        textures: [0, 1, 2, 3, 4].map((i) => buildCanopyTexture(90 + i, 26 + (i % 3) * 5, 44 + (i % 4) * 6, MID_LEAF[i % 3], OAK_TRUNK)),
        autumn: [0, 1, 2, 3, 4].map((i) => buildCanopyTexture(90 + i, 26 + (i % 3) * 5, 44 + (i % 4) * 6, AUTUMN_LEAF[i % 2], OAK_TRUNK)),
        winter: [0, 1, 2, 3, 4].map((i) => buildBareCanopyTexture(90 + i, 26 + (i % 3) * 5, 44 + (i % 4) * 6, OAK_TRUNK)),
        // Abwechselnd rosa Blüte und frisches Hellgrün.
        spring: [0, 1, 2, 3, 4].map((i) =>
          buildCanopyTexture(90 + i, 26 + (i % 3) * 5, 44 + (i % 4) * 6, i % 2 === 0 ? BLOSSOM[(i >> 1) % 2] : FRESH[(i >> 1) % 2], OAK_TRUNK),
        ),
        summer: [0, 1, 2, 3, 4].map((i) => buildCanopyTexture(90 + i, 26 + (i % 3) * 5, 44 + (i % 4) * 6, SUMMER_LEAF[i % 3], OAK_TRUNK)),
        weight: 5,
      },
      // einzelne Herbstbäume als Farbtupfer
      {
        textures: [0, 1, 2].map((i) => buildCanopyTexture(100 + i, 26 + i * 4, 46 + i * 5, AUTUMN_LEAF[i % 2], OAK_TRUNK)),
        winter: [0, 1, 2].map((i) => buildBareCanopyTexture(100 + i, 26 + i * 4, 46 + i * 5, OAK_TRUNK)),
        spring: [0, 1, 2].map((i) => buildCanopyTexture(100 + i, 26 + i * 4, 46 + i * 5, BLOSSOM[i % 2], OAK_TRUNK)),
        summer: [0, 1, 2].map((i) => buildCanopyTexture(100 + i, 26 + i * 4, 46 + i * 5, SUMMER_LEAF[i % 3], OAK_TRUNK)),
        weight: 1,
      },
      // Birken
      {
        textures: [0, 1, 2].map((i) => buildCanopyTexture(110 + i, 18 + i * 2, 48 + i * 6, BIRCH_LEAF, BIRCH_TRUNK)),
        autumn: [0, 1, 2].map((i) => buildCanopyTexture(110 + i, 18 + i * 2, 48 + i * 6, BIRCH_AUTUMN, BIRCH_TRUNK)),
        winter: [0, 1, 2].map((i) => buildBareCanopyTexture(110 + i, 18 + i * 2, 48 + i * 6, BIRCH_TRUNK)),
        spring: [0, 1, 2].map((i) => buildCanopyTexture(110 + i, 18 + i * 2, 48 + i * 6, BIRCH_SPRING, BIRCH_TRUNK)),
        summer: [0, 1, 2].map((i) => buildCanopyTexture(110 + i, 18 + i * 2, 48 + i * 6, BIRCH_SUMMER, BIRCH_TRUNK)),
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

    // Frühlingsblumen: dichte, bunte Tupfer zwischen dem übrigen Bewuchs.
    this.springFlowers.visible = false
    frontLayer.addChild(this.springFlowers)
    for (let fx = left; fx < left + span; fx += 3 + this.random() * 7) {
      if (fx > 108 && fx < 156) continue
      const flower = new Sprite(plants.flowers[Math.floor(this.random() * plants.flowers.length)])
      flower.anchor.set(0.5, 1)
      flower.position.set(Math.round(fx), SURFACE_Y + 3 + Math.floor(this.random() * 4))
      if (this.random() < 0.5) flower.scale.x = -1
      this.springFlowers.addChild(flower)
    }

    // Herbstpilze: Rote und braune Pilze in kleinen Gruppen.
    this.autumnMushrooms.visible = false
    frontLayer.addChild(this.autumnMushrooms)
    const mushroom = buildMushroomTexture()
    for (let mx = left; mx < left + span; mx += 14 + this.random() * 30) {
      if (mx > 108 && mx < 156) continue
      const group = 1 + Math.floor(this.random() * 3)
      for (let k = 0; k < group; k++) {
        const m = new Sprite(mushroom)
        m.anchor.set(0.5, 1)
        const size = 0.4 + this.random() * 0.35
        m.scale.set(size * (this.random() < 0.5 ? -1 : 1), size)
        m.tint = [0xffffff, 0xffd8a8, 0xe8c090, 0xf0a090][Math.floor(this.random() * 4)]
        m.position.set(Math.round(mx + k * 5 + this.random() * 3), SURFACE_Y + 4 + Math.floor(this.random() * 3))
        this.autumnMushrooms.addChild(m)
      }
    }

    this.front.addChild(this.leafLayer)

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

  /** Tauscht die Hintergrundbäume gegen ihre Herbst- oder Winterbilder (Tannen bekommen im Winter Frost). */
  setSeason(season: Season | null): void {
    for (const t of this.seasonal) {
      const tex = season === 'autumn' ? t.autumn : season === 'winter' ? t.winter : season === 'spring' ? t.spring : season === 'summer' ? t.summer : undefined
      t.sprite.texture = tex ?? t.base
    }
    this.autumnMushrooms.visible = season === 'autumn'
    this.leafBoost = season === 'autumn' ? 2.2 : 1
    this.springFlowers.visible = season === 'spring' || season === 'summer'
    // Im Sommer blühen die Blumen gelb und weiß, im Frühling bunt.
    this.springFlowers.tint = season === 'summer' ? 0xfff0a8 : 0xffffff
    this.rayBoost = season === 'summer' ? 1.5 : 1
  }

  /** Herbst-Fortschritt 0 bis 1; ab etwa 0.3 fallen vereinzelt Blätter. */
  setAutumn(progress: number): void {
    this.autumn = Math.max(0, Math.min(1, progress))
  }

  /** Kurzer, dichter Blätterregen. */
  leafBurst(): void {
    this.burstTime = 5
  }

  /** Meldet eine Baumkrone, aus der Laub fallen kann (Mittelpunkt und Breite in Weltpixeln). */
  addCrown(x: number, y: number, w: number): void {
    this.crowns.push({ x, y, w })
  }

  private spawnLeaf(burst: boolean): void {
    if (this.leaves.length >= 240) return
    const s = new Sprite(Texture.WHITE)
    s.tint = [0xe08a2f, 0xf2c14e, 0xb8561f, 0xd9602a, 0xc9a23a][Math.floor(this.random() * 5)]
    s.width = this.random() < 0.5 ? 3 : 2
    s.height = 2
    if (burst || this.crowns.length === 0) {
      // Der Blätterregen beim Laubfall kommt von oben über die ganze Breite.
      s.position.set(-60 + this.random() * (WORLD_W + 120), (burst ? -120 : -40) + this.random() * (burst ? 80 : 50))
    } else {
      // Sonst löst sich das Laub aus den Kronen.
      const c = this.crowns[Math.floor(this.random() * this.crowns.length)]
      s.position.set(c.x + (this.random() - 0.5) * c.w, c.y + (this.random() - 0.3) * 10)
    }
    this.leafLayer.addChild(s)
    this.leaves.push({
      s,
      vx: (this.random() - 0.5) * 8,
      vy: 14 + this.random() * 14,
      phase: this.random() * 6,
      landY: SURFACE_Y + 3 + this.random() * 4,
      fade: 1.2,
    })
  }

  private updateLeaves(dt: number): void {
    const ambient = this.autumn > 0.3 ? Math.pow((this.autumn - 0.3) / 0.7, 2) * 3 : 0
    this.burstTime = Math.max(0, this.burstTime - dt)
    this.leafAccum += dt * (ambient * this.leafBoost + (this.burstTime > 0 ? 45 : 0))
    while (this.leafAccum >= 1) {
      this.leafAccum -= 1
      this.spawnLeaf(this.burstTime > 0)
    }
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const leaf = this.leaves[i]
      if (leaf.s.y < leaf.landY) {
        leaf.s.x += (leaf.vx + Math.sin(this.time * 1.6 + leaf.phase) * 12) * dt
        leaf.s.y += leaf.vy * dt
      } else {
        // Liegt auf dem Boden und verblasst langsam.
        leaf.fade -= dt
        leaf.s.alpha = Math.max(0, leaf.fade / 1.2)
        if (leaf.fade <= 0) {
          leaf.s.destroy()
          this.leaves.splice(i, 1)
          continue
        }
      }
      leaf.s.position.set(Math.round(leaf.s.x), Math.round(leaf.s.y))
    }
  }

  update(dtMs: number, light: number): void {
    const dt = dtMs / 1000
    this.time += dt
    this.updateLeaves(dt)
    this.leafLayer.tint = lerpColor(0x3a4468, 0xffffff, light)

    for (const layer of this.layers) {
      layer.container.tint = lerpColor(layer.night, 0xffffff, light)
    }

    for (const ray of this.rays) {
      ray.g.alpha = Math.min(1, light * light * (0.45 + 0.55 * Math.sin(this.time * 0.35 + ray.phase)) * this.rayBoost)
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
      const index = Math.floor(this.random() * kind.textures.length)
      const sprite = new Sprite(kind.textures[index])
      if (kind.autumn || kind.winter || kind.spring || kind.summer) {
        this.seasonal.push({ sprite, base: kind.textures[index], autumn: kind.autumn?.[index], winter: kind.winter?.[index], spring: kind.spring?.[index], summer: kind.summer?.[index] })
      }
      sprite.anchor.set(0.5, 1)
      // Der Fuß liegt unter der Grasreihe, die ihn verdeckt: keine Lücke zwischen Stamm und Boden.
      sprite.position.set(Math.round(x), SURFACE_Y + 5 + Math.floor(this.random() * 4))
      if (this.random() < 0.5) sprite.scale.x = -1
      // Laubbäume (Kinder mit Frühlingsbild) verlieren im Herbst Blätter aus der Krone.
      if (kind.spring) {
        const tex = kind.textures[index]
        this.addCrown(sprite.x, sprite.y - tex.height * 0.68, tex.width * 0.6)
      }
      const shade = 218 + Math.floor(this.random() * 38)
      sprite.tint = (shade << 16) | (shade << 8) | shade
      layer.addChild(sprite)
    }
  }
}
