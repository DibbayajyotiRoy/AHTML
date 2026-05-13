import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, toJson } from '@ahtmljs/schema';
import { AHTMLLoader } from '../index.js';

function mockFetch(snap: Parameters<typeof toJson>[0]) {
  return (async () =>
    new Response(toJson(snap), {
      headers: { 'content-type': 'application/ahtml+json', etag: 'W/"x"' },
    })) as unknown as typeof fetch;
}

describe('AHTMLLoader', () => {
  test('loads a Product snapshot as a single Document', async () => {
    const snap = snapshot('https://shop.com/p/1', 'product_detail')
      .add({
        id: 'product:p1',
        type: 'product',
        name: 'MacBook',
        brand: 'Apple',
        description: 'A laptop.',
        price: { amount: 1999, currency: 'USD' },
      })
      .build();
    const loader = new AHTMLLoader('https://shop.com/p/1', { fetch: mockFetch(snap) });
    const docs = await loader.load();
    assert.equal(docs.length, 1);
    assert.match(docs[0]!.pageContent, /MacBook/);
    assert.equal(docs[0]!.metadata.entity_id, 'product:p1');
    assert.equal(docs[0]!.metadata.source, 'https://shop.com/p/1');
  });

  test('loads a Document with chunks as multiple records (parent + N chunks)', async () => {
    const snap = snapshot('https://blog.com/post', 'article')
      .add({
        id: 'document:post',
        type: 'document',
        title: 'Post Title',
        author: 'Roy',
        content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        chunks: [
          { id: 'document:post#c1', byte_range: [0, 26], anchor: '#intro', heading: 'Intro', parent: 'document:post', next: 'document:post#c2' },
          { id: 'document:post#c2', byte_range: [26, 55], anchor: '#body', heading: 'Body', parent: 'document:post', prev: 'document:post#c1' },
        ],
      })
      .build();
    const loader = new AHTMLLoader('https://blog.com/post', { fetch: mockFetch(snap) });
    const docs = await loader.load();
    // parent + 2 chunks
    assert.equal(docs.length, 3);
    const chunk1 = docs.find((d) => d.metadata.chunk_id === 'document:post#c1')!;
    assert.equal(chunk1.pageContent, 'Lorem ipsum dolor sit amet');
    assert.equal(chunk1.metadata.chunk_anchor, '#intro');
    assert.equal(chunk1.metadata.chunk_heading, 'Intro');
    assert.deepEqual(chunk1.metadata.byte_range, [0, 26]);
  });

  test('filterType limits results to one entity type', async () => {
    const snap = snapshot('https://x.com', 'home')
      .add(
        { id: 'product:a', type: 'product', name: 'A' },
        { id: 'document:b', type: 'document', title: 'B' },
        { id: 'product:c', type: 'product', name: 'C' },
      )
      .build();
    const loader = new AHTMLLoader('https://x.com', { fetch: mockFetch(snap), filterType: 'product' });
    const docs = await loader.load();
    assert.equal(docs.length, 2);
    assert.ok(docs.every((d) => d.metadata.entity_type === 'product'));
  });

  test('includeParent: false skips the parent Document record (chunks only)', async () => {
    const snap = snapshot('https://b.com/p', 'article')
      .add({
        id: 'document:p',
        type: 'document',
        title: 'P',
        content: 'A'.repeat(50),
        chunks: [
          { id: 'document:p#c1', byte_range: [0, 25], parent: 'document:p' },
          { id: 'document:p#c2', byte_range: [25, 50], parent: 'document:p' },
        ],
      })
      .build();
    const loader = new AHTMLLoader('https://b.com/p', { fetch: mockFetch(snap), includeParent: false });
    const docs = await loader.load();
    assert.equal(docs.length, 2);
    assert.ok(docs.every((d) => d.metadata.chunk_id !== undefined));
  });

  test('metadata preserves source URL + entity_id + license for citations', async () => {
    const snap = snapshot('https://x.com/p', 'product_detail')
      .policy({ agents_welcome: true, license: 'CC-BY-4.0' })
      .add({ id: 'product:p', type: 'product', name: 'P' })
      .build();
    const loader = new AHTMLLoader('https://x.com/p', { fetch: mockFetch(snap) });
    const docs = await loader.load();
    assert.equal(docs[0]!.metadata.license, 'CC-BY-4.0');
    assert.equal(docs[0]!.metadata.source, 'https://x.com/p');
    assert.equal(docs[0]!.metadata.entity_id, 'product:p');
  });
});
