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

async function* request({
  url, offset, chunks, skip, limit, filter, map, fetch,
}) {
  let yielded = 0;
  let skipped = 0;
  let appliedOffset = offset;
  while (yielded < limit) {
    const resp = await fetch(`${url}?offset=${appliedOffset}&limit=${chunks}`);
    if (resp.ok) {
      const { total, data } = await resp.json();
      for (let entry of data) {
        if (!filter || filter(entry)) {
          if (map) {
            entry = await map(entry);
          }
          if (entry) {
            // we have to skip manually as slice(from, to) should apply after
            // any filter
            if (skipped < skip) {
              skipped += 1;
            } else {
              yield entry;
              yielded += 1;
              if (yielded === limit) {
                // done early
                return;
              }
            }
          }
        }
      }
      if (data.length === chunks && offset + chunks < total) {
        // request more
        appliedOffset += chunks;
      } else {
        // done
        return;
      }
    } else {
      // todo: do we need error handling?
      return;
    }
  }
}

// Operations

function chunks(context, chunks) {
  return createGenerator({ ...context, chunks });
}

function limit(context, limit) {
  return createGenerator({ ...context, limit });
}

function map(context, fn) {
  return createGenerator({
    ...context,
    map: context.map
      ? async (entry) => fn(await context.map(entry))
      : fn,
  });
}

function filter(context, fn) {
  return createGenerator({
    ...context,
    filter: context.filter
      ? (entry) => context.filter(entry) && fn(entry)
      : fn,
  });
}

function slice(context, from, to) {
  return createGenerator({ ...context, skip: from, limit: to - from });
}

function follow(context, name) {
  return map(context, async (entry) => {
    const value = entry[name];
    if (value) {
      const resp = await context.fetch(value);
      if (resp.ok) {
        const html = await resp.text();
        return context.parseHtml(html);
      }
    }
    return null;
  });
}

async function all(context) {
  const result = [];
  for await (const entry of request(context)) {
    result.push(entry);
  }
  return result;
}

async function first(context) {
  /* eslint-disable-next-line no-unreachable-loop */
  for await (const entry of request(context)) {
    return entry;
  }
  return null;
}

// helper

function createGenerator(context) {
  // create the generator and assign additional operations 
  return Object.assign(request(context), {
    chunks: chunks.bind(null, context),
    limit: limit.bind(null, context),
    map: map.bind(null, context),
    filter: filter.bind(null, context),
    slice: slice.bind(null, context),
    follow: follow.bind(null, context),
    all: all.bind(null, context),
    first: first.bind(null, context),
  });
}

export default function ffetch(
  url, 
  fetch = window.fetch, 
  parseHtml = (html) => new window.DOMParser().parseFromString(html, 'text/html')
) {
  let chunks = 255;

  try {
    if ('connection' in window.navigator && window.navigator.connection.saveData === true) {
      // request smaller chunks in save data mode
      chunks = 64;
    }
  } catch (e) { /* ignore */ }

  return createGenerator({
    fetch, parseHtml, url, offset: 0, skip: 0, chunks, limit: Infinity,
  });
}
