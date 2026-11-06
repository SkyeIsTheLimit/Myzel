import { getNode } from '../game/data.ts'
import { formatNumber } from '../game/format.ts'
import { canPlaceAt, isClaimable, isTreeCell, nodeBreakdown, rowOf } from '../game/grid.ts'
import {
  claimCost,
  globalMult,
  nodeCost,
  placementGainPerSecond,
  removeRefund,
} from '../game/state.ts'
import type { GameState } from '../game/state.ts'

/** Gewähltes Werkzeug: Knotentyp, 'remove' oder keines. */
export type Tool = string | null
export const REMOVE_TOOL = 'remove'

const line = (text: string, cls = ''): string => `<div class="tt-line ${cls}">${text}</div>`
const title = (text: string): string => `<div class="tt-title">${text}</div>`
const pct = (v: number): string => `+${Math.round(v * 100)} %`

export function cellTooltip(state: GameState, index: number, tool: Tool): string {
  const { grid } = state

  if (isTreeCell(index)) {
    return title('Baumwurzel') + line('Wurzelkontakte daneben erhalten +150 % Produktion.')
  }

  const placed = grid.nodes[index]
  if (placed) {
    const def = getNode(placed)
    const b = nodeBreakdown(grid.nodes, index, placed)
    const parts = b.parts.map((p) => line(`${pct(p.bonus)} ${p.label}${p.count > 1 ? ` ×${p.count}` : ''}`, 'tt-good'))
    const out = [
      title(def.name),
      line(`Produktion: ${formatNumber(b.production * globalMult(state), 1)} / Sek`),
      line(`Basis ${formatNumber(b.base, 1)} · Tiefe ×${b.depth.toFixed(1)}`, 'tt-dim'),
      ...parts,
    ]
    if (tool === 'remove') out.push(line(`Entfernen: +${formatNumber(removeRefund(state, placed))} Nährstoffe`, 'tt-bad'))
    return out.join('')
  }

  if (grid.claimed[index]) {
    if (tool && tool !== 'remove') {
      const def = getNode(tool)
      if (!canPlaceAt(grid, index, tool)) {
        return title(def.name) + line(`Nur in den obersten ${(def.maxRow ?? 0) + 1} Reihen.`, 'tt-bad')
      }
      const cost = nodeCost(state, tool)
      const gain = placementGainPerSecond(state, index, tool)
      return (
        title(`${def.name} setzen`) +
        line(`Kosten: ${formatNumber(cost)}`, state.nutrients.gte(cost) ? '' : 'tt-bad') +
        line(`Gewinn: +${formatNumber(gain, 1)} / Sek`, 'tt-good')
      )
    }
    return title('Freier Boden') + line('Wähle rechts einen Knoten und setze ihn hierhin.', 'tt-dim')
  }

  if (isClaimable(grid, index)) {
    const cost = claimCost(state, index)
    return (
      title('Boden erschließen') +
      line(`Kosten: ${formatNumber(cost)}`, state.nutrients.gte(cost) ? '' : 'tt-bad') +
      line(rowOf(index) > 0 ? 'Tiefere Felder produzieren mehr.' : 'Erweitert dein Geflecht.', 'tt-dim')
    )
  }
  return title('Noch nicht erreichbar') + line('Erschließe zuerst ein angrenzendes Feld.', 'tt-dim')
}
