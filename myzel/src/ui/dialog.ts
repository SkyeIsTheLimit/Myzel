/**
 * Eigene Dialoge im Spiel. `window.confirm` und `window.prompt` werden in eingebetteten Browserfenstern oft
 * unterdrückt (sie liefern dann sofort „Nein“), deshalb gibt es hier Ersatz, der überall funktioniert.
 */

interface DialogOptions {
  message: string
  okLabel: string
  cancelLabel?: string
  /** Mit Text: Eingabefeld (leer = keins). */
  input?: { value: string; readOnly?: boolean } | null
  danger?: boolean
}

function open(options: DialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div')
    backdrop.className = 'dialog-backdrop'
    const box = document.createElement('div')
    box.className = 'dialog'
    box.setAttribute('role', 'dialog')
    box.setAttribute('aria-modal', 'true')

    const text = document.createElement('p')
    text.className = 'dialog-text'
    text.textContent = options.message
    box.appendChild(text)

    let field: HTMLTextAreaElement | null = null
    if (options.input) {
      field = document.createElement('textarea')
      field.className = 'dialog-input'
      field.rows = 5
      field.value = options.input.value
      field.readOnly = options.input.readOnly ?? false
      box.appendChild(field)
    }

    const buttons = document.createElement('div')
    buttons.className = 'dialog-buttons'
    const ok = document.createElement('button')
    ok.textContent = options.okLabel
    if (options.danger) ok.classList.add('danger')
    buttons.appendChild(ok)
    if (options.cancelLabel) {
      const cancel = document.createElement('button')
      cancel.textContent = options.cancelLabel
      buttons.prepend(cancel)
      cancel.addEventListener('click', () => close(null))
    }
    box.appendChild(buttons)
    backdrop.appendChild(box)

    const close = (result: string | null): void => {
      window.removeEventListener('keydown', onKey, true)
      backdrop.remove()
      resolve(result)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    ok.addEventListener('click', () => close(field ? field.value : 'ok'))
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop && options.cancelLabel) close(null)
    })

    document.body.appendChild(backdrop)
    if (field) {
      field.focus()
      if (options.input?.readOnly) field.select()
    } else {
      ok.focus()
    }
  })
}

export async function askConfirm(message: string, okLabel = 'Ja', danger = false): Promise<boolean> {
  return (await open({ message, okLabel, cancelLabel: 'Abbrechen', danger })) !== null
}

/** Eingabe eines Textes; `null`, wenn abgebrochen. */
export function askText(message: string, okLabel = 'OK'): Promise<string | null> {
  return open({ message, okLabel, cancelLabel: 'Abbrechen', input: { value: '' } })
}

/** Zeigt einen Text zum Kopieren. */
export async function showText(message: string, text: string): Promise<void> {
  await open({ message, okLabel: 'Schließen', input: { value: text, readOnly: true } })
}

export interface MenuItem {
  label: string
  danger?: boolean
  run: () => void
}

/** Kleines Menü als Fenster über dem Spiel (zum Beispiel die Einstellungen hinter dem Zahnrad). */
export function showMenu(title: string, items: MenuItem[], hint: string): void {
  const backdrop = document.createElement('div')
  backdrop.className = 'dialog-backdrop'
  const box = document.createElement('div')
  box.className = 'dialog'
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-modal', 'true')

  const head = document.createElement('h2')
  head.className = 'dialog-title'
  head.textContent = title
  box.appendChild(head)

  const list = document.createElement('div')
  list.className = 'dialog-menu'
  const close = (): void => {
    window.removeEventListener('keydown', onKey, true)
    backdrop.remove()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }
  for (const item of items) {
    const button = document.createElement('button')
    button.textContent = item.label
    if (item.danger) button.classList.add('danger')
    button.addEventListener('click', () => {
      close()
      item.run()
    })
    list.appendChild(button)
  }
  box.appendChild(list)

  const note = document.createElement('p')
  note.className = 'dialog-hint'
  note.textContent = hint
  box.appendChild(note)

  const buttons = document.createElement('div')
  buttons.className = 'dialog-buttons'
  const done = document.createElement('button')
  done.textContent = 'Schließen'
  done.addEventListener('click', close)
  buttons.appendChild(done)
  box.appendChild(buttons)

  backdrop.appendChild(box)
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) close()
  })
  window.addEventListener('keydown', onKey, true)
  document.body.appendChild(backdrop)
  done.focus()
}
