import { DEMO_PRODUCTS } from '@/lib/snapshots';

export default function DemoStrip() {
  return (
    <section className="section" id="demo">
      <div className="container">
        <div className="kicker">Live demo</div>
        <h2 style={{ marginTop: 12, marginBottom: 12 }}>Four products. Eight endpoints each.</h2>
        <p className="lede" style={{ marginBottom: 0 }}>
          Each card below is a real Next.js route on this site. Click it to see
          the regular HTML view. Then append <code className="inline">/ahtml/</code>{' '}
          to the URL to see the same data as a typed snapshot. Or fetch it with{' '}
          <code className="inline">Accept: application/ahtml+text</code>.
        </p>
        <div className="demo-grid">
          {DEMO_PRODUCTS.map((p) => (
            <a key={p.id} href={`/demo/products/${p.id}`} className="demo-card">
              <div className="swatch" />
              <h4>{p.name}</h4>
              <span className="price">${p.price.toLocaleString()}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
