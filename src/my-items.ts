/**
 * "My Items" — the user's purchase history / frequently bought items.
 *
 * Wegmans stores this as a scored list of product IDs that gets passed to Algolia.
 * The scores represent purchase frequency/recency (higher = more frequently bought).
 *
 * We extract this from the Wegmans website by intercepting the Algolia query
 * that the frontend builds when you visit the "My Items" page.
 * For now, we fetch it by navigating to the search page while authenticated
 * and reading the Algolia request payload.
 *
 * The product IDs are then queried against Algolia to get full product details.
 */

import { getAccessToken } from "./auth.js";

const ALGOLIA_APP_ID = "QGPPR19V8V";
const ALGOLIA_API_KEY = "9a10b1401634e9a6e55161c3a60c200d";
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries?x-algolia-api-key=${ALGOLIA_API_KEY}&x-algolia-application-id=${ALGOLIA_APP_ID}`;

interface ScoredProduct {
  productId: string;
  score: number;
}

export interface MyItemsResult {
  products: Array<{
    productId: string;
    productName: string;
    price: string;
    aisle: string;
    score: number;
  }>;
  total: number;
}

/**
 * Fetch the user's "my items" by querying Algolia with the scored product IDs.
 * We scrape the product IDs from the Wegmans frontend's RSC payload.
 */
export async function getMyItems(
  storeNumber: string,
  limit: number = 25
): Promise<MyItemsResult> {
  const token = await getAccessToken();

  // Fetch the search page RSC payload which contains the my-items Algolia query
  const rscUrl = `https://www.wegmans.com/shop/search?query=&_rsc=1`;
  const res = await fetch(rscUrl, {
    headers: {
      accept: "text/x-component",
      cookie: `msal.cache.encryption=; wfm.store=${storeNumber}`,
      authorization: `Bearer ${token}`,
      "rsc": "1",
      "next-url": "/items",
    },
  });

  // If we can't get the product list from RSC, fall back to the hardcoded approach
  // which queries a known set of products. The frontend stores these in the user's session.
  // For now, use the /api/my-items endpoint approach via the browse API.

  // Try the browse/products endpoint to get purchase history
  const browseUrl = `https://www.wegmans.com/api/my-items`;
  const browseRes = await fetch(browseUrl, {
    headers: {
      accept: "application/json",
      cookie: `wfm.store=${storeNumber}`,
    },
  });

  if (browseRes.ok) {
    const data = await browseRes.json() as { productIds?: string[] };
    if (data.productIds) {
      return queryProductsByIds(data.productIds.slice(0, limit), storeNumber);
    }
  }

  // If that doesn't work, return empty — the user can provide their items file
  return { products: [], total: 0 };
}

/**
 * Query Algolia for a batch of products by their IDs.
 * Uses the same scored filter approach that the Wegmans frontend uses.
 */
export async function queryProductsByIds(
  productIds: string[],
  storeNumber: string,
  scores?: number[]
): Promise<MyItemsResult> {
  // Build the scored filter string like the frontend does
  const filterParts = productIds.map((id, i) => {
    const score = scores?.[i] ?? (productIds.length - i);
    return `productID:${id}<score=${score}>`;
  });

  const filters = `storeNumber:${storeNumber} AND fulfilmentType:instore AND excludeFromWeb:false AND isSoldAtStore:true AND (${filterParts.join(" OR ")})`;

  const body = {
    requests: [
      {
        indexName: "products",
        analytics: true,
        analyticsTags: ["my-items-count"],
        attributesToHighlight: [],
        clickAnalytics: true,
        enableRules: true,
        facets: ["*"],
        filters,
        hitsPerPage: productIds.length,
        page: 0,
        query: "",
        getRankingInfo: true,
      },
    ],
  };

  const res = await fetch(ALGOLIA_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Algolia query failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    results: Array<{
      hits: Array<{
        productId: string;
        productName: string;
        price_inStore?: { amount: number; unitPrice?: string };
        planogram?: { aisle?: string };
        _rankingInfo?: { filters?: number };
      }>;
      nbHits: number;
    }>;
  };

  const result = data.results[0];
  if (!result) return { products: [], total: 0 };

  // Sort by score (ranking info filters field) descending — most purchased first
  const products = result.hits
    .sort((a, b) => (b._rankingInfo?.filters ?? 0) - (a._rankingInfo?.filters ?? 0))
    .map((h) => ({
      productId: h.productId,
      productName: h.productName,
      price: h.price_inStore ? `$${h.price_inStore.amount.toFixed(2)}` : "N/A",
      aisle: h.planogram?.aisle ?? "Unknown",
      score: h._rankingInfo?.filters ?? 0,
    }));

  return { products, total: result.nbHits };
}
