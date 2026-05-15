import type { MetadataRoute } from 'next';

const SITE_URL = process.env.SITE_URL ?? 'https://ahtml.dev';

const STATIC_PATHS = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' as const },
  { path: '/about', priority: 0.6, changeFrequency: 'monthly' as const },
  { path: '/contact', priority: 0.5, changeFrequency: 'yearly' as const },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/security', priority: 0.5, changeFrequency: 'monthly' as const },
  { path: '/tools/agent-readiness', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/vs/llms-txt', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/vs/firecrawl', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/vs/schema-org', priority: 0.8, changeFrequency: 'monthly' as const },
];

const FRAMEWORKS = ['next', 'vite', 'sveltekit', 'astro', 'remix'];

const DEMO_PRODUCTS = ['mbp-14-m3', 'mbp-16-m3', 'aw-ultra-2', 'ipad-pro-m4'];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    ...STATIC_PATHS.map(({ path, priority, changeFrequency }) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
    })),
    ...FRAMEWORKS.map((f) => ({
      url: `${SITE_URL}/integrations/${f}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...DEMO_PRODUCTS.map((id) => ({
      url: `${SITE_URL}/demo/products/${id}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
  ];
}
