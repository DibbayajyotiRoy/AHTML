import Header from '@/components/Header';
import Footer from '@/components/Footer';
import DogfoodStrip from '@/components/DogfoodStrip';
import { DEMO_PRODUCTS, productSnapshot } from '@/lib/snapshots';
import { toCompact } from '@ahtml/schema';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return DEMO_PRODUCTS.map((p) => ({ id: p.id }));
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = DEMO_PRODUCTS.find((p) => p.id === id);
  if (!product) notFound();

  const snap = productSnapshot('https://ahtml.dev', product.id)!;
  const compact = toCompact(snap);

  return (
    <>
      <Header />
      <DogfoodStrip />
      <main className="section">
        <div className="container wide">
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48 }}>
            <article>
              <div className="kicker">Demo store · /demo/products/{product.id}</div>
              <h1 style={{ fontSize: 'clamp(40px, 5vw, 72px)', marginTop: 12 }}>{product.name}</h1>
              <p className="lede" style={{ marginTop: 16, marginBottom: 24 }}>
                {product.description}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24 }}>
                <span className="bignum accent">${product.price.toLocaleString()}</span>
                {product.list_price !== product.price && (
                  <span style={{ textDecoration: 'line-through', color: 'var(--ink-3)' }}>
                    ${product.list_price.toLocaleString()}
                  </span>
                )}
              </div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-3)' }}>
                {product.stock_qty} in stock · SKU {product.sku} · rated {product.rating}/5 (
                {product.review_count.toLocaleString()} reviews)
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
                <button>Buy now</button>
                <button className="ghost">Add to cart</button>
              </div>
              <hr style={{ margin: '48px 0' }} />
              <p style={{ color: 'var(--ink-2)' }}>
                This page is a deliberately minimal product detail page wired with
                AHTML. The HTML you see is what a browser renders. The structured
                snapshot on the right is what an agent reads. They came from the
                same source.
              </p>
            </article>
            <aside>
              <div className="kicker">Agent view · /ahtml/demo/products/{product.id}</div>
              <h3 style={{ marginTop: 12, marginBottom: 16, fontFamily: 'var(--font-display)', fontSize: 24 }}>
                What the agent sees
              </h3>
              <pre className="code-block" style={{ fontSize: 12, lineHeight: 1.55 }}>
                {compact}
              </pre>
              <p className="legalish" style={{ marginTop: 12 }}>
                {Buffer.byteLength(compact, 'utf8')} bytes · includes typed
                purchase + add-to-cart actions with cost, reversibility, side
                effects, and confirmation level.
              </p>
              <hr style={{ margin: '24px 0' }} />
              <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                Equivalent endpoints for this product:
              </p>
              <ul style={{ listStyle: 'none', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 2 }}>
                <li>
                  <a href={`/ahtml/demo/products/${product.id}`}>compact text</a>
                </li>
                <li>
                  <a href={`/ahtml/demo/products/${product.id}?fmt=json`}>canonical json</a>
                </li>
                <li>
                  <a href="/ahtml/mcp.json">mcp manifest</a>
                </li>
                <li>
                  <a href="/ahtml/openapi.json">openapi</a>
                </li>
              </ul>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
