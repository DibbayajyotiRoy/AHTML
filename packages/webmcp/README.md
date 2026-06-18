# @ahtmljs/webmcp

Register AHTML page actions as [WebMCP](https://github.com/WICG/webmcp) browser tools — the bridge between AHTML's structured action contracts and the W3C WebML CG WebMCP API.

## What is WebMCP?

WebMCP is a W3C WebML Community Group proposal that lets web pages register JavaScript functions as AI agent tools callable by browser-embedded AI assistants. Chrome 149 launched an origin trial on 2026-05-19; Edge ships it natively. AHTML's action metadata (cost, reversibility, confirmation requirements, side-effects) is richer than WebMCP's baseline descriptor — `@ahtmljs/webmcp` surfaces all of it as tool annotations (`x-ahtml-cost`, `x-ahtml-reversible`, `x-ahtml-side-effects`, etc.) so browser AI can make informed, safe decisions before invoking actions.

## Installation

```bash
npm i @ahtmljs/webmcp
```

## Usage

### 1. Register actions from a snapshot

```ts
import { registerAhtmlTools } from '@ahtmljs/webmcp';

// After fetching the AHTML snapshot for the current page:
const res = await fetch('/.well-known/ahtml.json');
const snap = await res.json();

const tools = registerAhtmlTools(snap);
// tools is an array of { name, unregister() } handles.

// In SPAs, call unregister when the route changes:
// tools.forEach(t => t.unregister());
```

### 2. Unregister all tools at once (SPAs)

```ts
import { registerAhtmlTools, unregisterAll } from '@ahtmljs/webmcp';

registerAhtmlTools(snap);

// On route change:
unregisterAll();
```

### 3. Bookmarklet — inspect any AHTML-enabled page

The bookmarklet works in any browser, with or without the Chrome 149 origin trial. It reads `window.__AHTML_TOOLS__` (populated automatically by `registerAhtmlTools()`) and renders a floating inspector panel.

```ts
import { getBookmarkletHref, getBookmarkletSource } from '@ahtmljs/webmcp/bookmarklet';

// Get a javascript: URI to paste into a browser bookmark:
console.log(getBookmarkletHref());

// Or embed the bookmarklet in a docs page:
const link = document.createElement('a');
link.href = getBookmarkletHref();
link.textContent = 'AHTML Inspector';
document.body.appendChild(link);
```

Drag the link to your bookmarks bar, then click it on any page that uses `@ahtmljs/webmcp` to see all registered tools, their cost annotations, and auth requirements.

## Chrome 149 Origin Trial

To enable the native WebMCP API in Chrome 149+, register at:
https://developer.chrome.com/origintrials/#/trials/webmcp

`@ahtmljs/webmcp` detects both proposed API shapes (`navigator.ml.tools.register` and `window.registerMCPTool`) automatically and falls back to `window.__AHTML_TOOLS__` when neither is present.

## License

MIT
