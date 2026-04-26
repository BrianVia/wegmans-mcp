#!/usr/bin/env node
import { addToCart } from "../dist/cart.js";

// args: pairs of <productId> <quantity>
const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  console.error("usage: add-bulk.mjs <productId> <qty> [<productId> <qty> ...]");
  process.exit(1);
}

const items = [];
for (let i = 0; i < args.length; i += 2) {
  items.push({ id: args[i], qty: Number(args[i + 1]) });
}

// Add sequentially — addToCart reads existing cart and merges, so parallel calls would clobber each other.
for (const { id, qty } of items) {
  const r = await addToCart(id, qty);
  if (r.success) {
    const price = r.product.price_inStore?.amount ?? 0;
    console.log(`OK  ${id} x${qty} — ${r.product.productName} ($${price.toFixed(2)}) — cart now has ${r.totalCartItems} items`);
  } else {
    console.error(`ERR ${id} x${qty} — ${r.error}`);
    process.exit(2);
  }
}
