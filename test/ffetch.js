/*
 * Copyright 2023 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
/* eslint-disable no-undef */
import { fetch as adobeFetch } from '@adobe/fetch';
import { promises as fs } from 'node:fs';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { parseDocument } from 'htmlparser2';
import nock from 'nock';
import ffetch from '../src/ffetch.js';

// enforce http/1.1 because nock does not support h2 yet
const testDomain = 'http://example.com';

function mockDocumentRequest(path, body = '<!DOCTYPE html><html><head><title>Document</title></head><body><main><p>Hello World</p></main></body></html>') {
  nock(testDomain).get(path).reply(200, body);
}

function mockIndexRequests(path, total, chunks = 255, generatorFn = (i) => ({ title: `Entry ${i}` })) {
  for (let offset = 0; offset < total; offset += chunks) {
    const data = Array.from(
      { length: offset + chunks < total ? chunks : 555 - offset },
      (_, i) => generatorFn(offset + i),
    );
    const response = {
      total, offset, limit: chunks, data,
    };

    nock(testDomain).get(path).query({ offset, limit: chunks }).reply(200, response);
  }
}

function mockNotFound(path) {
  nock(testDomain).get(path).query(() => true).reply(404);
}

describe('ffetch', () => {
  // wrap fetch to make all calls absolute
  const fetch = (url) => (url.charAt(0) === '/'
    ? adobeFetch(`${testDomain}${url}`)
    : adobeFetch(url));

  it('has no dependencies', async () => {
    const packageJson = await fs.readFile(new URL('../package.json', import.meta.url), { encoding: 'utf-8' });
    const { dependencies } = JSON.parse(packageJson);

    assert(!dependencies || dependencies.length === 0);
  });

  it('returns a generator for all entries', async () => {
    mockIndexRequests('/query-index.json', 555);

    const entries = ffetch('/query-index.json', fetch);
    let i = 0;
    for await (const entry of entries) {
      assert.deepStrictEqual(entry, { title: `Entry ${i}` });
      i += 1;
    }

    assert.equal(555, i);
  });

  describe('failure hanlding', () => {
    it('returns an empty generator for a 404', async () => {
      mockNotFound('/not-found.json');

      const entries = ffetch('/not-found.json', fetch);

      /* eslint-disable-next-line no-unused-vars */
      for await (const entry of entries) assert(false);
    });

    it('returns an empty array for a 404', async () => {
      mockNotFound('/not-found.json');

      const entries = await ffetch('/not-found.json', fetch).all();

      assert.equal(entries.length, 0);
    });

    it('returns null for the first enrty of a 404', async () => {
      mockNotFound('/not-found.json');

      const entry = await ffetch('/not-found.json', fetch).first();

      assert.equal(null, entry);
    });
  });

  describe('operations', () => {
    describe('chunks', () => {
      it('returns a generator for all entries with custom chunk size', async () => {
        mockIndexRequests('/query-index.json', 555, 1000);

        const entries = ffetch('/query-index.json', fetch).chunks(1000);
        let i = 0;
        for await (const entry of entries) {
          assert.deepStrictEqual(entry, { title: `Entry ${i}` });
          i += 1;
        }

        assert.equal(555, i);
      });
    });

    describe('map', () => {
      it('returns a generator that maps each entry', async () => {
        mockIndexRequests('/query-index.json', 555);

        const entries = ffetch('/query-index.json', fetch)
          .map(({ title }) => title);
        let i = 0;
        for await (const entry of entries) {
          assert.equal(entry, `Entry ${i}`);
          i += 1;
        }

        assert.equal(555, i);
      });

      it('returns the first enrty after applying multiple mappings', async () => {
        mockIndexRequests('/query-index.json', 555);

        const entry = await ffetch('/query-index.json', fetch)
          .map(({ title }) => title)
          .map((title) => title.toUpperCase())
          .first();

        assert.equal(entry, 'ENTRY 0');
      });
    });

    describe('filter', () => {
      it('returns a generator that filters entries', async () => {
        mockIndexRequests('/query-index.json', 555);

        const expectedEntries = ['Entry 99', 'Entry 199', 'Entry 299', 'Entry 399', 'Entry 499'];
        const entries = ffetch('/query-index.json', fetch)
          .filter(({ title }) => expectedEntries.indexOf(title) >= 0);
        let i = 0;
        for await (const entry of entries) {
          assert.equal(entry.title, expectedEntries[i]);
          i += 1;
        }

        assert.equal(5, i);
      });

      it('returns the first enrty after multiple filters', async () => {
        mockIndexRequests('/query-index.json', 555);

        const entry = await ffetch('/query-index.json', fetch)
          .filter(({ title }) => title.indexOf('9') > 0)
          .filter(({ title }) => title.indexOf('8') > 0)
          .filter(({ title }) => title.indexOf('4') > 0)
          .first();

        assert.deepStrictEqual(entry, { title: 'Entry 489' });
      });
    });

    describe('limit', () => {
      it('returns a generator for a limited set entries', async () => {
        mockIndexRequests('/query-index.json', 555);

        const entries = ffetch('/query-index.json', fetch)
          .limit(10);
        let i = 0;
        for await (const entry of entries) {
          assert.deepStrictEqual(entry, { title: `Entry ${i}` });
          i += 1;
        }

        assert.equal(10, i);
      });

      it('returns an array of all entries', async () => {
        mockIndexRequests('/query-index.json', 555);

        const entries = await ffetch('/query-index.json', fetch)
          .limit(5)
          .all();

        assert.deepStrictEqual(entries, [
          { title: 'Entry 0' },
          { title: 'Entry 1' },
          { title: 'Entry 2' },
          { title: 'Entry 3' },
          { title: 'Entry 4' },
        ]);
      });
    });

    describe('slice', () => {
      it('returns a generator that filters a sliced set of entries', async () => {
        mockIndexRequests('/query-index.json', 555);

        const expectedEntries = ['Entry 99', 'Entry 199', 'Entry 299', 'Entry 399', 'Entry 499'];
        const entries = ffetch('/query-index.json', fetch)
          .filter(({ title }) => expectedEntries.indexOf(title) >= 0)
          .slice(2, 4);
        let i = 0;
        for await (const entry of entries) {
          assert.equal(entry.title, expectedEntries[i + 2]);
          i += 1;
        }

        assert.equal(2, i);
      });

      it('returns an array of a slice of entries', async () => {
        mockIndexRequests('/query-index.json', 555);

        const entries = await ffetch('/query-index.json', fetch)
          .slice(300, 305)
          .all();

        assert.deepStrictEqual(entries, [
          { title: 'Entry 300' },
          { title: 'Entry 301' },
          { title: 'Entry 302' },
          { title: 'Entry 303' },
          { title: 'Entry 304' },
        ]);
      });
    });

    describe('follow', () => {
      it('returns the html parsed as document when following a reference', async () => {
        mockDocumentRequest('/document');
        mockIndexRequests('/query-index.json', 1, 255, () => ({ path: '/document' }));

        const entry = await ffetch('/query-index.json', fetch, parseDocument)
          .follow('path')
          .first();

        assert(entry);
        assert(entry.path);
      });

      it('returns null if the reference does not exist', async () => {
        mockIndexRequests('/query-index.json', 1, 255, () => ({ ref: '/document' }));

        const entry = await ffetch('/query-index.json', fetch, parseDocument)
          .follow('path')
          .first();

        assert(entry);
        assert(!entry.path);
      });

      it('returns null if the referenced document is not found', async () => {
        mockNotFound('/document');
        mockIndexRequests('/query-index.json', 1, 255, () => ({ path: '/document' }));

        const entry = await ffetch('/query-index.json', fetch, parseDocument)
          .follow('path')
          .first();

        assert(entry);
        assert(!entry.path);
      });
    });
  });

  it('implements array-like semantics for chaining operations', async () => {
    mockIndexRequests('/query-index.json', 555);

    const entries = await ffetch('/query-index.json', fetch)
      .slice(100, 500) // entry 199 to 499
      .map(({ title }) => title) // map to title
      .filter((title) => title.indexOf('99') > 0) // filter now applied on title
      .map((title) => title.toUpperCase()) // map applied on title as well
      .slice(1, 2) // slice of ENTRY 199, ENTRY 299, ENTRY 399
      .all();

    assert.equal(1, entries.length);
    assert.equal('ENTRY 299', entries[0]);
  });
});
