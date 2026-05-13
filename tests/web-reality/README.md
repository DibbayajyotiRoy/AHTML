# Web-reality test corpus

Real-world HTML samples — Shopify-like product pages, WordPress blog posts,
news articles, GitHub repos, SaaS dashboards, docs sites — against which
we test AHTML's extraction quality and token-reduction promises.

## What's here

Eight realistic HTML samples covering the archetypes AHTML targets:

| File | Archetype | Source pattern |
|---|---|---|
| `shopify-product.html` | E-commerce product detail | Shopify-rendered product with full JSON-LD + OG |
| `wp-blog-post.html` | WordPress blog | WP article + author + comments |
| `news-article.html` | News (NYT/Verge/Reuters-style) | NewsArticle JSON-LD + heavy chrome |
| `wikipedia-style.html` | Reference encyclopedia | Article with TOC + references |
| `github-repo.html` | Code hosting | Repo overview with stats + README preview |
| `notion-style.html` | Workspace doc | Block-structured doc page |
| `saas-dashboard.html` | App UI | Sidebar + table + actions |
| `docs-site.html` | Technical documentation | Docs page with anchors |

Each file is **realistic but anonymized** — actual structural patterns and
metadata you'd find in the wild, with fictional content. Committed to the
repo so tests are reproducible offline.

## What the tests assert

| Metric | Target | Why |
|---|---|---|
| **Extraction success** | ≥7 of 8 samples produce ≥1 entity | "Works on the actual web" claim |
| **Schema.org JSON-LD coverage** | ≥5 of 8 yield a typed Product / Document via `extractFromSchemaOrg` | Level-0 adoption path is real |
| **OpenGraph fallback** | ≥6 of 8 yield ≥1 entity via `extractFromOpenGraph` | Backup extractor works |
| **Token reduction** | AHTML compact is ≥4× fewer tokens than raw HTML (median across corpus) | The headline marketing claim |
| **Validator** | Every extracted snapshot passes `validate()` with no errors | We don't ship broken extractions |
| **Parser resilience** | Zero thrown exceptions across all 8 samples | Extractor handles real-world HTML weirdness |

Run:

```bash
npm run test:web-reality
```

## Adding more samples

To expand the corpus without bloating the repo:

1. Fetch a real page: `curl -s https://example.com/some-page > tests/web-reality/corpus/<archetype>.html`
2. Strip anything proprietary (names, IDs, copyrighted strings)
3. Add it to the table above
4. The existing tests will pick it up automatically (they glob `corpus/*.html`)

## Why this matters

Synthetic corpus testing proves the code works *in a lab*. Production
HTML is horrifying — duplicated metadata, malformed JSON-LD, contradictory
OG tags, hydration artifacts, infinite DOM depth, anti-bot markup.

Without web-reality testing, our "works on the web" claim is
*controlled-lab strong*, not *battlefield strong*.

This corpus is the bridge.
