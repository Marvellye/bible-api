# Bible API

A free, open-source **static Bible API**. The King James Version — modernised spelling *and* original 1611 spelling — is published as plain JSON files that you fetch straight from a CDN.

There is no server, no database, no API key and no rate limit. Every endpoint below is an ordinary `GET` on a static file, so it works from a browser, a phone, a script in a sandbox, or an offline mirror.

---

## Table of contents

- [Why static JSON](#why-static-json)
- [Quick start](#quick-start)
- [Base URL](#base-url)
- [Endpoints](#endpoints)
- [Response schemas](#response-schemas)
- [Fetching a single verse](#fetching-a-single-verse)
- [Random verses (`random.json`)](#random-verses-randomjson)
- [Book identifiers](#book-identifiers)
- [Versions](#versions)
- [Error handling](#error-handling)
- [Caching and performance](#caching-and-performance)
- [Deploying to jsDelivr](#deploying-to-jsdelivr)
- [Repository layout](#repository-layout)
- [Migrating from the old REST API](#migrating-from-the-old-rest-api)
- [License](#license)

---

## Why static JSON

The previous implementation was an Express server in Node plus a duplicate PHP
implementation. Both are removed. A CDN cannot execute a server, and a static
file layout is strictly better for this problem:

| | Old REST server | This repo |
|---|---|---|
| Hosting | needs a Node/PHP runtime | any static host or CDN |
| Cost | server + hosting | free |
| Rate limits | yes | none |
| API keys | — | none |
| Offline use | no | clone the folder |
| Cold start | per request | CDN edge cache |

---

## Quick start

```bash
# One verse
curl https://cdn.jsdelivr.net/gh/USER/REPO/bible/kjv/john/3/16.json
```

`book` is the slug, `chapter` is a directory, and the file name is the chapter
number. A single verse is selected client-side — see
[Fetching a single verse](#fetching-a-single-verse).

```js
// One chapter, in the browser
const chapter = await fetch(
  'https://cdn.jsdelivr.net/gh/USER/REPO/bible/kjv/john/3.json'
).then(r => r.json());

console.log(chapter.verses[15].text);
// "For God so loved the world, that he gave his only begotten Son, ..."
```

---

## Base URL

Replace `USER` and `REPO` with your own GitHub user and repository name:

```
https://cdn.jsdelivr.net/gh/USER/REPO
```

Pin a commit, tag or branch to guarantee the response never changes under you:

```
https://cdn.jsdelivr.net/gh/USER/REPO@TAG        # a tag
https://cdn.jsdelivr.net/gh/USER/REPO@COMMIT     # a commit SHA (most stable)
```

See [Deploying to jsDelivr](#deploying-to-jsdelivr) for the full details.

---

## Endpoints

| What you want | Path | Returns |
|---|---|---|
| API manifest | `/index.json` | Endpoint templates and version summary |
| All versions | `/bible/versions.json` | Metadata for every translation |
| Book index | `/bible/{version}/books.json` | Every book with chapter/verse counts |
| A whole book | `/bible/{version}/{book}.json` | All chapters and verses |
| One chapter | `/bible/{version}/{book}/{chapter}.json` | All verses in that chapter |
| One verse | `/bible/{version}/{book}/{chapter}/{verse}` | Client-side lookup from the chapter |
| A random verse | `/bible/{version}/random.json` | Shuffled index of every verse |

`{version}` is `kjv` (default) or `kjv1611`.
`{book}` is a lowercase slug — see [Book identifiers](#book-identifiers).
`{chapter}` is a 1-based integer.

### `GET /index.json`

The manifest. Everything else can be discovered from it.

```json
{
  "name": "Bible API",
  "default_version": "kjv",
  "versions_url": "bible/versions.json",
  "endpoints": {
    "versions": "bible/versions.json",
    "books": "bible/{version}/books.json",
    "book": "bible/{version}/{book}.json",
    "chapter": "bible/{version}/{book}/{chapter}.json",
    "verse": "bible/{version}/{book}/{chapter}/{verse}"
  },
  "versions": [
    { "id": "kjv", "name": "King James Version", "books_count": 66, "chapters_count": 1189, "verses_count": 31102 },
    { "id": "kjv1611", "name": "King James Version 1611 (original spelling)", "books_count": 80, "chapters_count": 1355, "verses_count": 36702 }
  ]
}
```

### `GET /bible/versions.json`

An array of version metadata. Each entry carries `books_count`,
`chapters_count`, `verses_count` and the URL templates for that version.

### `GET /bible/{version}/books.json`

The book index for one version, in canonical reading order. Use it to build a
table of contents, or to resolve a display name to a slug.

```json
[
  {
    "id": "genesis",
    "name": "Genesis",
    "testament": "old-testament",
    "chapters": 50,
    "verses": 1533,
    "book_url": "bible/kjv/genesis.json",
    "chapters_url": "bible/kjv/genesis/{chapter}.json"
  },
  {
    "id": "jude",
    "name": "Jude",
    "testament": "new-testament",
    "chapters": 1,
    "verses": 25,
    "book_url": "bible/kjv/jude.json",
    "chapters_url": "bible/kjv/jude/{chapter}.json"
  }
]
```

`testament` is one of `old-testament`, `new-testament` or `apocrypha`.

### `GET /bible/{version}/{book}.json`

The entire book.

```json
{
  "book": "Jude",
  "version": "kjv",
  "chapters": [
    { "chapter": 1, "verses": [ { "verse": 1, "text": "Jude, the servant of Jesus Christ..." } ] }
  ]
}
```

### `GET /bible/{version}/{book}/{chapter}.json`

A single chapter — the endpoint you will use most often.

```json
{
  "book": "John",
  "version": "kjv",
  "chapter": 3,
  "verses": [
    { "verse": 1, "text": "Now when Jesus was in Bethany, in the house of Martha and Mary..." },
    { "verse": 2, "text": "And when he had given thanks, he gave them to his disciples..." }
  ]
}
```

---

## Response schemas

Every file shares one schema, so a single parser handles the whole API.

**Chapter file**

| Field | Type | Notes |
|---|---|---|
| `book` | string | Display name, e.g. `"1 Corinthians"` |
| `version` | string | `"kjv"` or `"kjv1611"` |
| `chapter` | number | 1-based integer |
| `verses` | array | Ordered by verse number |
| `verses[].verse` | number | 1-based integer |
| `verses[].text` | string | The verse text |

**Book file** — same, but without `chapter`, and with `chapters` holding the
per-chapter objects above.

Chapter and verse numbers are **numbers**, not strings, in every version.

> The `kjv1611` text retains the original typography, including the long `ſ`
> and paragraph markers `¶`. They are part of the source text and are left
> untouched.

---

## Fetching a single verse

There is deliberately no per-verse file — 31,000+ extra files would bloat the
repository for a lookup that costs one comparison. Fetch the chapter and select:

```js
const BASE = 'https://cdn.jsdelivr.net/gh/USER/REPO/bible/kjv';

async function verse(book, chapter, n) {
  const data = await fetch(`${BASE}/${book}/${chapter}.json`).then(r => r.json());
  return data.verses.find(v => v.verse === n);
}

const v = await verse('john', 3, 16);
console.log(v.text);
```

```python
import requests

BASE = "https://cdn.jsdelivr.net/gh/USER/REPO/bible/kjv"

def verse(book, chapter, n):
    data = requests.get(f"{BASE}/{book}/{chapter}.json").json()
    return next(v for v in data["verses"] if v["verse"] == n)

print(verse("john", 3, 16)["text"])
```

For verse ranges, filter once:

```js
const chapter = await fetch(`${BASE}/psalms/23.json`).then(r => r.json());
const range = chapter.verses.filter(v => v.verse >= 1 && v.verse <= 6);
```

To batch many requests, fetch the whole book instead —
`${BASE}/psalms.json` is one request and already contains everything.

---

## Random verses (`random.json`)

### Read this first: a static file cannot be random

`/bible/kjv/random.json` is **not** a random verse. It is the *same bytes for
every caller, forever*, because that is what a file on a CDN is. Fetching it
twice gives you two identical responses.

What it does give you is the thing you actually want: **a random verse, chosen
by your client, uniform over all 31,102 verses of the KJV.** Each visitor picks
their own index, so each visitor gets their own verse — while the file itself
stays small, cacheable and immutable.

### How it works

`random.json` is a uniformly shuffled list of every verse in the version, as
compact `[book, chapter, verse]` pointers. The shuffle is baked in with a fixed
seed, so the order leaks nothing about reading order and a client cannot bias
its sample by looking at the file.

1. Fetch `bible/{version}/random.json`.
2. Pick a random index into `pointers`.
3. Fetch the chapter file for that verse and read the text.

Two requests, both tiny, both cached at the edge indefinitely.

```js
const BASE = 'https://cdn.jsdelivr.net/gh/USER/REPO';

async function randomVerse(version = 'kjv') {
  const index = await fetch(`${BASE}/bible/${version}/random.json`).then(r => r.json());

  const [book, chapter, verse] =
    index.pointers[Math.floor(Math.random() * index.entry_count)];

  const data = await fetch(`${BASE}/${index.chapter_url_template
    .replace('{book}', book)
    .replace('{chapter}', chapter)}`).then(r => r.json());

  return {
    reference: `${data.book} ${chapter}:${verse}`,
    text: data.verses.find(v => v.verse === verse).text
  };
}

console.log(await randomVerse());
// { reference: 'Proverbs 13:1',
//   text: "A wise son heareth his father's instruction: ..." }
```

The simpler hardcoded form, if you don't need the generic version handling:

```js
async function randomVerse() {
  const index = await fetch(`${BASE}/bible/kjv/random.json`).then(r => r.json());
  const [book, chapter, verse] =
    index.pointers[Math.floor(Math.random() * index.entry_count)];
  const data = await fetch(`${BASE}/bible/kjv/${book}/${chapter}.json`).then(r => r.json());
  return data.verses.find(v => v.verse === verse);
}
```

The root `/random.json` is a small manifest pointing at the per-version files,
with `kjv` as the default:

```json
{
  "default_version": "kjv",
  "versions": { "kjv": "bible/kjv/random.json", "kjv1611": "bible/kjv1611/random.json" },
  "entry_counts": { "kjv": 31102, "kjv1611": 36702 }
}
```

### Why pointers instead of inline text?

An index containing every verse *with* its text would be ~1 MB compressed. The
pointer index is **91 KB**, and the chapter files it points at are already being
cached by every other reader. Storing text inline would mean duplicating the
whole Bible in a second file for no benefit.

If you genuinely need one request, fetch the book file instead — it contains
every chapter of that book at once:

```js
// one request, random verse from within a single book
const book = await fetch(`${BASE}/bible/kjv/proverbs.json`).then(r => r.json());
const chapter = book.chapters[Math.floor(Math.random() * book.chapters.length)];
const verse = chapter.verses[Math.floor(Math.random() * chapter.verses.length)];
```

### Reshuffling

The same seed always produces the same file, so releases are reproducible. To
bake a new shuffle, pick a different seed:

```bash
node scripts/generate-random.mjs            # default seed (1611)
node scripts/generate-random.mjs --seed 42  # new shuffle for a release
```

Run this and commit whenever the underlying text changes, then tag the
release. Consumers pinned to an older tag keep their old shuffle forever.

---

## Book identifiers

Book names are slugified: lowercase, spaces replaced with `-`. Apostrophes are
dropped, so `Song of Solomon` becomes `song-of-solomon`, not `song-of-solomon'`.

Numbers are **not** spelled out, so `1 Timothy` becomes `1-timothy`, never
`first-timothy`.

`books.json` is the authoritative source — but here is the full list. The two
"chapters / verses" columns give that book's count in `kjv` and in `kjv1611`.

| Book id | Name | Testament | kjv | kjv1611 |
|---|---|---|---|---|
| `genesis` | Genesis | Old Testament | 50 / 1533 | 50 / 1533 |
| `exodus` | Exodus | Old Testament | 40 / 1213 | 40 / 1213 |
| `leviticus` | Leviticus | Old Testament | 27 / 859 | 27 / 859 |
| `numbers` | Numbers | Old Testament | 36 / 1288 | 36 / 1288 |
| `deuteronomy` | Deuteronomy | Old Testament | 34 / 959 | 34 / 959 |
| `joshua` | Joshua | Old Testament | 24 / 658 | 24 / 658 |
| `judges` | Judges | Old Testament | 21 / 618 | 21 / 618 |
| `ruth` | Ruth | Old Testament | 4 / 85 | 4 / 85 |
| `1-samuel` | 1 Samuel | Old Testament | 31 / 810 | 31 / 810 |
| `2-samuel` | 2 Samuel | Old Testament | 24 / 695 | 24 / 695 |
| `1-kings` | 1 Kings | Old Testament | 22 / 816 | 22 / 816 |
| `2-kings` | 2 Kings | Old Testament | 25 / 719 | 25 / 719 |
| `1-chronicles` | 1 Chronicles | Old Testament | 29 / 942 | 29 / 942 |
| `2-chronicles` | 2 Chronicles | Old Testament | 36 / 822 | 36 / 822 |
| `ezra` | Ezra | Old Testament | 10 / 280 | 10 / 280 |
| `nehemiah` | Nehemiah | Old Testament | 13 / 406 | 13 / 406 |
| `esther` | Esther | Old Testament | 10 / 167 | 10 / 167 |
| `job` | Job | Old Testament | 42 / 1070 | 42 / 1070 |
| `psalms` | Psalms | Old Testament | 150 / 2461 | 150 / 2461 |
| `proverbs` | Proverbs | Old Testament | 31 / 915 | 31 / 915 |
| `ecclesiastes` | Ecclesiastes | Old Testament | 12 / 222 | 12 / 222 |
| `song-of-solomon` | Song of Solomon | Old Testament | 8 / 117 | 8 / 117 |
| `isaiah` | Isaiah | Old Testament | 66 / 1292 | 66 / 1292 |
| `jeremiah` | Jeremiah | Old Testament | 52 / 1364 | 52 / 1364 |
| `lamentations` | Lamentations | Old Testament | 5 / 154 | 5 / 154 |
| `ezekiel` | Ezekiel | Old Testament | 48 / 1273 | 48 / 1273 |
| `daniel` | Daniel | Old Testament | 12 / 357 | 12 / 357 |
| `hosea` | Hosea | Old Testament | 14 / 197 | 14 / 197 |
| `joel` | Joel | Old Testament | 3 / 73 | 3 / 73 |
| `amos` | Amos | Old Testament | 9 / 146 | 9 / 146 |
| `obadiah` | Obadiah | Old Testament | 1 / 21 | 1 / 21 |
| `jonah` | Jonah | Old Testament | 4 / 48 | 4 / 48 |
| `micah` | Micah | Old Testament | 7 / 105 | 7 / 105 |
| `nahum` | Nahum | Old Testament | 3 / 47 | 3 / 47 |
| `habakkuk` | Habakkuk | Old Testament | 3 / 56 | 3 / 56 |
| `zephaniah` | Zephaniah | Old Testament | 3 / 53 | 3 / 53 |
| `haggai` | Haggai | Old Testament | 2 / 38 | 2 / 38 |
| `zechariah` | Zechariah | Old Testament | 14 / 211 | 14 / 211 |
| `malachi` | Malachi | Old Testament | 4 / 55 | 4 / 55 |
| `matthew` | Matthew | New Testament | 28 / 1071 | 28 / 1071 |
| `mark` | Mark | New Testament | 16 / 678 | 16 / 678 |
| `luke` | Luke | New Testament | 24 / 1151 | 24 / 1151 |
| `john` | John | New Testament | 21 / 879 | 21 / 879 |
| `acts` | Acts | New Testament | 28 / 1007 | 28 / 1007 |
| `romans` | Romans | New Testament | 16 / 433 | 16 / 433 |
| `1-corinthians` | 1 Corinthians | New Testament | 16 / 437 | 16 / 437 |
| `2-corinthians` | 2 Corinthians | New Testament | 13 / 257 | 13 / 257 |
| `galatians` | Galatians | New Testament | 6 / 149 | 6 / 149 |
| `ephesians` | Ephesians | New Testament | 6 / 155 | 6 / 155 |
| `philippians` | Philippians | New Testament | 4 / 104 | 4 / 104 |
| `colossians` | Colossians | New Testament | 4 / 95 | 4 / 95 |
| `1-thessalonians` | 1 Thessalonians | New Testament | 5 / 89 | 5 / 89 |
| `2-thessalonians` | 2 Thessalonians | New Testament | 3 / 47 | 3 / 47 |
| `1-timothy` | 1 Timothy | New Testament | 6 / 113 | 6 / 113 |
| `2-timothy` | 2 Timothy | New Testament | 4 / 83 | 4 / 83 |
| `titus` | Titus | New Testament | 3 / 46 | 3 / 46 |
| `philemon` | Philemon | New Testament | 1 / 25 | 1 / 25 |
| `hebrews` | Hebrews | New Testament | 13 / 303 | 13 / 303 |
| `james` | James | New Testament | 5 / 108 | 5 / 108 |
| `1-peter` | 1 Peter | New Testament | 5 / 105 | 5 / 105 |
| `2-peter` | 2 Peter | New Testament | 3 / 61 | 3 / 61 |
| `1-john` | 1 John | New Testament | 5 / 105 | 5 / 105 |
| `2-john` | 2 John | New Testament | 1 / 13 | 1 / 13 |
| `3-john` | 3 John | New Testament | 1 / 14 | 1 / 14 |
| `jude` | Jude | New Testament | 1 / 25 | 1 / 25 |
| `revelation` | Revelation | New Testament | 22 / 404 | 22 / 404 |
| `1-esdras` | 1 Esdras | Apocrypha | — | 9 / 448 |
| `2-esdras` | 2 Esdras | Apocrypha | — | 16 / 874 |
| `tobit` | Tobit | Apocrypha | — | 14 / 244 |
| `judith` | Judith | Apocrypha | — | 16 / 339 |
| `wisdom-of-solomon` | Wisdom of Solomon | Apocrypha | — | 19 / 436 |
| `ecclesiasticus` | Ecclesiasticus | Apocrypha | — | 51 / 1393 |
| `baruch` | Baruch | Apocrypha | — | 5 / 140 |
| `letter-of-jeremiah` | Letter of Jeremiah | Apocrypha | — | 1 / 73 |
| `prayer-of-azariah` | Prayer of Azariah | Apocrypha | — | 1 / 67 |
| `susanna` | Susanna | Apocrypha | — | 1 / 64 |
| `bel-and-the-dragon` | Bel and the Dragon | Apocrypha | — | 1 / 42 |
| `prayer-of-manasseh` | Prayer of Manasseh | Apocrypha | — | 1 / 1 |
| `1-maccabees` | 1 Maccabees | Apocrypha | — | 16 / 924 |
| `2-maccabees` | 2 Maccabees | Apocrypha | — | 15 / 555 |

---

## Versions

### `kjv` — King James Version (default)

The Authorised Version of 1611 with **spelling and punctuation modernised
only** — *sons* for *sonnes*, *heaven* for *Heauen*, and so on. The wording is
unaltered.

66 books · 1,189 chapters · 31,102 verses.

### `kjv1611` — 1611, original spelling

The 1611 text as first printed, retaining long `ſ`, early modern spelling and
the paragraph markers `¶` that mark the poetic and paragraph divisions of the
original.

80 books · 1,355 chapters · 36,702 verses — the 66 books above plus the
**Apocrypha** as bound into the 1611 Authorised Version.

Compare the two readings of the same verse:

```js
const url = 'https://cdn.jsdelivr.net/gh/USER/REPO/bible';

const [a, b] = await Promise.all([
  fetch(`${url}/kjv/genesis/1.json`).then(r => r.json()),
  fetch(`${url}/kjv1611/genesis/1.json`).then(r => r.json()),
]);

a.verses[0].text; // "In the beginning God created the heaven and the earth."
b.verses[0].text; // "In the beginning God created the Heauen, and the Earth."
```

---

## Error handling

Because these are static files, errors are HTTP-level, not JSON-level.

| Situation | Result |
|---|---|
| Unknown version, book or chapter | `404` from the CDN |
| Book absent from that version (e.g. `kjv/tobit`) | `404` |
| Success | `200` with `Content-Type: application/json` |

Because `404` is indistinguishable between "no such file" and "no such book",
use `books.json` if you need to tell a missing book apart from a missing
chapter — and so you can validate the slug before you build a URL.

```js
async function getBook(version, book) {
  const index = await fetch(`${BASE}/${version}/books.json`).then(r => r.json());
  const entry = index.find(b => b.id === book);
  if (!entry) throw new Error(`Unknown book "${book}" in version "${version}"`);
  return entry;
}

async function getChapter(version, book, chapter) {
  await getBook(version, book); // fail fast with a useful message
  const res = await fetch(`${BASE}/${version}/${book}/${chapter}.json`);
  if (!res.ok) throw new Error(`No chapter ${chapter} in ${book}`);
  return res.json();
}
```

---

## Caching and performance

- Always send CORS — jsDelivr sets `Access-Control-Allow-Origin: *`, so
  `fetch()` from any browser origin just works.
- jsDelivr caches immutable files at the edge with a long
  `Cache-Control: max-age=31536000, immutable`. Pin a version and a request
  becomes effectively free.
- Pin a **tag** (`@v1.0.0`) for releases, or a **commit SHA** for absolute
  immutability. `@latest` follows the default branch and can change under you.
- Chapter files are small: a median of 4.5 KB and a maximum of 21 KB. Prefer
  `/bible/kjv/john/3.json` over `/bible/kjv/john.json` when you need one chapter.
- Going fully offline? `git clone` the repo — it is about 26 MB of JSON across
  ~2,700 files, and works with any static file server. Over the wire jsDelivr
  serves it Brotli-compressed, so a full transfer is a fraction of that.

---

## Deploying to jsDelivr

jsDelivr serves any public GitHub repository as a CDN with no build step and no
account. This repository needs no configuration at all — the files are already
in place at the paths the endpoints expect.

**1. Make the repository public.** jsDelivr will not serve private repos.

**2. Push it.**

```bash
git remote add origin https://github.com/USER/REPO.git
git push -u origin main
```

**3. Use it.** Allow a minute or two for the first fetch to be indexed.

```
https://cdn.jsdelivr.net/gh/USER/REPO/index.json
https://cdn.jsdelivr.net/gh/USER/REPO/bible/kjv/john/3.json
```

**4. Cut a release tag** whenever the data changes, so consumers can pin:

```bash
# if you touched the text, rebuild the random index with a fresh shuffle first
node scripts/generate-random.mjs --seed 42

git tag v1.0.0
git push origin v1.0.0
```

```
https://cdn.jsdelivr.net/gh/USER/REPO@v1.0.0/bible/kjv/john/3.json
```

### Notes

- **Size limits.** jsDelivr serves files up to 20 MB; the largest here is
  `bible/kjv1611/psalms.json` at about 370 KB.
- **File count.** The repository contains a few thousand small JSON files. That
  is fine — but avoid converting every verse into its own file, which would
  push the repository past 50,000 paths.
- **Version your API.** Because the paths are the API, renaming a book id or a
  field is a breaking change. Tag it, and note it in the changelog.

---

## Repository layout

```
.
├── index.json                     # API manifest
├── random.json                    # manifest pointing at the per-version random indexes
├── README.md
├── LICENSE
├── .gitattributes
├── scripts/
│   └── generate-random.mjs        # rebuilds random.json (no dependencies)
└── bible/
    ├── versions.json              # metadata for both versions
    ├── kjv/                       # 66 books, modernised spelling
    │   ├── books.json             # the book index
    │   ├── random.json            # shuffled [book, chapter, verse] index
    │   ├── genesis.json           # whole book
    │   ├── genesis/1.json         # chapter 1
    │   ├── genesis/2.json
    │   └── ...
    └── kjv1611/                   # 80 books, original 1611 spelling + Apocrypha
        ├── books.json
        ├── random.json
        ├── genesis.json
        ├── genesis/1.json
        └── ...
```

Naming rules, which are what make the URLs predictable:

- Book file: `<slug>.json`, lowercase, hyphens instead of spaces.
- Chapter file: `<slug>/<n>.json` where `n` is a plain 1-based integer with no
  padding — `psalms/1.json`, never `psalms/001.json` or `psalms/psalm-1.json`.
- Numbers keep their digits: `1-corinthians`, not `first-corinthians`.
- Every file is pretty-printed UTF-8 JSON with a trailing newline — except
  `random.json`, which is minified, because it holds 31,102 entries and
  whitespace would add about a megabyte for no benefit.

---

## Migrating from the old REST API

This repository replaces the previous Express + PHP service. The routes map
across as follows, with `BASE` standing in for your CDN origin.

| Old route | New |
|---|---|
| `GET /` | `GET /index.json` |
| `GET /{book}` | `GET /bible/kjv/{book}.json` |
| `GET /{book}/{chapter}` | `GET /bible/kjv/{book}/{chapter}.json` |
| `GET /{book}/{chapter}/{verse}` | `GET /bible/kjv/{book}/{chapter}.json` + client-side lookup |
| `GET /random` | `GET /bible/kjv/random.json` + client-side pick |
| `GET /random/chapter` | *(no direct equivalent — pick a book and chapter client-side)* |
| `GET /random/chapter/verse` | `GET /bible/kjv/random.json` + client-side pick |
| `GET /1611` | `GET /bible/kjv1611/books.json` |
| `GET /1611/{book}` | `GET /bible/kjv1611/{book}.json` |
| `GET /1611/{book}/{chapter}` | `GET /bible/kjv1611/{book}/{chapter}.json` |
| `GET /1611/random` | `GET /bible/kjv1611/random.json` + client-side pick |

Four other changes worth knowing:

1. **Book names are now slugs.** `1 Corinthians` → `1-corinthians`. The old API
   was inconsistent here — it read `./bibles/1Chronicles.json` but the PHP build
   looked for `./bibles/1Chronicles.json` via `ucfirst()`, so numbered books
   only worked by accident.
2. **The `1611` prefix became a version path.** `/1611/...` → `/bible/kjv1611/...`.
   Note the lowercase; the old version name was the number `1611`.
3. **The response shape changed.** The old verse route returned
   `{ book, chapter, verse, content }`; the chapter file now returns
   `{ book, version, chapter, verses: [{ verse, text }] }`. Adjust your parser.
4. **Random endpoints moved client-side.** Randomness cannot be computed in a
   static file, so `/random` no longer returns a pre-picked verse. Fetch
   `random.json` and pick from it yourself — see
   [Random verses](#random-verses-randomjson). For a random *chapter*, pick a
   book and then a chapter:

   ```js
   const books = await fetch(`${BASE}/bible/kjv/books.json`).then(r => r.json());
   const randomBook = books[Math.floor(Math.random() * books.length)];

   const book = await fetch(`${BASE}/bible/kjv/${randomBook.id}.json`).then(r => r.json());
   const randomChapter = book.chapters[Math.floor(Math.random() * book.chapters.length)];

   const verse = randomChapter.verses[
     Math.floor(Math.random() * randomChapter.verses.length)
   ];
   ```

The old server's data files also shipped with two inconsistent schemas
(`"chapter": "1"` as a string in one set, `"chapter": 1` as a number with a
`"chapter-count"` field in the other), and its 1611 routes read from a
`./1611/` folder that did not exist. Both are normalised here.

---

## License

The King James Version text is in the **public domain**. This repository is a
repackaging of it and is likewise free to use, copy and redistribute. See
[LICENSE](LICENSE).

Attribution is appreciated but not required.