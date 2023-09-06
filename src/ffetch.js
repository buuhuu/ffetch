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

async function* request(url, context) {
  const { chunks, sheet, fetch } = context;
  for (let offset = 0, total = Infinity; offset < total; offset += chunks) {
    const params = new URLSearchParams(`offset=${offset}&limit=${chunks}`);
    if (sheet) params.append('sheet', sheet);
    const resp = await fetch(`${url}?${params.toString()}`);
    if (resp.ok) {
      const json = await resp.json();
      total = json.total;
      for (const entry of json.data) yield entry;
    } else {
      return;
    }
  }
}

// Operations:

function withFetch(upstream, context, fetch) {
  context.fetch = fetch;
  return upstream;
}

function withHtmlParser(upstream, context, parseHtml) {
  context.parseHtml = parseHtml;
  return upstream;
}

function chunks(upstream, context, chunks) {
  context.chunks = chunks;
  return upstream;
}

function sheet(upstream, context, sheet) {
  context.sheet = sheet;
  return upstream;
}

async function* skip(upstream, context, skip) {
  let skipped = 0;
  for await (const entry of upstream) {
    if (skipped < skip) {
      skipped += 1;
    } else {
      yield entry;
    }
  }
}

async function* limit(upstream, context, limit) {
  let yielded = 0;
  for await (const entry of upstream) {
    yield entry;
    yielded += 1;
    if (yielded === limit) {
      return;
    }
  }
}

async function* map(upstream, context, fn, maxInFlight = 5) {
  const promises = [];
  for await (let entry of upstream) {
    promises.push(fn(entry));
    if (promises.length === maxInFlight) {
      for (entry of promises) {
        entry = await entry;
        if (entry) yield entry;
      }
      promises.splice(0, promises.length);
    }
  }
  for (let entry of promises) {
    entry = await entry;
    if (entry) yield entry;
  }
}

async function* filter(upstream, context, fn) {
  for await (const entry of upstream) {
    if (fn(entry)) {
      yield entry;
    }
  }
}

function slice(upstream, context, from, to) {
  return limit(skip(upstream, context, from), context, to - from);
}

function follow(upstream, context, name, maxInFlight = 5) {
  const { fetch, parseHtml } = context;
  return map(upstream, context, async (entry) => {
    const value = entry[name];
    if (value) {
      const resp = await fetch(value);
      return { ...entry, [name]: resp.ok ? parseHtml(await resp.text()) : null };
    }
    return entry;
  }, maxInFlight);
}

async function all(upstream) {
  const result = [];
  for await (const entry of upstream) {
    result.push(entry);
  }
  return result;
}

async function first(upstream) {
  /* eslint-disable-next-line no-unreachable-loop */
  for await (const entry of upstream) {
    return entry;
  }
  return null;
}

// Helper

function assignOperations(generator, context) {
  // operations that return a new generator
  function createOperation(fn) {
    return (...rest) => assignOperations(fn.apply(null, [generator, context, ...rest]), context);
  }
  const operations = {
    skip: createOperation(skip),
    limit: createOperation(limit),
    slice: createOperation(slice),
    map: createOperation(map),
    filter: createOperation(filter),
    follow: createOperation(follow),
  };

  // functions that either return the upstream generator or no generator at all
  const functions = {
    chunks: chunks.bind(null, generator, context),
    all: all.bind(null, generator, context),
    first: first.bind(null, generator, context),
    withFetch: withFetch.bind(null, generator, context),
    withHtmlParser: withHtmlParser.bind(null, generator, context),
    sheet: sheet.bind(null, generator, context),
  };

  return Object.assign(generator, operations, functions);
}

export default function ffetch(url) {
  let chunks = 255;
  const fetch = (...rest) => window.fetch.apply(null, rest);
  const parseHtml = (html) => new window.DOMParser().parseFromString(html, 'text/html');

  try {
    if ('connection' in window.navigator && window.navigator.connection.saveData === true) {
      // request smaller chunks in save data mode
      chunks = 64;
    }
  } catch (e) { /* ignore */ }

  const context = { chunks, fetch, parseHtml };
  const generator = request(url, context);

  return assignOperations(generator, context);
}
