import { deserialize, serialize } from './state.ts'
import type { GameState } from './state.ts'

const KEY = 'myzel-save'

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(serialize(state)))
  } catch {
    // Speicher blockiert (z. B. privates Fenster): Spiel läuft ohne Speichern weiter.
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? deserialize(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignorieren
  }
}

export function exportSave(state: GameState): string {
  return btoa(JSON.stringify(serialize(state)))
}

export function importSave(text: string): GameState | null {
  try {
    return deserialize(JSON.parse(atob(text.trim())))
  } catch {
    return null
  }
}
