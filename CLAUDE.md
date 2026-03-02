# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

```bash
npm start              # launch Electron app (dev)
start_electron.bat     # Windows convenience launcher (installs deps if needed, then npm start)
```

Requires Node.js + npm. Run `npm install` once before first launch.

## Architecture

The application is an Electron desktop app built from three source files:

**`main.js`** — Electron main process:
- Creates `BrowserWindow` with `webviewTag: true` (enables `<webview>` elements)
- IPC handlers: `config:get` reads `setting/config.json`, `config:set` writes it
- Config path uses `app.isPackaged` to distinguish dev vs packaged:
  - Dev: `path.join(__dirname, 'setting')`
  - Packaged: `path.join(path.dirname(app.getPath('exe')), 'setting')`
- No HTTP server or proxy — sites load directly in `<webview>` tags

**`preload.js`** — Exposes `window.electronAPI` to the renderer:
- `electronAPI.getConfig()` → calls `config:get` IPC
- `electronAPI.setConfig(data)` → calls `config:set` IPC

**`index.html`** — Single-file SPA (vanilla JS, no frameworks). All state lives in one object:

```js
{
  activeGroupId: 'gXXX',
  groups: [{
    id, name,
    splitPct: 65,           // main pane width % — per group
    main: { name, url, zoom: 0.75 },
    sides: [{ name, url, flex: 33, zoom: 1 }, ...]  // flex values sum ~100
  }]
}
```

Key functions:
- `renderAll()` — full re-render; called after any state change
- `renderTabs()` — re-renders tab bar; preserves the `+` button DOM node by detaching before `innerHTML = ''` and re-appending after
- `renderMain()` — sets main pane width + syncs height (see Layout section), shows/hides webview vs empty state
- `renderSidePane()` — builds side slots, h-dividers (with snap buttons), zoom controls
- `save()` — writes to `localStorage` and calls `electronAPI.setConfig()` simultaneously
- `normalizeFlex(g)` — scales all `sides[].flex` values so they sum to 100
- `startHDrag(e, el, g, idx)` — initiates horizontal divider drag between side slots
- `snapSlots(g, idx, direction, hdEl)` — snaps a divider to top/bottom edge; saves pre-snap flex values on `hdEl.dataset` for restore
- `restoreSlots(g, idx, hdEl)` — reads pre-snap values from `hdEl.dataset` and restores them
- `zoomStep(z, dir)` — steps zoom value up (+1) or down (-1) through `ZOOM_STEPS` presets
- `zoomLabel(z)` — returns display string ('75%') for a zoom value
- `titleHtml(site)` — returns favicon `<img>` + name `<span>` markup for pane title overlays

## Layout System

### Side slots (work via pure CSS)
```
#side-slots (display:flex; flex-direction:column; flex:1)
  └── .side-slot (style.flex = "33"; position:relative)
        └── webview (position:absolute; inset:0; width:100%; height:100%)
```
Each `.side-slot` has its flex value set as an **inline style** via JS, giving it a definite height within the column container. The webview fills it absolutely.

`.side-slot` has `transition: flex 0.22s` for animated snap. The class `#side-slots.is-dragging` disables this transition during drag.

### Main pane (requires JS height sync)
```
#workspace (display:flex)
  └── #main-pane (flex-shrink:0; position:relative)
        └── #main-slot (position:absolute; inset:0; display:flex; flex-direction:column)
              └── #main-iframe/webview (display:flex; flex:1)
```
`#main-pane` height comes from `align-items:stretch` in the flex-row `#workspace`. Because Electron's `<webview>` doesn't resolve `height:100%` reliably from this, `renderMain()` syncs the height explicitly:
```js
const wh = workspaceEl.clientHeight;
if (wh > 0) mainPaneEl.style.height = wh + 'px';
```
A `ResizeObserver` on `workspaceEl` keeps it updated on window resize.

`#main-slot` uses `position:absolute; inset:0` to fill the pane, then `display:flex; flex-direction:column` so the webview can use `flex:1`. Both `#main-slot` and `#main-iframe` need `display:flex` explicitly — Electron's webview ignores `flex:1` from a `display:block` parent.

## Drag System

A full-viewport `dragShield` div (`position:fixed; inset:0; z-index:9999`) is shown during any drag to prevent webviews from swallowing `mousemove`/`mouseup` events. Two independent drag states share one `document` mousemove/mouseup handler:
- `vDrag` — vertical divider (adjusts `activeGroup().splitPct`, updates `mainPaneEl.style.width`)
- `hDrag` — horizontal dividers between side slots (adjusts `flex` values)

Horizontal drag math: `delta = (mouseY - startY) * totalFlexSum / containerHeight`

## Snap System

Each `.h-divider` contains three absolutely-positioned buttons (hidden by default, shown on `mouseenter`):
- `.snap-up` (↑) — snaps divider to top; slot above shrinks to 4% of combined flex, slot below expands
- `.snap-down` (↓) — snaps divider to bottom; slot below shrinks, slot above expands
- `.snap-restore` (↕) — visible only after a snap; restores pre-snap flex values from `hdEl.dataset.prevA/prevB`

Snap applies directly to DOM (`slot.style.flex`) without calling `renderAll()`, so the CSS transition animates it. State is updated and `save()` is called immediately.

## Zoom System

Each site object stores `zoom` (float, default `1`). Presets: `[0.4, 0.5, 0.67, 0.75, 0.85, 1]`.

Zoom is applied via `webview.setZoomFactor(z)` on `dom-ready` (to handle navigation within a slot). When the user clicks `[−]`/`[+]`, `setZoomFactor` is also called immediately. The main pane's `dom-ready` listener uses `activeGroup()?.main?.zoom` so it always reflects the current tab.

## Config Persistence

Priority on startup (async IIFE): **Electron IPC** (`electronAPI.getConfig`) → **localStorage** → **defaultState**.
Both targets are written on every `save()` call. Config file path: `setting/config.json` next to the exe (packaged) or in the project root (dev).
Storage key: `webview-hub-v2`.

**Migration**: on startup, if a loaded group lacks `splitPct`, it inherits from the legacy root-level `state.splitPct` (or defaults to 65).

## Building / Packaging

```bash
npm run build   # outputs dist/win-unpacked/ (electron-builder)
```

`electron-builder` on Windows requires symlink permissions for its code signing tools.
If the build fails at the code signing step, the app is already compiled in `dist/win-unpacked/` — zip the **contents** for distribution:

```powershell
cd dist
Compress-Archive -Path 'win-unpacked\*' -DestinationPath 'WebView-Hub.zip' -Force
```

`setting/` is declared as `extraFiles` in `package.json` so it lands next to the exe (not inside `app.asar`), making it writable at runtime.

## Known Constraints

- Tab click handler has an early-return guard (`if activeGroupId === g.id return`) to prevent `renderAll()` from destroying the element before a `dblclick` can fire on the same node.
- Some sites block embedding via `X-Frame-Options` / CSP. Unlike the old Python proxy version, there is no header-stripping in Electron — sites that refuse embedding will show an error inside the webview.
- `#main-empty` default CSS must be `display:none` (not `display:flex`). If accidentally set to `flex`, the empty state permanently overlays the webview even when a URL is configured.
- `webview.setZoomFactor()` must be called after `dom-ready`; calling it before the element is ready fails silently.
