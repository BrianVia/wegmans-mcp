# wegmans-mcp — agent notes

This repo *is* the Wegmans MCP server, but the MCP tools (`search_products`, `add_to_cart`, etc.) are **not** loaded into your tool list inside this working directory. To search Wegmans / add to the user's cart, drive the compiled modules directly via Node — no MCP, no Instacart fallback.

## How to actually do things

The compiled JS lives in `dist/`. Credentials are in `.env` at the repo root. `addToCart` calls `getRequiredEnv("WEGMANS_EMAIL" / "WEGMANS_CUSTOMER_ID")` at runtime, so you must export the .env into the shell before invoking — otherwise it throws.

```bash
set -a && source .env && set +a && node scripts/add-bulk.mjs <productId> <qty> ...
```

`scripts/search-bulk.mjs` and `scripts/add-bulk.mjs` are pre-written helpers. Read them — they're tiny.

## What `dist/` exposes

- `dist/algolia.js` → `searchProducts({ query, hitsPerPage, storeNumber? })` — public, no auth needed
- `dist/cart.js` → `addToCart(productId, quantity, storeNumber?, fulfillmentType?)` — needs env vars
- `dist/cart.js` → `lookupProduct(productId, storeNumber)` — single product by ID
- `dist/stores.js` → `findStores(query)` — store locator
- `dist/purchase-history.js` → `syncPurchaseHistory()`, `loadPurchaseHistory()`
- `dist/patterns.js` → `classifyUrgency`, `generateShoppingList`, `getProductInsight`
- `dist/auth.js` → `getAccessToken()` — Azure AD B2C flow, cached

## Gotchas worth knowing

- **Run `npm run build` after editing `src/`.** The scripts import from `dist/`, not `src/`. If you edit a `.ts` file and don't rebuild, your Node script runs stale code.
- **`addToCart` is sequential, not parallel.** It reads the existing cart, merges the new line item, then POSTs the whole thing back. Two parallel calls race and one will clobber the other. Loop with `await` per item.
- **Same SKU re-added → quantity merges, line count stays flat.** Expected behavior, see `cart.ts:239-245`.
- **`isSoldByWeight` items** (ground beef, produce-by-the-pound): `quantity` is still an integer count of units. For a 1-lb bulk meat order, `quantity: 1` means 1 lb. The Algolia hit carries `onlineSellByUnit` and `isSoldByWeight` — `cart.ts` handles the rest.
- **Default store is 133 (Chantilly, VA).** Set via `WEGMANS_STORE` in `.env`. Reston is 146.
- **Algolia query syntax doesn't support OR/AND.** One concept per query. To add multiple items, just call `searchProducts` per concept and pick the top hit.
- **Search misses on size qualifiers.** `"tomato sauce 15 oz can"` returned beer 15-packs because Algolia matched "15 oz cans". Drop the size from the query and inspect results manually.
- **The Instacart MCP cart tool is also loaded in this session, but Wegmans isn't on Instacart at the user's default delivery address (Murrells Inlet, SC).** Don't fall back to it for Wegmans — use the local API.

## Typical flow

1. `node scripts/search-bulk.mjs "<concept1>" "<concept2>" ...` — get product IDs and prices for each ingredient. Inspect, refine misses.
2. Show the user the picks in a table. Confirm or take swaps.
3. `set -a && source .env && set +a && node scripts/add-bulk.mjs <id1> <qty1> <id2> <qty2> ...` — add sequentially.

## Repo orientation

- `src/index.ts` — MCP tool definitions (good reference for what each module does and how it's normally called)
- `docs/api-reference.md` — Wegmans API endpoint docs
- `data/purchase-history.json` — synced purchase data, gitignored. Don't expect it to be present on a fresh clone.
