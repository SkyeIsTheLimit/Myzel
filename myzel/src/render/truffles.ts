import { Container, Rectangle, Sprite, Texture } from 'pixi.js'
import { GRID_COLS, isTreeCell } from '../game/grid.ts'
import { TRUFFLE_LIFETIME } from '../game/truffle.ts'
import { GRID_TOP } from './grid.ts'
import { SURFACE_Y, TILE, WORLD_W, buildGlowTexture, buildPigTextures, buildTruffleTexture, rng } from './sprites.ts'
import type { PigTextures } from './sprites.ts'

/** Reihen des Gitters, in denen Trüffel auftauchen können (oberste Schichten). */
const SPAWN_ROWS = 5
const MAX_ACTIVE = 3
const BLINK_TIME = 4

interface TruffleItem {
  sprite: Sprite
  glow: Sprite
  cell: number
  x: number
  y: number
  age: number
}

interface Pig {
  sprite: Sprite
  x: number
  target: number
  mode: 'walk' | 'sniff'
  timer: number
  frameTimer: number
  frame: 0 | 1
  speed: number
}

interface Spark {
  sprite: Sprite
  vx: number
  vy: number
  life: number
}

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/** Findbare Trüffel im Boden und die Trüffelschweine, die auf dem Waldboden danach schnüffeln. */
export class TruffleLayer {
  /** Trüffel und Funken; liegt über dem Gitter, damit Klicks nicht im Gitter landen. */
  readonly container = new Container()
  /** Schweine auf dem Waldboden. */
  readonly pigLayer = new Container()
  /** Wird mit der Position des Trüffels in Canvas-Pixeln aufgerufen. */
  onCollect: (canvasX: number, canvasY: number) => void = () => {}

  private random = rng(4242)
  private truffleTex = buildTruffleTexture()
  private glowTex = buildGlowTexture('255,214,120')
  private pigTex: PigTextures = buildPigTextures()
  private items: TruffleItem[] = []
  private pigs: Pig[] = []
  private sparks: Spark[] = []
  private time = 0

  get active(): number {
    return this.items.length
  }

  /** Lässt einen Trüffel in einer zufälligen Zelle der oberen Bodenschichten erscheinen. */
  spawn(): boolean {
    if (this.items.length >= MAX_ACTIVE) return false
    for (let attempt = 0; attempt < 12; attempt++) {
      const col = Math.floor(this.random() * GRID_COLS)
      const row = Math.floor(this.random() * SPAWN_ROWS)
      const cell = row * GRID_COLS + col
      if (isTreeCell(cell) || this.items.some((t) => t.cell === cell)) continue
      this.add(cell, col * TILE + TILE / 2, GRID_TOP + row * TILE + TILE / 2)
      return true
    }
    return false
  }

  private add(cell: number, x: number, y: number): void {
    const glow = new Sprite(this.glowTex)
    glow.anchor.set(0.5)
    glow.blendMode = 'add'
    glow.position.set(x, y)
    const sprite = new Sprite(this.truffleTex)
    sprite.anchor.set(0.5)
    sprite.position.set(x, y)
    sprite.eventMode = 'static'
    sprite.cursor = 'pointer'
    sprite.hitArea = new Rectangle(-12, -12, 24, 24)
    const item: TruffleItem = { sprite, glow, cell, x, y, age: 0 }
    sprite.on('pointerdown', () => this.collect(item))
    this.container.addChild(glow, sprite)
    this.items.push(item)
    sprite.scale.set(0)
    glow.scale.set(0)
  }

  private collect(item: TruffleItem): void {
    if (!this.items.includes(item)) return
    this.remove(item)
    for (let i = 0; i < 12; i++) {
      const spark = new Sprite(Texture.WHITE)
      spark.tint = i % 3 === 0 ? 0xfff6c8 : 0xffd678
      spark.width = spark.height = 2
      spark.blendMode = 'add'
      spark.position.set(item.x, item.y)
      const angle = (i / 12) * Math.PI * 2 + this.random() * 0.4
      const speed = 28 + this.random() * 42
      this.container.addChild(spark)
      this.sparks.push({ sprite: spark, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 20, life: 0.7 })
    }
    const p = this.container.toGlobal({ x: item.x, y: item.y })
    this.onCollect(p.x, p.y)
  }

  private remove(item: TruffleItem): void {
    item.sprite.destroy()
    item.glow.destroy()
    this.items = this.items.filter((t) => t !== item)
  }

  /** Passt die Zahl sichtbarer Schweine an. */
  setPigs(count: number): void {
    while (this.pigs.length < count) {
      const sprite = new Sprite(this.pigTex.walkA)
      sprite.anchor.set(0.5, 1)
      const x = 14 + this.random() * (WORLD_W - 28)
      sprite.position.set(x, SURFACE_Y + 5)
      this.pigLayer.addChild(sprite)
      this.pigs.push({
        sprite,
        x,
        target: x,
        mode: 'sniff',
        timer: this.random() * 2,
        frameTimer: 0,
        frame: 0,
        speed: 9 + this.random() * 6,
      })
    }
    while (this.pigs.length > count) this.pigs.pop()?.sprite.destroy()
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000
    this.time += dt
    this.updateTruffles(dt)
    this.updateSparks(dt)
    this.updatePigs(dt)
  }

  private updateTruffles(dt: number): void {
    for (const t of [...this.items]) {
      t.age += dt
      if (t.age >= TRUFFLE_LIFETIME) {
        this.remove(t)
        continue
      }
      const pop = Math.min(1, t.age / 0.3)
      const s = easeOutBack(pop)
      // Leichtes Pulsieren, damit der Trüffel im dunklen Boden auffällt.
      const pulse = 1 + 0.12 * Math.sin(this.time * 5 + t.cell)
      t.sprite.scale.set(s)
      t.glow.scale.set(s * 1.9 * pulse)
      const remaining = TRUFFLE_LIFETIME - t.age
      const visible = remaining > BLINK_TIME || Math.floor(this.time * 8) % 2 === 0
      t.sprite.alpha = visible ? 1 : 0.35
      t.glow.alpha = (visible ? 0.75 : 0.2) * (0.7 + 0.3 * Math.sin(this.time * 5 + t.cell))
    }
  }

  private updateSparks(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i]
      sp.life -= dt
      if (sp.life <= 0) {
        sp.sprite.destroy()
        this.sparks.splice(i, 1)
        continue
      }
      sp.vy += 140 * dt
      sp.sprite.x += sp.vx * dt
      sp.sprite.y += sp.vy * dt
      sp.sprite.alpha = Math.min(1, sp.life / 0.4)
    }
  }

  private updatePigs(dt: number): void {
    this.pigs.forEach((pig, i) => {
      // Gibt es Trüffel, laufen die Schweine zu ihnen und schnüffeln über der Fundstelle.
      const chase = this.items.length > 0 ? this.items[i % this.items.length] : null
      let speed = pig.speed
      if (chase) {
        pig.target = Math.min(WORLD_W - 10, Math.max(10, chase.x + ((i % 3) - 1) * 9))
        speed = 34
        if (Math.abs(pig.x - pig.target) > 1.5) pig.mode = 'walk'
        else pig.mode = 'sniff'
      } else if (pig.mode === 'sniff') {
        pig.timer -= dt
        if (pig.timer <= 0) {
          const dist = (this.random() < 0.5 ? -1 : 1) * (24 + this.random() * 60)
          pig.target = Math.min(WORLD_W - 10, Math.max(10, pig.x + dist))
          pig.mode = 'walk'
        }
      } else if (Math.abs(pig.x - pig.target) <= 1.5) {
        pig.mode = 'sniff'
        pig.timer = 1.2 + this.random() * 2.6
      }

      let facing = pig.sprite.scale.x >= 0 ? 1 : -1
      if (pig.mode === 'walk') {
        const dir = pig.target > pig.x ? 1 : -1
        facing = dir
        pig.x += dir * speed * dt
        if (Math.abs(pig.x - pig.target) <= 1.5) pig.x = pig.target
        pig.frameTimer += dt
        if (pig.frameTimer > 0.18) {
          pig.frameTimer = 0
          pig.frame = pig.frame === 0 ? 1 : 0
        }
        pig.sprite.texture = pig.frame === 0 ? this.pigTex.walkA : this.pigTex.walkB
      } else {
        if (chase) facing = chase.x >= pig.x ? 1 : -1
        pig.sprite.texture = this.pigTex.sniff
      }
      pig.sprite.scale.x = facing
      pig.sprite.x = Math.round(pig.x)
      // Beim Schnüffeln wippt das Schwein leicht.
      pig.sprite.y = SURFACE_Y + 5 + (pig.mode === 'sniff' && Math.sin(this.time * 14 + i) > 0.4 ? 1 : 0)
    })
  }
}
