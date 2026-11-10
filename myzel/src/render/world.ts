import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import type { Application, FederatedPointerEvent } from 'pixi.js'
import { TREE_COLS } from '../game/grid.ts'
import { Forest } from './forest.ts'
import { TruffleLayer } from './truffles.ts'
import { WeatherLayer } from './weather.ts'
import { GRID_TOP } from './grid.ts'
import { generateHyphae, generateRoots, rootThickness } from './hyphae.ts'
import type { HyphaPoint } from './hyphae.ts'
import type { Season } from '../game/weather.ts'
import {
  COLORS,
  SURFACE_Y,
  TILE,
  WORLD_H,
  WORLD_W,
  buildCloudTexture,
  buildLogTexture,
  buildMoonTexture,
  buildMushroomTexture,
  buildSoilTextures,
  buildSunTexture,
  AUTUMN_TREE,
  BLOSSOM_TREE,
  SUMMER_TREE,
  FRESH_TREE,
  buildBareTreeTexture,
  buildTreeTexture,
  makeCanvas,
  rng,
  toTexture,
} from './sprites.ts'

/** Wie weit die Welt über das 384×216-Spielfeld hinausreicht (in Weltpixeln). */
const SIDE = 384
const SKY_EXTRA = 400
const DEPTH_EXTRA = 400

const DAY_LENGTH = 300
const HYPHA_COUNT = 1300
const TREE_X = TREE_COLS.map((c) => c * TILE + TILE / 2)
const MUSHROOM_X = [10, 88, 166, 236, 268, 350, 368]
const HYPHA_TOP = SURFACE_Y + 12

/** Um Mitternacht (Tagesphase 0,75) wechselt die Jahreszeit; der schwarze Schleier blendet ein, hält kurz und blendet aus. */
const MIDNIGHT = 0.75
const VEIL_FADE = 1.1
const VEIL_HOLD = 0.5

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)
}

function pixelSprite(color = 0xffffff): Sprite {
  const s = new Sprite(Texture.WHITE)
  s.tint = color
  return s
}

interface Flow {
  sprite: Sprite
  index: number
  timer: number
}

interface Spore {
  sprite: Sprite
  vx: number
  vy: number
  life: number
  max: number
  phase: number
}

export class World {
  readonly stage = new Container()
  /** Hier hängt die Gitter-Ansicht; liegt über dem Myzel, unter Partikeln. */
  readonly gridLayer = new Container()
  /** Findbare Trüffel und Trüffelschweine. */
  readonly truffles = new TruffleLayer()
  onLogClick: (x: number, y: number) => void = () => {}

  private random = rng(1234)
  private time = DAY_LENGTH * 0.12
  private skyBands: Sprite[] = []
  private stars: Sprite[] = []
  private moonHalo = new Graphics()
  private ground = new Container()
  /** Baumwurzeln im Boden; bekommen nachts dieselbe Farbe wie die Bäume darüber. */
  private rootSprite = new Sprite()
  private clouds: Array<{ sprite: Sprite; speed: number }> = []
  private body = new Sprite()
  private sunTex = buildSunTexture()
  private moonTex = buildMoonTexture()
  private nightOverlay = pixelSprite(COLORS.nightTint)
  private log: Sprite
  private logBounce = 0
  private mushrooms: Sprite[] = []
  private forest = new Forest(SIDE, SKY_EXTRA)
  /** Herbst-Gegenstücke der Bäume; werden je nach Fortschritt eingeblendet. */
  private autumnTrees: Array<{ sprite: Sprite; start: number; green: Sprite; bare: Sprite; spring: Sprite; summer: Sprite }> = []
  private seasonSet = false
  private pendingSeason: Season | null = null
  private targetSeason: Season | null = null
  private prevPhase = 0.12
  private veilTime = 0
  private veil = pixelSprite(0x000000)
  private season: Season | null = null
  private autumnProgress = 0

  private points: HyphaPoint[]
  private revealed = 0
  private coreCtx: CanvasRenderingContext2D
  private glowCtx: CanvasRenderingContext2D
  private coreTex: Texture
  private glowTex: Texture
  private glowSprite: Sprite
  private flows: Flow[] = []
  private flowLayer = new Container()
  readonly weatherLayer = new WeatherLayer()
  private webLayer = new Graphics()
  private webLinks = 0
  private spores: Spore[] = []
  private sporeLayer = new Container()
  private sporeAccum = 0
  private totalBuildings = 0

  constructor(_app: Application) {
    // Himmel
    for (let i = 0; i < 5; i++) {
      const band = pixelSprite(COLORS.skyDay[i])
      band.x = -SIDE
      band.width = WORLD_W + 2 * SIDE
      // Das oberste Band reicht weit nach oben, damit hohe Fenster keinen Rand zeigen.
      band.height = i === 0 ? 19 + SKY_EXTRA : 19
      band.y = i === 0 ? -SKY_EXTRA : i * 19
      this.skyBands.push(band)
      this.stage.addChild(band)
    }
    for (let i = 0; i < 170; i++) {
      const star = pixelSprite()
      const big = this.random() < 0.2
      star.width = star.height = big ? 2 : 1
      star.x = Math.floor(this.random() * (WORLD_W + 2 * SIDE)) - SIDE
      star.y = Math.floor(this.random() * (SURFACE_Y - 24 + SKY_EXTRA)) - SKY_EXTRA
      star.alpha = 0
      this.stars.push(star)
      this.stage.addChild(star)
    }
    // Mondschein: weiche Ringe hinter dem Mond, nur nachts sichtbar.
    for (const [r, a] of [[26, 0.05], [19, 0.07], [13, 0.1], [9, 0.14]] as Array<[number, number]>) {
      this.moonHalo.circle(0, 0, r).fill({ color: 0xcfd8ff, alpha: a })
    }
    this.moonHalo.alpha = 0
    this.stage.addChild(this.moonHalo)
    this.body.anchor.set(0.5)
    this.stage.addChild(this.body)
    for (let i = 0; i < 9; i++) {
      const cloud = new Sprite(buildCloudTexture(i * 7 + 3))
      cloud.x = this.random() * (WORLD_W + 2 * SIDE) - SIDE
      cloud.y = -SKY_EXTRA * 0.6 + Math.floor(this.random() * (50 + SKY_EXTRA * 0.6))
      this.clouds.push({ sprite: cloud, speed: 3 + this.random() * 4 })
      this.stage.addChild(cloud)
    }

    // Wald-Hintergrund: Hügel, Tannenreihen, Dunst, Lichtstrahlen
    this.stage.addChild(this.forest.back)

    // Boden
    const soil = buildSoilTextures()
    const layers: Texture[][] = [soil.grass, soil.humus, soil.humus, soil.dirt, soil.dirt, soil.clay, soil.stone, soil.stone]
    const ground = new Container()
    // Unterhalb des Spielfelds geht es mit Tiefengestein weiter, seitlich setzt sich der Wald fort.
    for (let i = 0; i < DEPTH_EXTRA / TILE; i++) layers.push(i < 3 ? soil.stone : i < 9 ? soil.deep : soil.bedrock)
    const cols = WORLD_W / TILE
    layers.forEach((variants, row) => {
      for (let col = -SIDE / TILE; col < cols + SIDE / TILE; col++) {
        const tile = new Sprite(variants[Math.floor(this.random() * variants.length)])
        tile.x = col * TILE
        tile.y = SURFACE_Y + row * TILE
        ground.addChild(tile)
      }
    })
    this.stage.addChild(ground)
    this.ground = ground

    // Außerhalb des Spielfelds ist der Boden unerreichbar und wird abgedunkelt.
    const shade = new Graphics()
    const shadeTop = SURFACE_Y + TILE
    const shadeColor = { color: 0x0a0604, alpha: 0.6 }
    shade.rect(-SIDE, shadeTop, SIDE, WORLD_H - shadeTop + DEPTH_EXTRA).fill(shadeColor)
    shade.rect(WORLD_W, shadeTop, SIDE, WORLD_H - shadeTop + DEPTH_EXTRA).fill(shadeColor)
    shade.rect(0, WORLD_H, WORLD_W, DEPTH_EXTRA).fill(shadeColor)
    this.stage.addChild(shade)

    // Baumwurzeln: verbreiterter Stammfuß, von dem aus sich Wurzeln fächerförmig nach unten verzweigen.
    const rootTop = SURFACE_Y + 6
    const roots = generateRoots(7, TREE_X, rootTop, WORLD_W, WORLD_H)
    const rootLayer = makeCanvas(WORLD_W, WORLD_H)
    const rc = rootLayer.ctx
    for (const x of TREE_X) {
      for (let dy = 0; dy < 10; dy++) {
        const half = 4 + Math.floor(dy / 3)
        rc.fillStyle = '#7a5634'
        rc.fillRect(x - half, rootTop - 2 + dy, half * 2, 1)
        rc.fillStyle = '#9c7448'
        rc.fillRect(x - half, rootTop - 2 + dy, 2, 1)
        rc.fillStyle = '#5a3e24'
        rc.fillRect(x + half - 2, rootTop - 2 + dy, 2, 1)
      }
    }
    for (const p of roots) {
      const t = rootThickness(p.y - rootTop, p.gen)
      rc.fillStyle = p.gen === 0 ? '#7a5634' : '#6a4a2c'
      rc.fillRect(p.x - Math.floor(t / 2), p.y, t, 1)
      rc.fillStyle = '#9c7448'
      if (t > 1) rc.fillRect(p.x - Math.floor(t / 2), p.y, 1, 1)
      rc.fillStyle = '#5a3e24'
      if (t > 2) rc.fillRect(p.x + Math.floor(t / 2), p.y, 1, 1)
    }
    this.rootSprite = new Sprite(toTexture(rootLayer.canvas))
    this.stage.addChild(this.rootSprite)

    // Bäume, Totholz, Pilze
    // Baumreihe über die ganze Breite: die drei Spielbäume plus Deko-Bäume im gleichen Abstand.
    const treeTextures = [0, 1, 2].map((i) => buildTreeTexture(10 + i * 5))
    const autumnTextures = [0, 1, 2].map((i) => buildTreeTexture(10 + i * 5, AUTUMN_TREE))
    const bareTextures = [0, 1, 2].map((i) => buildBareTreeTexture(30 + i * 7))
    const springTextures = [0, 1, 2].map((i) => buildTreeTexture(10 + i * 5, BLOSSOM_TREE))
    const freshTextures = [0, 1, 2].map((i) => buildTreeTexture(10 + i * 5, FRESH_TREE))
    const summerTextures = [0, 1, 2].map((i) => buildTreeTexture(10 + i * 5, SUMMER_TREE))
    const autumnRandom = rng(777)
    const spacing = TREE_X[1] - TREE_X[0]
    const extra = Math.ceil(SIDE / spacing)
    for (let k = -extra; k < TREE_X.length + extra; k++) {
      const tree = new Sprite(treeTextures[((k % 3) + 3) % 3])
      tree.anchor.set(0.5, 1)
      tree.x = TREE_X[0] + k * spacing
      tree.y = SURFACE_Y + 4
      this.stage.addChild(tree)

      const autumn = new Sprite(autumnTextures[((k % 3) + 3) % 3])
      autumn.anchor.set(0.5, 1)
      autumn.position.copyFrom(tree.position)
      autumn.alpha = 0
      this.stage.addChild(autumn)
      // Nicht alle Bäume färben sich gleichzeitig.
      const bare = new Sprite(bareTextures[((k % 3) + 3) % 3])
      bare.anchor.set(0.5, 1)
      bare.position.copyFrom(tree.position)
      bare.alpha = 0
      this.stage.addChild(bare)
      // Im Frühling blüht ein Teil der Bäume rosa, der Rest trägt junges Hellgrün.
      const spring = new Sprite(k % 2 === 0 ? springTextures[((k % 3) + 3) % 3] : freshTextures[((k % 3) + 3) % 3])
      spring.anchor.set(0.5, 1)
      spring.position.copyFrom(tree.position)
      spring.visible = false
      this.stage.addChild(spring)
      const summer = new Sprite(summerTextures[((k % 3) + 3) % 3])
      summer.anchor.set(0.5, 1)
      summer.position.copyFrom(tree.position)
      summer.visible = false
      this.stage.addChild(summer)
      this.autumnTrees.push({ sprite: autumn, start: autumnRandom() * 0.55, green: tree, bare, spring, summer })
    }

    this.log = new Sprite(buildLogTexture())
    this.log.anchor.set(0.5, 1)
    this.log.x = 132
    this.log.y = SURFACE_Y + 4
    this.log.eventMode = 'static'
    this.log.cursor = 'pointer'
    this.log.on('pointerdown', (e: FederatedPointerEvent) => {
      this.logBounce = 1
      this.onLogClick(e.global.x, e.global.y)
    })
    this.log.on('pointerover', () => { this.log.tint = 0xfff0d0 })
    this.log.on('pointerout', () => { this.log.tint = 0xffffff })
    this.stage.addChild(this.log)

    const mushTex = buildMushroomTexture()
    for (const x of MUSHROOM_X) {
      const m = new Sprite(mushTex)
      m.anchor.set(0.5, 1)
      m.x = x
      m.y = SURFACE_Y + 3
      m.visible = false
      this.mushrooms.push(m)
      this.stage.addChild(m)
    }

    // Pflanzen im Vordergrund liegen vor Stämmen und Pilzen.
    this.stage.addChild(this.forest.front)
    this.stage.addChild(this.truffles.pigLayer)

    // Nacht-Abdunklung liegt über Welt, aber unter dem leuchtenden Myzel.
    this.nightOverlay.position.set(-SIDE, -SKY_EXTRA)
    this.nightOverlay.width = WORLD_W + 2 * SIDE
    this.nightOverlay.height = WORLD_H + SKY_EXTRA + DEPTH_EXTRA
    this.nightOverlay.alpha = 0
    this.stage.addChild(this.nightOverlay)
    this.stage.addChild(this.forest.fireflies)
    this.stage.addChild(this.weatherLayer.container)

    // Myzel
    this.points = generateHyphae(42, TREE_X, HYPHA_TOP, WORLD_W, WORLD_H, HYPHA_COUNT)
    const glow = makeCanvas(WORLD_W, WORLD_H)
    const core = makeCanvas(WORLD_W, WORLD_H)
    this.glowCtx = glow.ctx
    this.coreCtx = core.ctx
    this.glowTex = toTexture(glow.canvas)
    this.coreTex = toTexture(core.canvas)
    this.glowSprite = new Sprite(this.glowTex)
    this.glowSprite.blendMode = 'add'
    this.stage.addChild(this.glowSprite, new Sprite(this.coreTex), this.webLayer, this.gridLayer, this.truffles.container, this.flowLayer, this.sporeLayer)
    // Der schwarze Schleier liegt über allem (auch über Boden und Myzel) und deckt die ganze Welt.
    this.veil.position.set(-SIDE, -SKY_EXTRA)
    this.veil.width = WORLD_W + 2 * SIDE
    this.veil.height = WORLD_H + SKY_EXTRA + DEPTH_EXTRA
    this.veil.alpha = 0
    this.stage.addChild(this.veil)
    this.reveal(6)
  }

  /** Zentriert das Spielfeld im sichtbaren Bereich; der Rest zeigt Himmel, Wald und tiefen Boden. */
  setViewport(width: number, height: number): void {
    this.stage.position.set(Math.floor((width - WORLD_W) / 2), Math.floor((height - WORLD_H) / 2))
  }

  /** Herbst-Fortschritt 0 bis 1: Bäume färben sich um, Blätter fallen. */
  setAutumn(progress: number): void {
    this.autumnProgress = progress
    this.applySeasonTrees()
  }

  /**
   * Gewünschte Jahreszeit. Der erste Aufruf (oder `instant`) gilt sofort. Danach wird der Wechsel vorgemerkt und
   * um Mitternacht vollzogen: Alles wird kurz schwarz, dahinter tauschen die Bäume, dann wird es wieder hell.
   */
  setSeason(season: Season | null, instant = false): void {
    if (!this.seasonSet || instant) {
      this.seasonSet = true
      this.targetSeason = season
      this.pendingSeason = null
      this.veilTime = 0
      this.veil.alpha = 0
      this.applySeason(season)
      this.onSeasonApplied(season)
      return
    }
    this.targetSeason = season
  }

  /** Wird aufgerufen, sobald eine neue Jahreszeit tatsächlich sichtbar gilt. */
  onSeasonApplied: (season: Season | null) => void = () => {}

  /** Setzt die Jahreszeit sofort (Bäume, Hintergrund, Tönung). */
  private applySeason(season: Season | null): void {
    this.season = season
    this.forest.setSeason(season)
    this.weatherLayer.setSeason(season)
    this.applySeasonTrees()
  }

  /** Startet den Wechsel, wenn die Mitternacht überschritten wurde und eine andere Jahreszeit ansteht. */
  private checkMidnight(prev: number, now: number): void {
    const crossed = prev < MIDNIGHT && now >= MIDNIGHT
    if (crossed && this.pendingSeason === null && this.veilTime === 0 && this.targetSeason !== this.season) {
      this.pendingSeason = this.targetSeason
      this.veilTime = 0.0001
    }
  }

  private updateSeasonVeil(dt: number): void {
    if (this.veilTime === 0) return
    this.veilTime += dt
    const t = this.veilTime
    if (this.pendingSeason !== null && t >= VEIL_FADE + VEIL_HOLD / 2) {
      const next = this.pendingSeason
      this.pendingSeason = null
      this.applySeason(next)
      this.onSeasonApplied(next)
    }
    if (t < VEIL_FADE) this.veil.alpha = t / VEIL_FADE
    else if (t < VEIL_FADE + VEIL_HOLD) this.veil.alpha = 1
    else this.veil.alpha = Math.max(0, 1 - (t - VEIL_FADE - VEIL_HOLD) / VEIL_FADE)
    if (t >= 2 * VEIL_FADE + VEIL_HOLD) {
      this.veil.alpha = 0
      this.veilTime = 0
    }
  }

  private applySeasonTrees(): void {
    const winter = this.season === 'winter'
    const progress = this.season === 'autumn' ? 1 : winter ? 0 : this.autumnProgress
    for (const t of this.autumnTrees) {
      t.sprite.alpha = Math.max(0, Math.min(1, (progress - t.start) / 0.45))
      t.green.visible = !winter && this.season !== 'spring' && this.season !== 'summer'
      t.summer.visible = this.season === 'summer'
      t.spring.visible = this.season === 'spring'
      t.bare.alpha = winter ? 1 : 0
      if (winter) t.sprite.alpha = 0
    }
    this.forest.setAutumn(progress)
  }

  /** Wood Wide Web: wie viele der Verbindungen zwischen den drei Bäumen leuchten (0 bis 2). */
  setWebLinks(count: number): void {
    this.webLinks = Math.max(0, Math.min(TREE_X.length - 1, count))
    if (this.webLinks === 0) this.webLayer.clear()
  }

  private drawWeb(): void {
    if (this.webLinks === 0) return
    const g = this.webLayer
    g.clear()
    const y = GRID_TOP + 3
    for (let l = 0; l < this.webLinks; l++) {
      const x0 = TREE_X[l]
      const x1 = TREE_X[l + 1]
      for (let x = x0, i = 0; x < x1; x += 3, i++) {
        const wave = 0.5 + 0.5 * Math.sin(this.time * 3 - i * 0.35)
        const wob = Math.round(Math.sin(i * 0.5 + this.time) * 1)
        g.rect(Math.round(x), y + wob, 2, 1).fill({ color: 0x7fe0a8, alpha: 0.25 + 0.6 * wave })
      }
    }
  }

  /** Blätterregen beim Einläuten des Herbstes. */
  leafBurst(): void {
    this.forest.leafBurst()
  }

  /** Springt zu einer Tageszeit in [0, 1): 0 Sonnenaufgang, 0.25 Mittag, 0.5 Sonnenuntergang, 0.75 Mitternacht. */
  setDayPhase(phase: number): void {
    this.time = phase * DAY_LENGTH
  }

  /** Wie viele Gebäude insgesamt stehen; steuert Wachstum, Pilze und Partikel. */
  setGrowth(totalBuildings: number): void {
    this.totalBuildings = totalBuildings
    const target = totalBuildings === 0 ? 6 : Math.max(6, Math.floor(HYPHA_COUNT * (1 - Math.exp(-totalBuildings / 70))))
    this.reveal(target)
    const mushrooms = Math.min(MUSHROOM_X.length, Math.floor(totalBuildings / 6))
    this.mushrooms.forEach((m, i) => { m.visible = i < mushrooms })
    const wantedFlows = Math.min(30, 2 + Math.floor(totalBuildings / 3))
    while (this.flows.length < wantedFlows) this.addFlow()
    while (this.flows.length > wantedFlows) this.flows.pop()?.sprite.destroy()
  }

  private reveal(target: number): void {
    const count = Math.min(target, this.points.length)
    if (count < this.revealed) {
      this.coreCtx.clearRect(0, 0, WORLD_W, WORLD_H)
      this.glowCtx.clearRect(0, 0, WORLD_W, WORLD_H)
      this.revealed = 0
    }
    for (let i = this.revealed; i < count; i++) {
      const p = this.points[i]
      // Dick nur am Ansatz der Haupttriebe, sonst entstehen helle Klumpen.
      const thick = p.gen === 0 && p.y - HYPHA_TOP < 8
      this.glowCtx.fillStyle = COLORS.mycelGlow
      this.glowCtx.fillRect(p.x - 1, p.y - 1, 3, 3)
      this.coreCtx.fillStyle = p.gen === 0 ? COLORS.mycelCore : p.gen === 1 ? '#e2efc4' : '#c4e8b8'
      this.coreCtx.fillRect(p.x, p.y, thick ? 2 : 1, thick ? 2 : 1)
    }
    if (count !== this.revealed) {
      this.revealed = count
      this.coreTex.source.update()
      this.glowTex.source.update()
    }
  }

  private addFlow(): void {
    const sprite = pixelSprite(0xffffff)
    sprite.width = sprite.height = 1
    this.flowLayer.addChild(sprite)
    this.flows.push({ sprite, index: Math.floor(this.random() * this.revealed), timer: this.random() * 40 })
  }

  private spawnSpore(): void {
    if (this.spores.length >= 60) return
    const visible = this.mushrooms.filter((m) => m.visible)
    if (visible.length === 0) return
    const m = visible[Math.floor(this.random() * visible.length)]
    const sprite = pixelSprite(0xf6f0b8)
    sprite.width = sprite.height = 1
    sprite.x = m.x + (this.random() - 0.5) * 6
    sprite.y = m.y - 12
    this.sporeLayer.addChild(sprite)
    const max = 3 + this.random() * 3
    this.spores.push({ sprite, vx: (this.random() - 0.5) * 6, vy: -(6 + this.random() * 8), life: max, max, phase: this.random() * 6 })
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000
    this.time += dt
    const phase = (this.time / DAY_LENGTH) % 1
    this.checkMidnight(this.prevPhase, phase)
    this.prevPhase = phase
    const light = clamp01(0.5 + 1.1 * Math.sin(phase * Math.PI * 2))

    this.skyBands.forEach((band, i) => {
      band.tint = lerpColor(COLORS.skyNight[i], COLORS.skyDay[i], light)
    })
    const night = 1 - light
    this.nightOverlay.alpha = night * 0.5
    // Die Spielbäume liegen vor dem Hintergrundwald und würden sonst im Dunkeln zu hell stehen bleiben.
    this.ground.tint = lerpColor(0x4a5688, 0xffffff, light)
    const treeTint = lerpColor(0x6a7aa8, 0xffffff, light)
    this.rootSprite.tint = treeTint
    for (const t of this.autumnTrees) {
      t.green.tint = t.sprite.tint = t.bare.tint = t.spring.tint = t.summer.tint = treeTint
    }
    this.stars.forEach((star, i) => {
      star.alpha = Math.min(1, (1 - light) * (1 - light) * 1.15 * (0.7 + 0.3 * Math.sin(this.time * 2 + i)))
    })

    const isDay = phase < 0.5
    const progress = isDay ? phase / 0.5 : (phase - 0.5) / 0.5
    this.body.texture = isDay ? this.sunTex : this.moonTex
    this.body.x = 24 + progress * (WORLD_W - 48)
    this.body.y = 56 - Math.sin(progress * Math.PI) * 40
    this.body.alpha = isDay ? 1 : 1
    const moon = isDay ? 0 : night
    this.body.scale.set(isDay ? 1 : 1.5)
    this.moonHalo.position.set(this.body.x, this.body.y)
    this.moonHalo.alpha = Math.min(1, moon * 1.3)

    for (const c of this.clouds) {
      c.sprite.x += c.speed * dt
      if (c.sprite.x > WORLD_W + SIDE) c.sprite.x = -SIDE - 40
      c.sprite.x = Math.round(c.sprite.x)
      c.sprite.tint = lerpColor(0x56668a, 0xffffff, light)
    }

    this.forest.update(dtMs, light)
    this.weatherLayer.update(dtMs, light)
    this.updateSeasonVeil(dt)
    this.drawWeb()
    this.truffles.update(dtMs)

    // Klick-Animation des Totholzes
    this.logBounce = Math.max(0, this.logBounce - dt * 6)
    this.log.scale.y = 1 - 0.14 * this.logBounce
    this.log.scale.x = 1 + 0.05 * this.logBounce

    // Nährstofffluss durch das Geflecht
    for (const f of this.flows) {
      f.timer += dtMs
      while (f.timer >= 35) {
        f.timer -= 35
        const parent = this.points[f.index].parent
        f.index = parent >= 0 ? parent : Math.floor(this.random() * this.revealed)
      }
      const p = this.points[f.index]
      f.sprite.x = p.x
      f.sprite.y = p.y
    }
    this.glowSprite.alpha = 0.75 + 0.25 * Math.sin(this.time * 2.2)

    // Sporen
    const mushroomCount = this.mushrooms.filter((m) => m.visible).length
    this.sporeAccum += dt * mushroomCount * 0.9
    while (this.sporeAccum >= 1) {
      this.sporeAccum -= 1
      this.spawnSpore()
    }
    for (let i = this.spores.length - 1; i >= 0; i--) {
      const s = this.spores[i]
      s.life -= dt
      if (s.life <= 0) {
        s.sprite.destroy()
        this.spores.splice(i, 1)
        continue
      }
      s.sprite.x += (s.vx + Math.sin(this.time * 2 + s.phase) * 4) * dt
      s.sprite.y += s.vy * dt
      s.sprite.alpha = clamp01(s.life / s.max * 1.5)
    }
  }

  get buildingCount(): number {
    return this.totalBuildings
  }
}
