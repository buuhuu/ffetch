/* eslint-disable no-undef */
import nodeFetch from 'node-fetch';
import assert from 'node:assert/strict';
import { parseDocument } from 'htmlparser2';
import ffetch from '../src/ffetch.js';
import server from './server.js';

describe('ffetch', () => {
  // wrap fetch to make all calls absolute
  const fetch = (url) => url.charAt(0) === '/'
    ? nodeFetch(`https://test.data${url}`)
    : nodeFetch(url);

  let requestCount = 0;

  before(() => {
    server.listen()
    server.events.on('request:start', () => requestCount += 1);
  });
  after(() => {
    server.close()
  });
  afterEach(() => {
    server.resetHandlers()
    requestCount = 0;
  });

  it('returns a generator for all entries', async () => {
    const entries = ffetch('/555-simple-entries.json', fetch);
    let i = 0;
    for await (const entry of entries) {
      assert.deepStrictEqual(entry, { title: `Entry ${i}` });
      i += 1;
    }
    assert.equal(555, i);
    assert.equal(3, requestCount);
  });

  describe('failure hanlding', () => {

    it('returns an empty generator for a 404', async () => {
      const entries = ffetch('/not-found.json', fetch);
      /* eslint-disable-next-line no-unused-vars */
      for await (const entry of entries) assert(false);
    });

    it('returns an empty array for a 404', async () => {
      const entries = await ffetch('/not-found.json', fetch).all();
      assert.equal(entries.length, 0);
    });

    it('returns null for the first enrty of a 404', async () => {
      const entry = await ffetch('/not-found.json', fetch).first();
      assert.equal(null, entry);
    });

  })

  describe('operations', () => {

    describe('chunks', () => {

      it('returns a generator for all entries with custom chunk size', async () => {
        const entries = ffetch('/555-simple-entries.json', fetch).chunks(1000);
        let i = 0;
        for await (const entry of entries) {
          assert.deepStrictEqual(entry, { title: `Entry ${i}` });
          i += 1;
        }
        assert.equal(555, i);
        assert.equal(1, requestCount);
      });

    })

    describe('map', () => {

      it('returns a generator that maps each entry', async () => {
        const entries = ffetch('/555-simple-entries.json', fetch)
          .map(({ title }) => title);
        let i = 0;
        for await (const entry of entries) {
          assert.equal(entry, `Entry ${i}`);
          i += 1;
        }
        assert.equal(555, i);
      });

      it('returns the first enrty after applying multiple mappings', async () => {
        const entry = await ffetch('/555-simple-entries.json', fetch)
          .map(({ title }) => title)
          .map(title => title.toUpperCase())
          .first();

        assert.equal(entry, 'ENTRY 0');
      });

    })

    describe('filter', () => {

      it('returns a generator that filters entries', async () => {
        const expectedEntries = ['Entry 99', 'Entry 199', 'Entry 299', 'Entry 399', 'Entry 499'];
        const entries = ffetch('/555-simple-entries.json', fetch)
          .filter(({ title }) => expectedEntries.indexOf(title) >= 0);
        let i = 0;
        for await (const entry of entries) {
          assert.equal(entry.title, expectedEntries[i]);
          i += 1;
        }
        assert.equal(5, i);
      });

      it('returns the first enrty after multiple filters', async () => {
        const entry = await ffetch('/555-simple-entries.json', fetch)
          .filter(({ title }) => title.indexOf('9') > 0)
          .filter(({ title }) => title.indexOf('8') > 0)
          .filter(({ title }) => title.indexOf('4') > 0)
          .first();

        assert.deepStrictEqual(entry, { title: 'Entry 489' });
      });

    })

    describe('limit', () => {

      it('returns a generator for a limited set entries', async () => {
        const entries = ffetch('/555-simple-entries.json', fetch)
          .limit(10);
        let i = 0;
        for await (const entry of entries) {
          assert.deepStrictEqual(entry, { title: `Entry ${i}` });
          i += 1;
        }
        assert.equal(10, i);
      });

      it('returns an array of all entries', async () => {
        const entries = await ffetch('/555-simple-entries.json', fetch)
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

    })

    describe('slice', () => {

      it('returns a generator that filters a sliced set of entries', async () => {
        const expectedEntries = ['Entry 99', 'Entry 199', 'Entry 299', 'Entry 399', 'Entry 499'];
        const entries = ffetch('/555-simple-entries.json', fetch)
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
        const entries = await ffetch('/555-simple-entries.json', fetch)
          .slice(300, 305)
          .all();

        assert.deepStrictEqual(entries, [
          { title: 'Entry 300' },
          { title: 'Entry 301' },
          { title: 'Entry 302' },
          { title: 'Entry 303' },
          { title: 'Entry 304' },
        ]);

        assert.equal(2, requestCount);
      });

    })

    describe('follow', () => {
      it('returns the html parsed as document when following a reference', async () => {
        const entry = await ffetch('/one-entry-with-a-reference.json', fetch, parseDocument)
          .follow('path')
          .first();

        assert(entry);
      });

      it('returns null if the reference does not exist', async () => {
        const entry = await ffetch('/one-entry-with-a-reference.json', fetch, parseDocument)
          .follow('reference')
          .first();

        assert(!entry);
      });

      it('returns null if the referenced document is not found', async () => {
        const entry = await ffetch('/one-entry-with-a-none-existing-reference.json', fetch, parseDocument)
          .follow('reference')
          .first();

        assert(!entry);
      });
    })

  })
});
