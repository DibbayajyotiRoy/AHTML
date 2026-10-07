import posthog from 'posthog-js';

// Client-only: Next runs this file in the browser, never during `next build` or SSR.
// The key is a public ingestion key (safe to ship). Events go through the /ingest
// rewrite in next.config.mjs (EU region) so ad blockers don't drop them.
// Docs: https://posthog.com/docs/libraries/next-js
if (process.env.NODE_ENV === 'production') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY ?? 'phc_qyHT2aRErEuTFcwGZyjju6izT2EfEUWEApqtjigLPAGH', {
    api_host: '/ingest',
    ui_host: 'https://eu.posthog.com',
    defaults: '2026-05-30', // pageviews on history change (App Router navigation)
    persistence: 'memory', // no cookies or browser storage (so no consent banner); GeoIP still works
    respect_dnt: true,
    person_profiles: 'identified_only',
    disable_session_recording: true,
    capture_heatmaps: true,
    capture_performance: { web_vitals: true },
    // Runs before the first $pageview, so every web event carries `site`.
    loaded: (ph) => ph.register({ site: 'ahtml-landing' }),
  });
}
