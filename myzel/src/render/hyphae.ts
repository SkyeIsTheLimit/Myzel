import { rng } from './sprites.ts'

export interface HyphaPoint {
  x: number
  y: number
  /** Index des Vorgängerpunkts, -1 an der Wurzel. */
  parent: number
  gen: number
}

interface Walker {
  fx: number
  fy: number
  angle: number
  gen: number
  life: number
  last: number
}

/**
 * Erzeugt ein verzweigtes Geflecht als Punktliste. Die Reihenfolge entspricht dem
 * Wachstum über die Zeit, so kann man das Geflecht einfach "aufdecken".
 */
export function generateHyphae(
  seed: number,
  rootsX: number[],
  top: number,
  width: number,
  height: number,
  count: number,
): HyphaPoint[] {
  const r = rng(seed)
  const points: HyphaPoint[] = []
  let walkers: Walker[] = []

  for (const x of rootsX) {
    points.push({ x, y: top, parent: -1, gen: 0 })
    const rootIndex = points.length - 1
    // Die drei Haupttriebe starten leicht versetzt, damit sie sich nicht zu einem Klumpen überlagern.
    for (const a of [-0.8, 0, 0.8]) {
      walkers.push({ fx: x + a * 2.5, fy: top, angle: Math.PI / 2 + a, gen: 0, life: 260 + r() * 90, last: rootIndex })
    }
  }

  while (points.length < count && walkers.length > 0) {
    const next: Walker[] = []
    for (const w of walkers) {
      w.angle += (r() - 0.5) * (w.gen === 0 ? 0.5 : 0.7)
      // Haupttriebe wachsen nach unten; Seitenäste laufen seitwärts, aber leicht abwärts
      // statt flach am oberen Rand entlang.
      const bias = w.gen === 0 ? Math.PI / 2 : Math.cos(w.angle) < 0 ? Math.PI - 0.5 : 0.5
      w.angle += (bias - w.angle) * (w.gen === 0 ? 0.09 : 0.02)
      w.fx += Math.cos(w.angle)
      w.fy += Math.sin(w.angle)
      if (w.fy < top + 2) { w.fy = top + 2; w.angle = Math.abs(w.angle) }
      if (w.fy > height - 3) { w.fy = height - 3; w.angle = -w.angle }
      if (w.fx < 2) { w.fx = 2; w.angle = Math.PI - w.angle }
      if (w.fx > width - 3) { w.fx = width - 3; w.angle = Math.PI - w.angle }

      const x = Math.round(w.fx)
      const y = Math.round(w.fy)
      const prev = points[w.last]
      if (x !== prev.x || y !== prev.y) {
        points.push({ x, y, parent: w.last, gen: w.gen })
        w.last = points.length - 1
        if (w.gen < 4 && r() < 0.045) {
          next.push({
            fx: w.fx,
            fy: w.fy,
            angle: w.angle + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.6),
            gen: w.gen + 1,
            life: 35 + r() * 45,
            last: w.last,
          })
        }
      }
      w.life -= 1
      if (w.life > 0) next.push(w)
    }
    walkers = next
  }
  return points.slice(0, count)
}

/**
 * Baumwurzeln: starten am Stammfuß, wachsen fächerförmig nach unten und verzweigen sich.
 * Die Dicke nimmt mit der Tiefe ab (siehe `rootThickness`).
 */
export function generateRoots(seed: number, rootsX: number[], top: number, width: number, height: number): HyphaPoint[] {
  const r = rng(seed)
  const points: HyphaPoint[] = []
  let walkers: Walker[] = []
  for (const x of rootsX) {
    points.push({ x, y: top, parent: -1, gen: 0 })
    const rootIndex = points.length - 1
    for (const a of [-1.05, -0.6, -0.2, 0.2, 0.6, 1.05]) {
      const central = Math.abs(a) < 0.5
      walkers.push({ fx: x + a * 3, fy: top, angle: Math.PI / 2 + a, gen: 0, life: central ? 30 + r() * 16 : 18 + r() * 16, last: rootIndex })
    }
  }
  while (walkers.length > 0) {
    const next: Walker[] = []
    for (const w of walkers) {
      w.angle += (r() - 0.5) * 0.45
      w.angle += (Math.PI / 2 - w.angle) * (w.gen === 0 ? 0.1 : 0.16)
      w.fx += Math.cos(w.angle)
      w.fy += Math.sin(w.angle)
      w.fx = Math.min(width - 3, Math.max(2, w.fx))
      w.fy = Math.min(height - 3, Math.max(top, w.fy))
      const x = Math.round(w.fx)
      const y = Math.round(w.fy)
      const prev = points[w.last]
      if (x !== prev.x || y !== prev.y) {
        points.push({ x, y, parent: w.last, gen: w.gen })
        w.last = points.length - 1
        if (w.gen < 2 && r() < 0.06) {
          next.push({ fx: w.fx, fy: w.fy, angle: w.angle + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.5), gen: w.gen + 1, life: 12 + r() * 16, last: w.last })
        }
      }
      w.life -= 1
      if (w.life > 0) next.push(w)
    }
    walkers = next
  }
  return points
}

/** Breite einer Wurzel in Pixeln abhängig von der Tiefe unter dem Stammfuß. */
export function rootThickness(depth: number, gen: number): number {
  if (gen > 0) return 1
  return depth < 9 ? 3 : depth < 22 ? 2 : 1
}
