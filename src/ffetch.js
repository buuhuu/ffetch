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

async function* request({ url, offset, chunks, limit, filter, map, fetch }) {
    while (offset < limit) {
        if (offset + chunks > limit) {
            // request only as many items as fit into the requested limit
            chunks = limit - offset;
        }

        const resp = await fetch(`${url}?offset=${offset}&limit=${chunks}`);

        if (resp.ok) {
            const { total, data } = await resp.json();
            for (let entry of data) {
                if (!filter || filter(entry)) {
                    if (map) {
                        entry = await map(entry);
                    }
                    yield entry;
                }
            }

            if (data.length == chunks && offset + chunks < total) {
                // request more
                offset += chunks;
            } else {
                // done
                return
            }
        } else {
            // todo: do we need error handling?
            return;
        }
    }
}

function createGenerator(context) {
    // create the generator
    const generator = request(context);
    // create the map of supported operations
    const operations = {
        limit: (limit) => createGenerator({ ...context, limit }),
        map: (map) => createGenerator({ ...context, map }),
        filter: (filter) => createGenerator({ ...context, filter }),
        slice: (from, to) => createGenerator({ ...context, offset: from, limit: to }),

        all: async () => {
            const result = [];
            for await (const entry of request(context)) {
                result.push(entry);
            }
            return result;
        }
    }

    // assign the operations to the generator
    return Object.assign(generator, operations);
}

export default function ffetch(url, fetch = window.fetch) {
    return createGenerator({ fetch, url, offset: 0, chunks: 255, limit: Infinity });
}
