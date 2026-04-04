/**
 * Manages the user's "my items" (purchase history) data.
 *
 * The product IDs and scores come from the Algolia request that fires
 * when you visit wegmans.com/items while logged in. Since this data
 * lives in the user's browser session, we support multiple refresh methods:
 *
 * 1. Parse from a pasted Algolia request body (most reliable)
 * 2. Automated Playwright browser session (when available)
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface ScoredItem {
  id: string;
  score: number;
}

function getDataPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, "..", "data", "my-items.json");
}

/**
 * Parse product IDs and scores from an Algolia request body or filter string.
 * Accepts either the full JSON body or just the filter string containing
 * `productID:12345<score=100>` patterns.
 */
export function parseMyItemsFromAlgoliaPayload(payload: string): ScoredItem[] {
  const matches = payload.matchAll(/productID:(\d+)<score=(\d+)>/g);
  const itemMap = new Map<string, number>();

  for (const match of matches) {
    const id = match[1]!;
    const score = Number(match[2]);
    // Keep the highest score for each product (it appears in multiple requests)
    const existing = itemMap.get(id);
    if (!existing || score > existing) {
      itemMap.set(id, score);
    }
  }

  const items: ScoredItem[] = [];
  for (const [id, score] of itemMap) {
    items.push({ id, score });
  }

  // Sort by score descending
  items.sort((a, b) => b.score - a.score);
  return items;
}

/**
 * Save items to the data file and return the count.
 */
export function saveMyItems(items: ScoredItem[]): number {
  const dataPath = getDataPath();
  writeFileSync(dataPath, JSON.stringify(items));
  return items.length;
}

/**
 * Load items from the data file.
 */
export function loadMyItems(): ScoredItem[] {
  const dataPath = getDataPath();
  if (!existsSync(dataPath)) return [];
  return JSON.parse(readFileSync(dataPath, "utf-8")) as ScoredItem[];
}

/**
 * Parse an Algolia payload, save the items, and return them.
 */
export function refreshFromPayload(payload: string): ScoredItem[] {
  const items = parseMyItemsFromAlgoliaPayload(payload);
  if (items.length === 0) {
    throw new Error("No productID:<score> patterns found in the provided payload");
  }
  saveMyItems(items);
  return items;
}
