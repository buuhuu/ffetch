import fetch from 'node-fetch';
import assert from 'node:assert/strict';
import ffetch from '../src/ffetch.js';
import { server } from './server.js';

describe('ffetch', () => {
    before(() => server.listen())
    after(() => server.close())
    afterEach(() => server.resetHandlers())

    it('returns an empty generator for a 404', async () => {
        const entries = ffetch('https://test.data/not-found.json', fetch);
        for await (const entry of entries) assert(false);
    });

    it('returns a generator for all entries', async () => {
        const entries = ffetch('https://test.data/555-simple-entries.json', fetch);
        let i = 0;
        for await (const entry of entries) {
            assert.deepStrictEqual(entry, { title: `Entry ${i}`});
            i++;
        }
        assert.equal(555, i)
    });

    it('returns a generator for a limited set entries', async () => {
        const entries = ffetch('https://test.data/555-simple-entries.json', fetch)
            .limit(10);
        let i = 0;
        for await (const entry of entries) {
            assert.deepStrictEqual(entry, { title: `Entry ${i}`});
            i++;
        }
        assert.equal(10, i)
    });

    it('returns a generator that maps each entry', async () => {
        const entries = ffetch('https://test.data/555-simple-entries.json', fetch)
            .map(({ title }) => title);
        let i = 0;
        for await (const entry of entries) {
            assert.equal(entry, `Entry ${i}`);
            i++;
        }
        assert.equal(555, i)
    });

    it('returns a generator that filters entries', async () => {
        const expectedEntries = ['Entry 99', 'Entry 199', 'Entry 299', 'Entry 399', 'Entry 499'];
        const entries = ffetch('https://test.data/555-simple-entries.json', fetch)
            .filter(({ title }) => expectedEntries.indexOf(title) >= 0);
        let i = 0;
        for await (const entry of entries) {
            assert.equal(entry.title, expectedEntries[i]);
            i++;
        }
        assert.equal(5, i)
    });

    it('returns an array of all entries', async () => {
        const entries = await ffetch('https://test.data/555-simple-entries.json', fetch)
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

    it('returns an array of a slice of entries', async () => {
        const entries = await ffetch('https://test.data/555-simple-entries.json', fetch)
            .slice(5, 10)
            .all();
        
        assert.deepStrictEqual(entries, [
            { title: 'Entry 5' },
            { title: 'Entry 6' },
            { title: 'Entry 7' },
            { title: 'Entry 8' },
            { title: 'Entry 9' },
        ]);
    });
})