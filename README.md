# Price History

A free, personal, local-first PWA that answers one question reliably:
**“Where have I seen the cheapest price for item X?”**

Scan a supermarket receipt (DE / UK / AU), confirm the parsed lines, and every
price is stored on-device with frozen historical FX equivalents. Search “milk”
and the app answers: *cheapest price, 2,29 €, 1 l lactose-free milk, Lidl,
2025-11-23* — plus the cheapest substitutes in the same category.

No backend. No account. No tracking. Your data never leaves the device.

## How it works

- **OCR runs locally** — [Tesseract.js](https://github.com/naptha/tesseract.js)
  (vendored, English + German) extracts the text in the browser. The receipt
  photo is **never persisted**: it lives in an in-memory canvas during
  recognition and is released immediately after.
- **Guided correction** — the parser only drafts line items (it understands
  German comma prices, weighed goods like `0,234 kg x 2,99 EUR/kg`, multi-buy
  lines like `2 Stk x 0,39`, Tesco `Any 2 For` promotions and discount lines);
  you confirm or fix each line, with bulk accept/reject.
- **Canonical products** — each line is matched against your existing items
  (“Same as *lactose-free milk*?”). German names get an English suggestion
  from a built-in grocery dictionary. New canonical products always require
  your explicit confirmation.
- **Frozen FX** — at save time the app fetches the ECB reference rate **for
  the receipt date** from [frankfurter.app](https://www.frankfurter.app) and
  stores GBP/EUR/AUD equivalents on the observation. They are never
  recalculated — historical values stay byte-identical forever. Offline saves
  are marked *FX pending* and backfilled deterministically (same receipt-date
  rate) when you're back online.
- **Storage** — IndexedDB. Money is stored as integer minor units. Unit prices
  are normalised to 1 kg / 1 l / 1 pc; substitutes are only compared within
  the same category *and* the same unit dimension (never grams vs millilitres).
- **Backup** — because the data lives only on this device (and browsers can
  evict local storage), **Lists → Backup** exports a full JSON snapshot and
  re-imports it (Merge to add/update, or Replace to restore). The app also
  requests persistent storage at startup and nudges you to back up if the
  browser declines. Loyalty deals record both the price paid and the full
  shelf price, so item detail shows the saving.

## Running locally

No build step. Any static file server works (the service worker requires
`http://localhost`, not `file://`):

```sh
npm run serve          # python3 -m http.server 8080
# open http://localhost:8080
```

## Tests

Pure logic (price parsing, units, receipt parser, matching, FX math) is tested
with the built-in node test runner — zero dependencies:

```sh
npm test               # requires Node 20+
```

Receipt-parser fixtures live in `test/fixtures/receipts.js`. Any parsing bug
found in the field should become a fixture there.

## Deploying to GitHub Pages

Settings → Pages → **Deploy from a branch** → `main`, `/ (root)`. Nothing to
build; every push deploys. The app is path-relative, so it works at
`https://<user>.github.io/price-history/` as-is.

**Releases:** bump `CACHE_NAME` in `sw.js` (e.g. `ph-v1` → `ph-v2`) whenever
you deploy changed files, so installed clients pick up the new version.

### Install on iPhone / macOS

Open the Pages URL in Safari → Share → **Add to Home Screen** (iOS) /
**Add to Dock** (macOS). After the first receipt scan the OCR engine
(~9 MB) is cached and everything works offline.

## Manual test checklist

- [ ] Install on iOS Safari and macOS Safari/Chrome; cold-start offline.
- [ ] Scan a German receipt (comma decimals, `kg x EUR/kg` weighed line,
      `2 Stk x` multi-buy, `Frischerabatt` discount).
- [ ] Scan a Tesco receipt (`Any 2 For` promotion, leading quantity,
      weighed bananas `1.015 kg @ (£0.90/kg)`).
- [ ] Manual entry creates the same records as the scan flow.
- [ ] Search by English name finds German-named items (e.g. “milk” →
      “LAKTOSEFR MILCH”).
- [ ] Item detail shows cheapest exact / cheapest per size / substitutes;
      substitutes never mix mass and volume.
- [ ] Save in airplane mode → observation badged *FX pending* → reconnect →
      backfilled with the receipt-date rate (values identical to an online
      save of the same data).
- [ ] After new FX rates exist, old observations' stored equivalents are
      unchanged.
- [ ] DevTools → Application: no image blobs in IndexedDB or Cache Storage
      after a scan.
- [ ] Bump `CACHE_NAME`, push, reload twice → new version active.

## Project layout

```
js/            ES modules (no build step)
  parser.js    receipt heuristics (pure, fixture-tested)
  fx.js        frozen FX equivalents + offline backfill
  db.js        IndexedDB schema, seeds, helpers
  repo.js      validation + the single write path
  search.js    token-prefix search + cheapest-price queries
  ui/          one module per screen, hash-routed
vendor/        pinned tesseract.js v5 + wasm cores + eng/deu tessdata_fast
test/          node:test suites for all pure modules
tools/         icon generator
```

## Non-goals

No social features, no accounts, no ML price prediction, no alerts, no web
scraping, no backend. Future ideas (not implemented): barcode scanning,
per-store regex templates, optional sync.
