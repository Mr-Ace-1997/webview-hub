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
- No HTTP server or proxy — sites load directly in `<webview>` tags

**`preload.js`** — Exposes `window.electronAPI` to the renderer:
- `electronAPI.getConfig()` → calls `config:get` IPC
- `electronAPI.setConfig(data)` → calls `config:set` IPC

**`index.html`** — Single-file SPA (vanilla JS, no frameworks). All state lives in one object:

```js
{
  splitPct: 65,           // main pane width %
  activeGroupId: 'gXXX',
  groups: [{
    id, name,
    main: { name, url },
    sides: [{ name, url, flex: 33 }, ...]  // flex values sum ~100
  }]
}
```

Key functions:
- `renderAll()` — full re-render; called after any state change
- `renderTabs()` — re-renders tab bar; preserves the `+` button DOM node by detaching before `innerHTML = ''` and re-appending after
- `renderMain()` — sets main pane width + syncs height (see Layout section), shows/hides webview vs empty state
- `save()` — writes to `localStorage` and calls `electronAPI.setConfig()` simultaneously
- `normalizeFlex(g)` — scales all `sides[].flex` values so they sum to 100
- `startHDrag(e, el, g, idx)` — initiates horizontal divider drag between side slots
- `titleHtml(site)` — returns favicon `<img>` + name `<span>` markup for pane title overlays

## Layout System

### Side slots (work via pure CSS)
```
#side-slots (display:flex; flex-direction:column; flex:1)
  └── .side-slot (style.flex = "33"; position:relative)
        └── webview (position:absolute; inset:0; width:100%; height:100%)
```
Each `.side-slot` has its flex value set as an **inline style** via JS, giving it a definite height within the column container. The webview fills it absolutely.

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
- `vDrag` — vertical divider (adjusts `splitPct`, updates `mainPaneEl.style.width`)
- `hDrag` — horizontal dividers between side slots (adjusts `flex` values)

Horizontal drag math: `delta = (mouseY - startY) * totalFlexSum / containerHeight`

## Config Persistence

Priority on startup (async IIFE): **Electron IPC** (`electronAPI.getConfig`) → **localStorage** → **defaultState**.
Both targets are written on every `save()` call. Config file path: `setting/config.json` (created automatically).
Storage key: `webview-hub-v2`.

## Building / Packaging

```bash
npm run build   # outputs dist/win-unpacked/ (electron-builder)
# then zip dist/win-unpacked/ for distribution
```

`electron-builder` on Windows requires symlink permissions for its code signing tools.
If the build fails at the NSIS/zip packaging step, the app is already compiled in `dist/win-unpacked/` — zip that folder manually.

## Known Constraints

- Tab click handler has an early-return guard (`if activeGroupId === g.id return`) to prevent `renderAll()` from destroying the element before a `dblclick` can fire on the same node.
- Some sites block embedding via `X-Frame-Options` / CSP. Unlike the old Python proxy version, there is no header-stripping in Electron — sites that refuse embedding will show an error inside the webview.
- `#main-empty` default CSS must be `display:none` (not `display:flex`). If accidentally set to `flex`, the empty state permanently overlays the webview even when a URL is configured.
