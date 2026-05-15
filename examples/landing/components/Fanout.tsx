import Image from 'next/image';

export default function Fanout() {
  return (
    <section className="section">
      <div className="container">
        <div className="kicker">The solution</div>
        <h2 style={{ marginTop: 12, marginBottom: 32 }}>
          One source. Every protocol downstream.
        </h2>
        <p className="lede" style={{ marginBottom: 32 }}>
          AHTML compiles to every existing agent-web standard. You don&apos;t pick
          a side. You don&apos;t run a parallel server. You don&apos;t migrate.
        </p>
        <figure className="fanout-figure">
          <Image
            src="/diagram.png"
            alt="AHTML architecture: your page (Next.js, Vite, SvelteKit, Astro, Nuxt, Remix) compiles through the @ahtmljs/next plugin into five outputs — HTML for browsers, /ahtml/* compact + JSON for agents (~100× cheaper), /ahtml/mcp.json for Claude, ChatGPT, Gemini, Cursor, Copilot, /ahtml/openapi.json for REST clients and codegen, and /llms.txt for Cursor, Continue, Cline."
            width={1672}
            height={941}
            sizes="(max-width: 800px) 100vw, 1080px"
            priority={false}
          />
          <figcaption>
            One source · one plugin · zero migration. Every consumer below gets its native format.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
