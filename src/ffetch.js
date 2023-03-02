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
  const { chunks, fetch } = context;
  for (let offset = 0, total = Infinity; offset < total; offset += chunks) {
    const resp = await fetch(`${url}?offset=${offset}&limit=${chunks}`);
    if (resp.ok) {
      const json = await resp.json();
      total = json.total;
      for (const entry of json.data) yield entry;
    } else {
      return;
    }
  }
}

// Operations

function chunks(upstream, context, chunks) {
  context.chunks = chunks;
  return upstream;
}

async function* skip(upstream, skip) {
  let skipped = 0;
  for await (const entry of upstream) {
    if (skipped < skip) {
      skipped += 1;
    } else {
      yield entry;
    }
  }
}

async function* limit(upstream, limit) {
  let yielded = 0;
  for await (const entry of upstream) {
    yield entry;
    yielded += 1;
    if (yielded === limit) {
      return;
    }
  }
}

async function* map(upstream, fn) {
  for await (let entry of upstream) {
    entry = await fn(entry);
    if (entry) yield entry;
  }
}

function filter(upstream, fn) {
  return map(upstream, (entry) => (fn(entry) ? entry : null));
}

function slice(upstream, from, to) {
  return limit(skip(upstream, from), to - from);
}

function follow(upstream, name, context) {
  const { fetch, parseHtml } = context;
  return map(upstream, async (entry) => {
    const value = entry[name];
    if (value) {
      const resp = await fetch(value);
      return { ...entry, [name]: resp.ok ? parseHtml(await resp.text()) : null };
    }
    return entry;
  });
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

// helper

function assignOperations(generator, context) {
  function createOperation(fn) {
    return (...rest) => assignOperations(fn.apply(null, [generator, ...rest, context]), context);
  }
  return Object.assign(generator, {
    chunks: chunks.bind(null, generator, context),
    skip: createOperation(skip),
    limit: createOperation(limit),
    slice: createOperation(slice),
    map: createOperation(map),
    filter: createOperation(filter),
    follow: createOperation(follow),
    all: all.bind(null, generator),
    first: first.bind(null, generator),
  });
}

export default function ffetch(
  url,
  fetch = window.fetch,
  parseHtml = (html) => new window.DOMParser().parseFromString(html, 'text/html'),
) {
  let chunks = 255;

  try {
    if ('connection' in window.navigator && window.navigator.connection.saveData === true) {
      // request smaller chunks in save data mode
      chunks = 64;
    }
  } catch (e) { /* ignore */ }

  const context = { chunks, fetch, parseHtml };

  return assignOperations(request(url, context), context);
}
