# init fixtures — the networked e2e

The offline suite (tests/ux/init-e2e.test.ts) creates its fixture apps in a
temp dir per test; nothing is vendored here.

TODO (CI, networked): the full ROADMAP T3.2 acceptance run —
`npx create-next-app` → `npx @ahtmljs/cli init` → `npm install` →
`npm run dev` → `npx @ahtmljs/cli doctor http://localhost:3000` exits 0 —
belongs in a scheduled GitHub Actions workflow with network + a 10-minute
wall-clock assertion. It is deliberately NOT in the offline suite: it needs
registry access and a live dev server.
