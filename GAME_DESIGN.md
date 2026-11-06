# Myzel – Game Design Dokument (v0.1)

## 1. Vision
Du bist ein Pilzgeflecht unter einem Waldboden. Du wächst durch die Erde, vernetzt Bäume,
zersetzt Totholz und breitest dich von einem Waldstück bis zu einem ganzen Planeten aus.
Ruhiger, organischer Incremental mit einer Optimierungs-Ebene (Knoten-Gitter) statt reiner Kauf-Buttons.

Eckdaten: Deutsch (i18n-fähig vorbereitet), Browser zuerst, danach native Apps (macOS/Windows),
Mischung aus Idle und aktivem Optimieren, Hobbyprojekt (Steam optional später).

## 2. Art Direction – Pixel Art im Stil von Terraria / Stardew Valley

### Grundprinzipien
- **Tile-Größe 16×16 px**, wie Terraria und Stardew Valley. Sprites sind detailreich genug für Schattierung,
  aber klar als Pixel erkennbar.
- **Ganzzahlige Skalierung** (3× oder 4×) mit `image-rendering: pixelated` bzw. Nearest-Neighbor.
  Nie fraktional skalieren, sonst wird es unscharf oder flimmert.
- **Interne Auflösung** z. B. 480×270 (16:9), die auf das Fenster hochskaliert wird.
  Das gibt die „gute Auflösung" bei klar sichtbaren Pixeln.
- **Begrenzte Palette** (ca. 32 Farben, warme Erdtöne + Leuchtfarben für den Pilz). Einheitliche Palette = einheitlicher Look.
- **UI im selben Stil**: Pixel-Font, 9-Slice-Panels aus Holz/Rinde/Moos, Pixel-Icons.

### Ansicht: Querschnitt (Side View, wie Terraria / Ameisenfarm)
- **Oben:** Waldoberfläche mit Bäumen, Gras, Himmel. Tag/Nacht und Jahreszeiten färben die Szene.
- **Unten:** Bodenschnitt mit Erdschichten (Humus → Lehm → Gestein → Tiefengestein).
  Hier wächst dein Myzel. Das Knoten-Gitter ist direkt dieser Boden: jede Zelle ist ein 16×16 Tile.
- Parallax-Hintergrund für Himmel und ferne Bäume, leichte Partikel (Sporen, Pollen, Regen, Laub).
- Das Myzel leuchtet leicht (Glow-Effekt) und pulsiert, wenn es produziert. Das ist das visuelle Highlight.

### Animation
- Kleine Zyklen (2–4 Frames): Bäume wiegen sich, Pilze pulsieren, Sporen steigen auf.
- Wachstum der Hyphen als Linien-Animation Tile für Tile.
- Zahlen-Popups und Partikel bei Produktionsschüben.

### Wie kommen die Assets zustande?
1. **Platzhalter im Code:** Sprites als Paletten-Indexarrays definiert, damit der Prototyp sofort Pixel-Look hat.
2. **Finale Assets** per Pixel-Editor (Aseprite, günstig; LibreSprite/Pixelorama, kostenlos),
   freie Packs (Kenney, OpenGameArt, itch.io, auf Lizenz achten) oder Auftragsarbeit.
3. Alles in einem **Sprite-Atlas** (ein PNG), damit Rendering schnell bleibt.

## 3. Kernschleife
1. **Nährstoffe** entstehen passiv aus Totholz und Erde.
2. Du investierst sie in **Hyphen** (Generatoren) und Gitter-Knoten.
3. Upgrades und neue Zonen schalten mehr Produktion frei.
4. Meilenstein erreichen → Prestige → schneller von vorn.

## 4. Das Knoten-Gitter (Alleinstellungsmerkmal)
- Der Boden-Querschnitt ist ein Raster. Der Spieler platziert Knoten darauf.
- **Nachbarschaftsboni** erzeugen Planungstiefe, z. B.:
  - Wurzelkontakt neben Baum: ×2 Nährstoffe
  - Totholz neben Hyphe: +Zersetzung
  - Sporenturm neben Lichtung: +Sporen
- Tiefe Schichten liefern mehr, sind aber teurer und langsamer erreichbar.
- Das Gitter wächst mit jedem Prestige (mehr Felder, neue Knotentypen).

## 5. Progression

| Phase | Neue Ressource | Neue Mechanik |
|---|---|---|
| 1 | Nährstoffe | Hyphen kaufen, Basis-Upgrades |
| 2 | Sporen | Gitter wird freigeschaltet, Nachbarschaftsboni |
| 3 | Symbiose | Bäume vernetzen („Wood Wide Web"), Automatisierung |
| 4 | Myzel-Wissen | Forschungsbaum, Zonen (Wald → Moor → Dschungel) |
| 5 | Biosphäre | Planetare Ebene, Endgame |

## 6. Prestige-Ebenen
- **Herbst (Layer 1):** Reset gegen **Humus**, einen permanenten Multiplikator. Früh und oft (ca. 20–30 Min).
  Optisch: Laub fällt, Szene färbt sich um.
- **Ökosystem (Layer 2):** Höhere Ebene. Mehr Gitterfelder, neue Knotentypen.
- **Evolution (Layer 3):** Wahl einer Pilzart (Leuchtpilz, Parasit, Symbiont). Jede ändert die Regeln → Wiederspielwert.

## 7. Weitere Systeme
- **Offline-Fortschritt:** Der Pilz wächst weiter, während man weg ist (mit Obergrenze und Zusammenfassung beim Zurückkehren).
- **Jahreszeiten & Events:** Regen, Dürre, Schädlinge – kleine Entscheidungen, keine Pflicht.
- **Achievements** mit kleinen Boni.
- **Speichern:** localStorage + Export/Import als Textstring, versioniertes Format mit Migrationen.

## 8. Technik

| Bereich | Wahl | Grund |
|---|---|---|
| Sprache/Build | TypeScript + Vite | schnell, typsicher, einfach für Web und Tauri |
| Rendering Spielwelt | PixiJS (WebGL, Nearest-Neighbor) | Sprites, Partikel, Glow; skaliert gut |
| UI-Panels | Svelte (oder Vanilla-DOM) über dem Canvas | Menüs, Upgrade-Listen, Tooltips |
| Große Zahlen | break_infinity.js | schnell, reicht für den Anfang |
| Native Apps | Tauri (macOS + Windows) | klein, performant; Electron als Fallback |
| Tests | Vitest für Spiellogik | Balancing und Formeln testbar |

Wichtig: **Spiellogik strikt vom Rendering trennen.** Ein fester Tick (z. B. 10×/s) berechnet den Zustand,
das Rendering interpoliert. So bleibt Offline-Berechnung und Balancing einfach.

### Geplante Projektstruktur
```
src/
  game/        Zustand, Tick-Loop, Formeln, Prestige, Save/Load (kein DOM, kein Pixi)
  render/      PixiJS-Szene: Boden, Himmel, Bäume, Partikel, Sprite-Atlas
  ui/          Panels, Upgrade-Listen, Tooltips
  data/        Knoten, Upgrades, Zonen als reine Daten
  assets/      Sprites, Atlas, Fonts
```

## 9. Roadmap

| Meilenstein | Inhalt |
|---|---|
| M0 | Projekt-Setup (Vite, TS, PixiJS), Pixel-Skalierung, Platzhalter-Sprites |
| M1 | Kernschleife: Nährstoffe, Hyphen, Upgrades, Tick-Loop, Zahlenformat |
| M2 | Querschnitts-Ansicht + Knoten-Gitter mit Nachbarboni |
| M3 | Speichern, Offline-Fortschritt, Export/Import |
| M4 | Prestige Layer 1 (Herbst) inkl. Animationen |
| M5 | Phasen 2–3, Forschungsbaum, Tag/Nacht, Jahreszeiten |
| M6 | Tauri-Build für macOS und Windows, Release-Pipeline |
| M7 | Layer 2–3, Pilzarten, Balancing, Feinschliff |

## 10. Offene Entscheidungen
- Endgültiger Titel (Arbeitstitel: „Myzel").
- Woher die finalen Pixel-Assets kommen (selbst zeichnen, Packs, Auftrag).
- Monetarisierung / Steam: erst nach spielbarem Prototyp entscheiden.
- Sprache: Deutsch als Start, Englisch als zweite Sprache später?
