#!/usr/bin/env node
import { searchProducts } from "../dist/algolia.js";

const queries = process.argv.slice(2);
if (queries.length === 0) {
  console.error("usage: search-bulk.mjs <query1> [query2] ...");
  process.exit(1);
}

const results = await Promise.all(
  queries.map(async (q) => {
    const r = await searchProducts({ query: q, hitsPerPage: 5 });
    return { q, hits: r.results[0]?.hits ?? [] };
  })
);

for (const { q, hits } of results) {
  console.log(`\n=== ${q} ===`);
  if (hits.length === 0) {
    console.log("  (no results)");
    continue;
  }
  for (const h of hits) {
    const price = h.price_inStore ? `$${h.price_inStore.amount.toFixed(2)}` : "—";
    const unit = h.price_inStore?.unitPrice ? ` (${h.price_inStore.unitPrice})` : "";
    const aisle = h.planogram?.aisle ?? "—";
    const sold = h.isSoldByWeight ? ` [by ${h.onlineSellByUnit ?? "lb"}]` : "";
    const size = h.size ? ` ${h.size}` : "";
    console.log(`  [${h.productId}] ${h.productName}${size} — ${price}${unit} — ${aisle}${sold}`);
  }
}
