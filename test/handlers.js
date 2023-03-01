import { rest } from 'msw';

export default [
  rest.get('https://test.data/555-simple-entries.json', (req, res, ctx) => {
    const { url } = req;
    const offset = parseInt(url.searchParams.get('offset'), 10);
    const limit = parseInt(url.searchParams.get('limit'), 10);
    const data = Array.from(
      { length: offset + limit < 555 ? limit : 555 - offset },
      (_, i) => ({ title: `Entry ${offset + i}` }),
    );
    const respsonse = {
      total: 555, offset, limit, data,
    };

    return res(ctx.status(200, 'OK'), ctx.json(respsonse));
  }),
  rest.get('https://test.data/not-found.json', (req, res, ctx) => res(ctx.status(404, 'Not Found'))),
];
