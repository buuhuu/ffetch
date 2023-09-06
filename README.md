# `ffetch` – `fetch` for Franklin

`ffetch` is a small wrapper around the JavaScript `fetch` function that helps you deal with the Franklin Content API when
building a composable application. It makes it easy to `fetch` content from 
[a Franklin Index](https://www.hlx.live/developer/indexing), apply lazy pagination, follow links to pages, and even pull
[page metadata](https://www.hlx.live/developer/block-collection/metadata). With `ffetch` you get all the ease of creating
a headless application without the peformance baggage of headless SDKs and the complexity of headless APIs.

## Why `ffetch`?

- minimal: less than [200 lines of code](https://github.com/Buuhuu/ffetch/blob/main/src/ffetch.js)
- dependency free, just copy it into your project
- high performance: uses your browser cache
- works in browsers and node.js
- fun to use

## Usage

Check the [tests for detailed examples](https://github.com/Buuhuu/ffetch/blob/main/test/ffetch.js):

### Get Entries from an Index

```javascript
const entries = ffetch('/query-index.json');
let i = 0;
for await (const entry of entries) {
  console.log(entry.title);
}
```

`ffetch` will return a generator, so you can just iterate over the return value. If pagination is necessary, `ffetch` will
fetch additional pages from the server as you exhaust the available records.

### Get the first entry

```javascript
console.log(await ffetch('/query-index.json').first());
```

### Get all entries as an array (so you can `.map` and `.filter`)

Using `.all()` you can change the return value from a generator to a plain array.

```javascript
const allentries = await ffetch('/query-index.json').all();
allentries.forEach((e) => {
  console.log(e);
});
```

But if you prefer to use `.map` and `.filter`, you can do this right on the generator:

```javascript
const someentries = ffetch('/query-index.json')
  .map({title} => title)
  .filter(title => title.indexOf('Franklin'));
for await (title of someentries) {
  console.log(title);
}
```

### Tune performance with `.chunks` and `.limit`

If you want to control the size of the chunks that are loaded using pagination, use `ffetch(...).chunks(100)`.

To limit the result set based on the number of entries you need to show on the page, use `ffetch(...).limit(5)`. The `limit()`
applies after all `.filter()`s, so it is an effective way to only process what needs to be shown.

If you need to skip a couple of entries, then `.slice(start, end)` is your friend. It works exactly like 
[`Array.prototype.slice()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice)

### Work with multi-sheets

Franklin JSON resources can contain multiple sheets. With `.sheet(name)` you can specify, which sheet you want to access.

```javascript
const entries = ffetch('/query-index.json')
  .sheet('products');
let i = 0;
for await (const entry of entries) {
  console.log(entry.sku);
}
```

### Work with HTML pages

In Franklin, the Hypertext is the API, so you can get a [Document](https://developer.mozilla.org/en-US/docs/Web/API/Document) for
each HTML document referenced from an index sheet.

```javascript
const docs = ffetch('/query-index.json')
  .follow('path') // assumes that the path property holds the reference to our document
  .map(d => d.querySelector('img')) // get the first image
  .filter(i => !!i) // drop entries that don't have an image
  .limit(10); // that's enough
  
for await (const img of docs) {
  document.append(img); // take the image from the linked document and place it here
}
```
