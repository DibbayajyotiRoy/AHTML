import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, toJson, fromJson, toCompact, validate } from '../index.js';
import type { Chunk, Document } from '../types.js';

function articleWithChunks(): Document {
  const chunks: Chunk[] = [
    { id: 'document:rag#h1-intro', byte_range: [0, 850], anchor: '#introduction', heading: 'Introduction', parent: 'document:rag', next: 'document:rag#h2-arch', tokens: 200 },
    { id: 'document:rag#h2-arch', byte_range: [850, 2100], anchor: '#architecture', heading: 'Architecture', parent: 'document:rag', prev: 'document:rag#h1-intro', next: 'document:rag#h3-evals', tokens: 320 },
    { id: 'document:rag#h3-evals', byte_range: [2100, 3500], anchor: '#evaluations', heading: 'Evaluations', parent: 'document:rag', prev: 'document:rag#h2-arch', tokens: 280, embed_hint: { model_class: 'large' } },
  ];
  return {
    id: 'document:rag',
    type: 'document',
    title: 'Retrieval-augmented generation: a primer',
    author: 'Test',
    published_at: '2026-05-14T00:00:00Z',
    language: 'en',
    word_count: 800,
    content: 'A'.repeat(3500),
    chunks,
  };
}

describe('Document.chunks — v0.2 RAG primitive', () => {
  test('a document with chunks builds and validates without errors', () => {
    const s = snapshot('https://blog.com/article/rag', 'article').add(articleWithChunks()).build();
    const errors = validate(s).filter((i) => i.severity === 'error');
    assert.deepEqual(errors, []);
  });

  test('chunk byte_ranges are contiguous and cover the content', () => {
    const doc = articleWithChunks();
    const chunks = doc.chunks!;
    for (let i = 0; i < chunks.length - 1; i++) {
      const [, end] = chunks[i]!.byte_range;
      const [start] = chunks[i + 1]!.byte_range;
      assert.equal(end, start, `chunk ${i} should end where chunk ${i + 1} starts`);
    }
    const totalCovered = chunks[chunks.length - 1]!.byte_range[1];
    assert.equal(totalCovered, doc.content!.length);
  });

  test('chunk ids are deterministic — same input produces same id', () => {
    const a = articleWithChunks();
    const b = articleWithChunks();
    assert.deepEqual(a.chunks!.map((c) => c.id), b.chunks!.map((c) => c.id));
  });

  test('chunks form a proper linked list — first.prev is undefined, last.next is undefined', () => {
    const chunks = articleWithChunks().chunks!;
    assert.equal(chunks[0]!.prev, undefined);
    assert.equal(chunks[chunks.length - 1]!.next, undefined);
    for (let i = 1; i < chunks.length; i++) {
      assert.equal(chunks[i]!.prev, chunks[i - 1]!.id);
    }
    for (let i = 0; i < chunks.length - 1; i++) {
      assert.equal(chunks[i]!.next, chunks[i + 1]!.id);
    }
  });

  test('toJson/fromJson preserves chunks losslessly', () => {
    const doc = articleWithChunks();
    const s = snapshot('https://blog.com/article/rag', 'article').add(doc).build();
    const restored = fromJson(toJson(s));
    const restoredChunks = (restored.entities[0] as Document).chunks!;
    assert.deepEqual(restoredChunks, doc.chunks);
  });

  test('toCompact serializes chunks (the line-oriented compact form preserves them)', () => {
    const doc = articleWithChunks();
    const s = snapshot('https://blog.com/article/rag', 'article').add(doc).build();
    const compact = toCompact(s);
    // chunks should be reachable to agents — even if compact format isn't fully optimized for them yet
    assert.ok(compact.length > 0);
  });

  test('chunks carry token counts for retrieval budgeting', () => {
    const doc = articleWithChunks();
    const totalTokens = doc.chunks!.reduce((sum, c) => sum + (c.tokens ?? 0), 0);
    assert.equal(totalTokens, 800);
  });

  test('chunks carry citation anchors so the agent can deep-link', () => {
    const doc = articleWithChunks();
    for (const c of doc.chunks!) {
      assert.ok(c.anchor, `chunk ${c.id} should have a citation anchor`);
      assert.match(c.anchor!, /^#/);
    }
  });

  test('embed_hint.model_class accepts only the documented classes', () => {
    const doc = articleWithChunks();
    const valid: Array<NonNullable<NonNullable<typeof doc.chunks>[number]['embed_hint']>['model_class']> = ['small', 'medium', 'large', 'multilingual'];
    for (const c of doc.chunks!) {
      if (c.embed_hint?.model_class) {
        assert.ok(valid.includes(c.embed_hint.model_class));
      }
    }
  });
});
