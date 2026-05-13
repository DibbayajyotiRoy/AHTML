/**
 * Web-reality extraction tests.
 *
 * Asserts the extractors handle realistic in-the-wild HTML samples without
 * exceptions, produce typed entities, and that the AHTML representation
 * is meaningfully smaller than the source.
 *
 * If this suite fails: a real-world HTML pattern broke our extractor.
 * Fix the extractor, do NOT relax the corpus.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot, toCompact, validate } from '@ahtmljs/schema';
import { extractFromSchemaOrg, extractFromOpenGraph, mergeExtractions } from '@ahtmljs/next/extractors';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, '..', 'corpus');

function loadCorpus(): Array<{ id: string; html: string }> {
  return readdirSync(CORPUS)
    .filter((f) => f.endsWith('.html'))
    .map((f) => ({ id: basename(f, '.html'), html: readFileSync(join(CORPUS, f), 'utf8') }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

describe('web-reality — extraction across realistic HTML samples', () => {
  const corpus = loadCorpus();

  test('the corpus has at least 6 samples covering different archetypes', () => {
    assert.ok(corpus.length >= 6, `expected ≥6 corpus files; got ${corpus.length}: ${corpus.map((c) => c.id).join(', ')}`);
  });

  test('no extractor throws on any corpus sample (resilience to real-world HTML)', () => {
    for (const { id, html } of corpus) {
      assert.doesNotThrow(() => extractFromSchemaOrg(html), `extractFromSchemaOrg threw on ${id}`);
      assert.doesNotThrow(() => extractFromOpenGraph(html), `extractFromOpenGraph threw on ${id}`);
    }
  });

  test('schema.org extractor finds ≥1 entity in ≥5 of the samples', () => {
    let hits = 0;
    const details: string[] = [];
    for (const { id, html } of corpus) {
      const ex = extractFromSchemaOrg(html);
      details.push(`${id}: ${ex.entities.length} entities`);
      if (ex.entities.length > 0) hits++;
    }
    console.log('    ' + details.join(' | '));
    assert.ok(
      hits >= 5,
      `expected ≥5 corpus samples to yield ≥1 schema.org entity; got ${hits}`,
    );
  });

  test('OpenGraph extractor finds ≥1 entity in ≥6 of the samples', () => {
    let hits = 0;
    for (const { html } of corpus) {
      const ex = extractFromOpenGraph(html);
      if (ex.entities.length > 0) hits++;
    }
    assert.ok(
      hits >= 6,
      `expected ≥6 corpus samples to yield ≥1 OG entity; got ${hits}`,
    );
  });

  test('every extracted entity passes validation', () => {
    for (const { id, html } of corpus) {
      const merged = mergeExtractions([extractFromSchemaOrg(html), extractFromOpenGraph(html)]);
      if (merged.entities.length === 0) continue;
      const snap = snapshot(`https://web.example/${id}`, 'document').add(...merged.entities).build();
      const errors = validate(snap).filter((i) => i.severity === 'error');
      assert.deepEqual(errors, [], `validation errors for ${id}: ${JSON.stringify(errors)}`);
    }
  });

  test('AHTML compact form is ≥3× smaller than source HTML (median across corpus)', () => {
    const ratios: number[] = [];
    for (const { id, html } of corpus) {
      const merged = mergeExtractions([extractFromSchemaOrg(html), extractFromOpenGraph(html)]);
      if (merged.entities.length === 0) {
        console.log(`    ${id}: skipped (no entities extracted)`);
        continue;
      }
      const snap = snapshot(`https://web.example/${id}`, 'document').add(...merged.entities).build();
      const compact = toCompact(snap);
      const ratio = html.length / compact.length;
      ratios.push(ratio);
      console.log(`    ${id}: HTML=${html.length}B, AHTML=${compact.length}B (${ratio.toFixed(1)}×)`);
    }
    ratios.sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)]!;
    console.log(`    median ratio: ${median.toFixed(1)}×`);
    assert.ok(
      median >= 3,
      `median ratio across corpus should be ≥3×; got ${median.toFixed(2)}×`,
    );
  });
});
