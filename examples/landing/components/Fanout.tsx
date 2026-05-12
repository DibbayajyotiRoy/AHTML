export default function Fanout() {
  return (
    <section className="section">
      <div className="container">
        <div className="kicker">The solution</div>
        <h2 style={{ marginTop: 12, marginBottom: 32 }}>
          One source. Every protocol downstream.
        </h2>
        <p className="lede" style={{ marginBottom: 32 }}>
          AHTML compiles to every existing agent-web standard. You don't pick
          a side. You don't run a parallel server. You don't migrate.
        </p>
        <pre className="fanout">{`   your page (Next.js / Vite / SvelteKit / Astro / Nuxt / Remix)
            │
            ▼
   ┌─────────────────────────┐
   │     @ahtmljs/next         │   one plugin · zero migration
   └────────────┬────────────┘
                │
   ┌────────────┼────────────┬────────────┬────────────┐
   │            │            │            │            │
   ▼            ▼            ▼            ▼            ▼
 HTML       /ahtml/*    /ahtml/      /ahtml/        /llms.txt
 (browsers) (compact)   mcp.json     openapi.json
            (json)
                │            │            │            │
                ▼            ▼            ▼            ▼
            agents       Claude·     REST clients   Cursor·
            (100×        ChatGPT·    codegen        Continue·
             cheaper)    Gemini·                    Cline
                         Cursor·
                         Copilot                              `}</pre>
      </div>
    </section>
  );
}
