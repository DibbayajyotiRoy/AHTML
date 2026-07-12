export default function Problem() {
  return (
    <section className="section">
      <div className="container">
        <div className="kicker">The problem</div>
        <h2 style={{ marginTop: 12, marginBottom: 48, maxWidth: 18 + 'ch' }}>
          The agent web's HTML problem.
        </h2>
        <div className="grid cols-3">
          <div className="card">
            <div className="step">01 · Tokens</div>
            <h3>Massive semantic noise.</h3>
            <p>
              A typical product page ships 80 to 300 KB of nav, footer, tracking,
              and ad chrome. Less than 1% is the part an agent needs. Every
              token burned is paid for.
            </p>
          </div>
          <div className="card">
            <div className="step">02 · Meaning</div>
            <h3>Intent is implicit.</h3>
            <p>
              Schema.org describes <em>what</em> something is. It does not
              describe what you can <em>do</em> with it: cost, reversibility,
              side effects, auth, freshness. Agents guess.
            </p>
          </div>
          <div className="card">
            <div className="step">03 · Safety</div>
            <h3>No action contract.</h3>
            <p>
              A delete button and a $50,000 wire transfer look identical to a
              crawler. Without typed cost, reversibility, and confirmation,
              autonomous agents are one prompt injection from disaster.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
