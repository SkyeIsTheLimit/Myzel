import { Container, Sprite, Texture } from 'pixi.js'
import type { Season, WeatherId } from '../game/weather.ts'
import { SURFACE_Y, WORLD_W, buildCloudTexture } from './sprites.ts'

/** Wie weit über das Spielfeld hinaus Wetter fällt (gleich wie Himmel und Wald in der Welt). */
const SIDE = 384
const TOP = -260
const GROUND = SURFACE_Y + 3
const AREA_W = WORLD_W + 2 * SIDE

const SEASON_TINT: Record<Season, { color: number; alpha: number }> = {
  spring: { color: 0xffc8e8, alpha: 0.07 },
  summer: { color: 0xffdf80, alpha: 0.13 },
  autumn: { color: 0xff9040, alpha: 0.2 },
  winter: { color: 0xe8f2ff, alpha: 0.5 },
}

interface Particle {
  sprite: Sprite
  vx: number
  vy: number
  phase: number
}

function sprite(w: number, h: number, color: number): Sprite {
  const s = new Sprite(Texture.WHITE)
  s.width = w
  s.height = h
  s.tint = color
  return s
}

/**
 * Wetter und Jahreszeit als Schicht über Himmel und Wald: Regen, Schnee, Nebel, im Frühling Blütenblätter und
 * eine leichte Färbung je Jahreszeit. Alles fällt nur bis zur Grasnarbe.
 */
export class WeatherLayer {
  readonly container = new Container()
  /** Schneedecke auf dem Gras, nur im Winter. */
  private snowCover = new Container()
  /** Gefallenes Laub auf dem Gras, nur im Herbst. */
  private leafCarpet = new Container()
  private tint = sprite(AREA_W, GROUND + 4 - TOP, 0xffffff)
  private fog: Sprite[] = []
  private rain: Particle[] = []
  private snow: Particle[] = []
  private petals: Particle[] = []
  private butterflies: Array<{ body: Sprite; x: number; y: number; phase: number; speed: number; radius: number }> = []
  private weather: WeatherId = 'clear'
  private season: Season | null = null
  private tintBase = 0
  /** Grauer Schleier über Himmel und Wald, nur bei Regen. */
  private rainShade = sprite(AREA_W, GROUND + 4 - TOP, 0x4a5568)
  private rainClouds: Array<{ sprite: Sprite; speed: number }> = []
  /** Wie stark das aktuelle Wetter sichtbar ist (0 bis 1); blendet sanft ein und aus. */
  private intensity: Record<WeatherId, number> = { clear: 0, rain: 0, fog: 0, snow: 0 }
  private time = 0
  private rnd = ((): (() => number) => {
    let s = 4242
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296
      return s / 4294967296
    }
  })()

  constructor() {
    this.tint.position.set(-SIDE, TOP)
    this.tint.alpha = 0
    this.container.addChild(this.tint)
    this.rainShade.position.set(-SIDE, TOP)
    this.rainShade.alpha = 0
    this.container.addChild(this.rainShade)
    // Dunkle, große Regenwolken: ziehen langsam, erscheinen nur bei Regen.
    for (let i = 0; i < 22; i++) {
      const cloud = new Sprite(buildCloudTexture(300 + (i % 5)))
      cloud.scale.set(2.2 + this.rnd() * 1.4, 1.5 + this.rnd() * 0.8)
      cloud.position.set(-SIDE + (i / 22) * AREA_W + this.rnd() * 30, -120 + this.rnd() * 112)
      cloud.alpha = 0
      this.container.addChild(cloud)
      this.rainClouds.push({ sprite: cloud, speed: 2 + this.rnd() * 3 })
    }

    for (let x = -SIDE; x < WORLD_W + SIDE; x += 3) {
      const h = 2 + Math.floor(this.rnd() * 2)
      const cap = sprite(3, h, 0xf4f8ff)
      cap.position.set(x, SURFACE_Y + 3 - h)
      this.snowCover.addChild(cap)
    }
    this.snowCover.visible = false
    const leafColors = [0xe08a2f, 0xf2c14e, 0xb8561f, 0xd9602a, 0xc9a23a]
    for (let x = -SIDE; x < WORLD_W + SIDE; x += 2) {
      if (this.rnd() < 0.35) continue
      const leaf = sprite(2 + Math.floor(this.rnd() * 2), 1, leafColors[Math.floor(this.rnd() * leafColors.length)])
      leaf.position.set(x, SURFACE_Y + 2 + Math.floor(this.rnd() * 3))
      this.leafCarpet.addChild(leaf)
    }
    this.leafCarpet.visible = false
    this.container.addChild(this.leafCarpet)
    this.container.addChild(this.snowCover)

    for (let i = 0; i < 4; i++) {
      const band = sprite(AREA_W, 26 + i * 10, 0xe4eaf0)
      band.position.set(-SIDE, SURFACE_Y - 26 - i * 14)
      band.alpha = 0
      this.fog.push(band)
      this.container.addChild(band)
    }
    for (let i = 0; i < 16; i++) {
      const body = sprite(3, 2, [0xffd45c, 0xff8fb8, 0xffffff, 0xa6d4ff, 0xffb35c][i % 5])
      body.anchor.set(0.5)
      body.visible = false
      this.container.addChild(body)
      this.butterflies.push({
        body,
        x: -SIDE / 2 + this.rnd() * (WORLD_W + SIDE),
        y: SURFACE_Y - 46 + this.rnd() * 38,
        phase: this.rnd() * 10,
        speed: 0.4 + this.rnd() * 0.5,
        radius: 10 + this.rnd() * 22,
      })
    }
    this.fillParticles(this.rain, 760, 0xe0ecff, 1, 6, () => ({ vx: -20, vy: 150 + this.rnd() * 60 }))
    this.fillParticles(this.snow, 320, 0xffffff, 2, 2, () => ({ vx: 0, vy: 14 + this.rnd() * 10 }))
    this.fillParticles(this.petals, 130, 0xffb6d0, 2, 1, () => ({ vx: 6 + this.rnd() * 6, vy: 8 + this.rnd() * 6 }))
  }

  private fillParticles(list: Particle[], count: number, color: number, w: number, h: number, speed: () => { vx: number; vy: number }): void {
    for (let i = 0; i < count; i++) {
      const s = sprite(w, h, color)
      s.x = -SIDE + this.rnd() * AREA_W
      s.y = TOP + this.rnd() * (GROUND - TOP)
      s.visible = false
      this.container.addChild(s)
      list.push({ sprite: s, ...speed(), phase: this.rnd() * 6 })
    }
  }

  /** Wie stark es gerade regnet, 0 bis 1 (blendet sanft ein und aus). */
  get rainAmount(): number {
    return this.intensity.rain
  }

  setWeather(weather: WeatherId): void {
    this.weather = weather
  }

  setSeason(season: Season | null): void {
    this.season = season
    const t = season ? SEASON_TINT[season] : null
    this.tint.tint = t?.color ?? 0xffffff
    this.tintBase = t?.alpha ?? 0
    this.tint.alpha = this.tintBase
    this.snowCover.visible = season === 'winter'
    this.leafCarpet.visible = season === 'autumn'
  }

  update(dtMs: number, light: number): void {
    const dt = Math.min(dtMs, 250) / 1000
    this.time += dt
    // Die Tönung der Jahreszeit wirkt nur bei Tageslicht; nachts würde sie den Himmel aufhellen.
    this.tint.alpha = this.tintBase * (0.08 + 0.92 * light)
    const snowShade = Math.round(0x58 + (0xff - 0x58) * light)
    this.snowCover.tint = (snowShade << 16) | (snowShade << 8) | Math.min(255, snowShade + 18)
    for (const id of Object.keys(this.intensity) as WeatherId[]) {
      const target = id === this.weather ? 1 : 0
      this.intensity[id] += Math.sign(target - this.intensity[id]) * Math.min(Math.abs(target - this.intensity[id]), dt / 3)
    }

    // Nebel: träge schwebende, blasse Bänder; bei Nacht dunkler.
    const fog = this.intensity.fog
    const brightness = 0.55 + 0.45 * light
    this.fog.forEach((band, i) => {
      band.alpha = fog * (0.24 + 0.08 * Math.sin(this.time * 0.4 + i * 1.7)) * brightness
      band.tint = light > 0.5 ? 0xe4eaf0 : 0x9aa6bc
    })

    // Schmetterlinge: im Sommer bei Tag und trockenem Wetter.
    const calm = Math.max(0, 1 - this.intensity.rain - this.intensity.fog - this.intensity.snow)
    const flutter = this.season === 'summer' ? calm * Math.max(0, (light - 0.4) / 0.6) : 0
    this.butterflies.forEach((b, i) => {
      const on = flutter > 0.05 && i < Math.ceil(this.butterflies.length * flutter)
      b.body.visible = on
      if (!on) return
      const t = this.time * b.speed + b.phase
      b.body.x = Math.round(b.x + Math.sin(t) * b.radius * 1.6 + Math.sin(t * 2.3) * 4)
      b.body.y = Math.round(b.y + Math.sin(t * 1.7) * b.radius * 0.35 + Math.cos(t * 3.1) * 2)
      b.body.scale.x = 1.3 * (0.35 + 0.65 * Math.abs(Math.sin(this.time * 9 + b.phase)))
      b.body.alpha = flutter
    })

    // Regen: grauer Schleier und dunkle Wolken, die sanft ein- und ausblenden.
    const rainAmount = this.intensity.rain
    this.rainShade.alpha = rainAmount * 0.3 * (0.35 + 0.65 * light)
    const cloudColor = light > 0.5 ? 0x6d7686 : 0x2b3244
    for (const c of this.rainClouds) {
      c.sprite.x += c.speed * dt
      if (c.sprite.x > WORLD_W + SIDE) c.sprite.x = -SIDE - 80
      c.sprite.tint = cloudColor
      c.sprite.alpha = rainAmount * 0.9
    }

    this.move(this.rain, this.intensity.rain, dt, false)
    this.move(this.snow, this.intensity.snow, dt, true)
    // Blütenblätter wehen im Frühling bei jedem Wetter außer Schnee leicht mit.
    this.move(this.petals, this.season === 'spring' ? 1 - this.intensity.snow : 0, dt, true)
  }

  private move(list: Particle[], strength: number, dt: number, sway: boolean): void {
    const visible = Math.floor(list.length * Math.min(1, strength))
    list.forEach((p, i) => {
      const on = i < visible
      p.sprite.visible = on
      if (!on) return
      p.sprite.x += (p.vx + (sway ? Math.sin(this.time * 1.3 + p.phase) * 6 : 0)) * dt
      p.sprite.y += p.vy * dt
      if (p.sprite.y > GROUND) {
        p.sprite.y = TOP + this.rnd() * 20
        p.sprite.x = -SIDE + this.rnd() * AREA_W
      }
      if (p.sprite.x > WORLD_W + SIDE) p.sprite.x -= AREA_W
      if (p.sprite.x < -SIDE) p.sprite.x += AREA_W
      p.sprite.alpha = 0.85 * Math.min(1, strength)
    })
  }
}
