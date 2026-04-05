#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { searchProducts, formatProduct } from "./algolia.js";
import { findStores, type WegmansStore } from "./stores.js";
import { addToCart } from "./cart.js";
import { queryProductsByIds } from "./my-items.js";
import { refreshFromPayload } from "./refresh-my-items.js";
import { getAccessToken } from "./auth.js";
import { syncPurchaseHistory, loadPurchaseHistory } from "./purchase-history.js";
import { classifyUrgency, generateShoppingList, getProductInsight } from "./patterns.js";

const server = new McpServer({
  name: "wegmans",
  version: "1.0.0",
});

server.tool(
  "search_products",
  "Search for products at Wegmans. Returns product names, prices, aisle locations, and more.",
  {
    query: z.string().describe("Search term (e.g. 'bananas', 'organic milk', 'wegmans pizza')"),
    store_number: z.string().optional().describe("Wegmans store number (default: 133)"),
    fulfillment: z
      .enum(["instore", "delivery"])
      .optional()
      .describe("Fulfillment type: instore or delivery (default: instore)"),
    page: z.number().int().min(0).optional().describe("Page number for pagination (default: 0)"),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max number of results to return (default: 10, max: 50)"),
  },
  async ({ query, store_number, fulfillment, page, max_results }) => {
    const response = await searchProducts({
      query,
      storeNumber: store_number,
      fulfillmentType: fulfillment,
      page,
      hitsPerPage: max_results ?? 10,
    });

    const result = response.results[0];
    if (!result || result.hits.length === 0) {
      return {
        content: [{ type: "text", text: `No products found for "${query}".` }],
      };
    }

    const header = `Found ${result.nbHits} products for "${result.query}" (showing ${result.hits.length}, page ${result.page + 1}/${result.nbPages})`;
    const products = result.hits.map((hit, i) => `### ${i + 1}. ${formatProduct(hit)}`).join("\n\n---\n\n");

    return {
      content: [{ type: "text", text: `${header}\n\n${products}` }],
    };
  }
);

server.tool(
  "get_product_details",
  "Get detailed information about a specific Wegmans product by its product ID.",
  {
    product_id: z.string().describe("The Wegmans product ID"),
    store_number: z.string().optional().describe("Wegmans store number (default: 133)"),
  },
  async ({ product_id, store_number }) => {
    const storeNum = store_number ?? process.env["WEGMANS_STORE"] ?? "133";
    const ALGOLIA_APP_ID = "QGPPR19V8V";
    const ALGOLIA_API_KEY = "9a10b1401634e9a6e55161c3a60c200d";
    const url = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries?x-algolia-api-key=${ALGOLIA_API_KEY}&x-algolia-application-id=${ALGOLIA_APP_ID}`;

    const body = {
      requests: [
        {
          indexName: "products",
          filters: `objectID:${storeNum}-${product_id}`,
          hitsPerPage: 1,
          attributesToHighlight: [],
        },
      ],
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "accept": "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Failed to fetch product: ${res.status}` }],
      };
    }

    const data = (await res.json()) as { results: Array<{ hits: Array<Record<string, unknown>> }> };
    const hits = data.results[0]?.hits;

    if (!hits?.length) {
      return {
        content: [{ type: "text", text: `Product ${product_id} not found at store ${storeNum}.` }],
      };
    }

    // Return the full raw product data for maximum detail
    return {
      content: [{ type: "text", text: JSON.stringify(hits[0], null, 2) }],
    };
  }
);

server.tool(
  "browse_category",
  "Browse Wegmans products by category/department (e.g. 'Produce', 'Deli', 'Bakery').",
  {
    category: z
      .string()
      .describe(
        "Category to browse. Examples: 'Produce', 'Deli', 'Bakery', 'Dairy', 'Meat', 'Frozen', 'Beverages'"
      ),
    store_number: z.string().optional().describe("Wegmans store number (default: 133)"),
    page: z.number().int().min(0).optional().describe("Page number (default: 0)"),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max results (default: 20)"),
  },
  async ({ category, store_number, page, max_results }) => {
    const response = await searchProducts({
      query: "",
      storeNumber: store_number,
      page,
      hitsPerPage: max_results ?? 20,
      category,
    });

    const result = response.results[0];
    if (!result || result.hits.length === 0) {
      return {
        content: [{ type: "text", text: `No products found in category "${category}".` }],
      };
    }

    const header = `Browsing "${category}" — ${result.nbHits} products (showing ${result.hits.length}, page ${result.page + 1}/${result.nbPages})`;
    const products = result.hits.map((hit, i) => `### ${i + 1}. ${formatProduct(hit)}`).join("\n\n---\n\n");

    return {
      content: [{ type: "text", text: `${header}\n\n${products}` }],
    };
  }
);

server.tool(
  "find_stores",
  "Find Wegmans store locations by name, city, state, or zip code. Returns store numbers, addresses, phone numbers, and available services.",
  {
    query: z
      .string()
      .describe("Search by city name, state abbreviation, zip code, or store name (e.g. 'Reston', 'VA', '20191', 'Chantilly')"),
  },
  async ({ query }) => {
    const stores = await findStores(query);

    if (stores.length === 0) {
      return {
        content: [{ type: "text", text: `No Wegmans stores found matching "${query}".` }],
      };
    }

    const formatted = stores
      .map((s) => {
        const lines = [
          `**${s.name}, ${s.stateAbbreviation}** (Store #${s.storeNumber})`,
          `Address: ${s.streetAddress}, ${s.city}, ${s.stateAbbreviation} ${s.zip}`,
          `Phone: ${s.phoneNumber}`,
        ];
        const services: string[] = [];
        if (s.hasPharmacy) services.push("Pharmacy");
        if (s.hasPickup) services.push("Pickup");
        if (s.hasDelivery) services.push("Delivery");
        if (s.sellsAlcohol) services.push(`Alcohol (${s.alcoholTypesForSale?.join(", ")})`);
        if (services.length) lines.push(`Services: ${services.join(", ")}`);
        return lines.join("\n");
      })
      .join("\n\n---\n\n");

    return {
      content: [{ type: "text", text: `Found ${stores.length} store(s):\n\n${formatted}` }],
    };
  }
);

server.tool(
  "add_to_cart",
  "Add a product to your Wegmans shopping cart by product ID and quantity. Requires WEGMANS_EMAIL, WEGMANS_PASSWORD, and WEGMANS_CUSTOMER_ID env vars. Use search_products first to find product IDs.",
  {
    product_id: z.string().describe("The Wegmans product ID (from search results)"),
    quantity: z.number().int().min(1).default(1).describe("Quantity to add (default: 1)"),
    store_number: z.string().optional().describe("Wegmans store number (default: from WEGMANS_STORE env or 133)"),
    fulfillment: z
      .enum(["instore", "pickup", "delivery"])
      .optional()
      .describe("Fulfillment type (default: instore)"),
  },
  async ({ product_id, quantity, store_number, fulfillment }) => {
    try {
      const result = await addToCart(product_id, quantity, store_number, fulfillment);

      if (!result.success) {
        return {
          content: [{ type: "text", text: `Failed to add to cart: ${result.error}` }],
        };
      }

      const price = result.product.price_inStore
        ? `$${result.product.price_inStore.amount.toFixed(2)}`
        : "unknown price";

      return {
        content: [
          {
            type: "text",
            text: `Added to cart: ${quantity}x **${result.product.productName}** (${price} each)\nProduct ID: ${product_id}`,
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
      };
    }
  }
);

server.tool(
  "get_my_items",
  "Get the user's frequently purchased Wegmans items, sorted by purchase frequency (most bought first). Great for building shopping lists based on past preferences.",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of items to return (default: 25, max: 100)"),
    store_number: z.string().optional().describe("Wegmans store number (default: from WEGMANS_STORE env or 133)"),
  },
  async ({ limit, store_number }) => {
    try {
      const { loadMyItems } = await import("./refresh-my-items.js");
      const allItems = loadMyItems();
      const count = limit ?? 25;
      const store = store_number ?? process.env["WEGMANS_STORE"] ?? "133";

      const topItems = allItems.slice(0, count);
      const ids = topItems.map((i) => i.id);
      const scores = topItems.map((i) => i.score);

      const result = await queryProductsByIds(ids, store, scores);

      if (result.products.length === 0) {
        return {
          content: [{ type: "text", text: "No purchase history found." }],
        };
      }

      const header = `Your top ${result.products.length} most-purchased items (out of ${allItems.length} total):`;
      const items = result.products
        .map(
          (p, i) =>
            `${i + 1}. **${p.productName}** — ${p.price} (Aisle: ${p.aisle}) [ID: ${p.productId}]`
        )
        .join("\n");

      return {
        content: [{ type: "text", text: `${header}\n\n${items}` }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
      };
    }
  }
);

server.tool(
  "get_cart",
  "Get the current contents of your Wegmans shopping cart.",
  {},
  async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(
        "https://api.digitaldevelopment.wegmans.cloud/commerce/cart/carts?api-version=2024-02-19-preview",
        {
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json",
            origin: "https://www.wegmans.com",
            referer: "https://www.wegmans.com/",
          },
        }
      );

      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Failed to fetch cart: ${res.status}` }],
        };
      }

      const data = (await res.json()) as Record<string, unknown>;
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
      };
    }
  }
);

server.tool(
  "refresh_my_items",
  "Update the user's purchase history by parsing an Algolia request payload from wegmans.com/items. To get the payload: log into wegmans.com, go to /items, open DevTools Network tab, find the algolia.net request, and copy the request body or the full fetch() call. Paste it as the algolia_payload parameter.",
  {
    algolia_payload: z
      .string()
      .describe(
        "The Algolia request body or full fetch() call from the /items page. Must contain productID:<score> patterns."
      ),
  },
  async ({ algolia_payload }) => {
    try {
      const items = refreshFromPayload(algolia_payload);
      return {
        content: [
          {
            type: "text",
            text: `Updated my-items: ${items.length} products saved. Top score: ${items[0]?.score}, lowest: ${items[items.length - 1]?.score}.`,
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
      };
    }
  }
);

// ─── Purchase Intelligence Tools ───

server.tool(
  "sync_purchase_history",
  "Fetch your complete Wegmans purchase history from in-store receipts, online orders, and purchase rankings. Merges all sources into a local timeline and computes purchase patterns. Run this first to get data, then use get_purchase_patterns or get_shopping_suggestions to analyze.",
  {},
  async () => {
    try {
      const stats = await syncPurchaseHistory();
      return {
        content: [
          {
            type: "text",
            text: [
              `Purchase history synced successfully:`,
              `- ${stats.receiptsCount} in-store receipts (${stats.receiptItemsCount} line items)`,
              `- ${stats.ordersCount} online orders (${stats.orderItemsCount} line items)`,
              `- ${stats.totalEvents} total purchase events`,
              `- ${stats.uniqueProducts} unique products tracked`,
              ``,
              `Use get_purchase_patterns, get_shopping_suggestions, or get_product_history to analyze.`,
            ].join("\n"),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error syncing: ${msg}` }] };
    }
  }
);

server.tool(
  "get_purchase_patterns",
  "Analyze your purchase patterns. Shows how often you buy each item, when you last bought it, and when you'll likely need it again. Useful for 'when did I last buy milk?' or 'how often do I buy eggs?'. Requires sync_purchase_history to have been run first.",
  {
    product_name: z
      .string()
      .optional()
      .describe("Filter by product name (partial match, case-insensitive)"),
    department: z
      .string()
      .optional()
      .describe("Filter by department (e.g. 'Dairy', 'Produce')"),
    urgency: z
      .enum(["overdue", "due_soon", "upcoming", "all"])
      .optional()
      .describe("Filter by urgency (default: all)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max results (default: 25)"),
  },
  async ({ product_name, department, urgency, limit }) => {
    const history = loadPurchaseHistory();
    if (!history.lastSyncedAt) {
      return {
        content: [
          {
            type: "text",
            text: "No purchase history found. Run sync_purchase_history first.",
          },
        ],
      };
    }

    let products = Object.values(history.products);

    // Filter by name
    if (product_name) {
      const q = product_name.toLowerCase();
      products = products.filter((p) =>
        p.productName.toLowerCase().includes(q)
      );
    }

    // Filter by department
    if (department) {
      const q = department.toLowerCase();
      products = products.filter((p) =>
        p.department.toLowerCase().includes(q)
      );
    }

    // Filter by urgency
    if (urgency && urgency !== "all") {
      products = products.filter((p) => {
        const { urgency: u } = classifyUrgency(p);
        return u === urgency;
      });
    }

    // Sort by rank descending (most purchased first), then by last purchase
    products.sort((a, b) => b.rank - a.rank);

    const count = limit ?? 25;
    const shown = products.slice(0, count);

    if (shown.length === 0) {
      return {
        content: [{ type: "text", text: "No matching products found." }],
      };
    }

    const urgencyIcon: Record<string, string> = {
      overdue: "!!",
      due_soon: "!",
      upcoming: "~",
      not_due: "-",
      unknown: "?",
    };

    const lines = shown.map((p, i) => {
      const { urgency: u, daysSince, daysUntil } = classifyUrgency(p);
      const interval = p.medianIntervalDays
        ? `Every ~${Math.round(p.medianIntervalDays)} days`
        : "Unknown interval";
      const lastStr = p.lastPurchasedDate
        ? `Last: ${daysSince}d ago`
        : "Never";
      const nextStr =
        daysUntil !== null
          ? daysUntil < 0
            ? `${Math.abs(daysUntil)}d overdue`
            : daysUntil === 0
              ? "Due today"
              : `Due in ${daysUntil}d`
          : "";
      return `${i + 1}. [${urgencyIcon[u]}] **${p.productName}** (${p.department})\n   ${p.purchaseDates.length} purchases | ${interval} | ${lastStr} | ${nextStr} [ID: ${p.productId}]`;
    });

    const syncAge = Math.round(
      (Date.now() - new Date(history.lastSyncedAt).getTime()) / 60000
    );
    const header = `Purchase patterns (${shown.length} of ${products.length} products) | Synced ${syncAge < 60 ? `${syncAge}m ago` : `${Math.round(syncAge / 60)}h ago`}\n\nLegend: !! = overdue, ! = due soon, ~ = upcoming, - = not due, ? = unknown\n`;

    return {
      content: [{ type: "text", text: header + "\n" + lines.join("\n\n") }],
    };
  }
);

server.tool(
  "get_shopping_suggestions",
  "Generate a smart shopping list based on your purchase patterns. Returns items you're likely to need soon, sorted by urgency. Great for 'what do I need this week?' or 'build me a shopping list'. Requires sync_purchase_history to have been run first.",
  {
    lookahead_days: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe("How many days ahead to look (default: 7)"),
    max_items: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max suggestions (default: 20)"),
  },
  async ({ lookahead_days, max_items }) => {
    const history = loadPurchaseHistory();
    if (!history.lastSyncedAt) {
      return {
        content: [
          {
            type: "text",
            text: "No purchase history found. Run sync_purchase_history first.",
          },
        ],
      };
    }

    const suggestions = generateShoppingList(history.products, {
      lookaheadDays: lookahead_days ?? 7,
      maxItems: max_items ?? 20,
      includeOverdue: true,
    });

    if (suggestions.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No items predicted to be needed in the next ${lookahead_days ?? 7} days.`,
          },
        ],
      };
    }

    const urgencyIcon: Record<string, string> = {
      overdue: "!!",
      due_soon: "!",
      upcoming: "~",
      not_due: "-",
      unknown: "?",
    };

    const lines = suggestions.map(
      (s, i) =>
        `${i + 1}. [${urgencyIcon[s.urgency]}] **${s.productName}** (${s.department}) [ID: ${s.productId}]\n   ${s.reason}`
    );

    const syncAge = Math.round(
      (Date.now() - new Date(history.lastSyncedAt).getTime()) / 60000
    );
    const header = `Suggested shopping list (next ${lookahead_days ?? 7} days) | ${suggestions.length} items | Synced ${syncAge < 60 ? `${syncAge}m ago` : `${Math.round(syncAge / 60)}h ago`}`;

    return {
      content: [{ type: "text", text: header + "\n\n" + lines.join("\n\n") }],
    };
  }
);

server.tool(
  "get_product_history",
  "Get the complete purchase timeline for a specific product. Shows every time you bought it with dates, quantities, prices. Plus computed pattern summary. Useful for 'show me my milk purchases' or 'how much do I spend on eggs?'.",
  {
    product_id: z.string().describe("Wegmans product ID"),
  },
  async ({ product_id }) => {
    const history = loadPurchaseHistory();
    if (!history.lastSyncedAt) {
      return {
        content: [
          {
            type: "text",
            text: "No purchase history found. Run sync_purchase_history first.",
          },
        ],
      };
    }

    const product = history.products[product_id];
    if (!product) {
      return {
        content: [
          {
            type: "text",
            text: `Product ${product_id} not found in purchase history.`,
          },
        ],
      };
    }

    // Get events for this product
    const events = history.events
      .filter((e) => e.productId === product_id)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // newest first

    const insight = getProductInsight(product);

    const totalSpent = events.reduce(
      (s, e) => s + e.unitPrice * e.quantity,
      0
    );
    const avgPrice =
      events.length > 0 ? totalSpent / events.length : 0;

    const header = [
      `## ${product.productName} (ID: ${product_id})`,
      ``,
      insight,
      ``,
      `**Summary**: ${product.purchaseDates.length} purchases | Total spent: $${totalSpent.toFixed(2)} | Avg per trip: $${avgPrice.toFixed(2)}`,
    ].join("\n");

    const timeline = events
      .map((e) => {
        const date = e.timestamp.slice(0, 10);
        const price = `$${(e.unitPrice * e.quantity).toFixed(2)}`;
        return `| ${date} | ${e.quantity} | ${price} | ${e.source} | ${e.storeNumber || "-"} |`;
      })
      .join("\n");

    const table = events.length > 0
      ? `\n### Timeline\n| Date | Qty | Price | Source | Store |\n|------|-----|-------|--------|-------|\n${timeline}`
      : "\n*No individual purchase events found — last purchase date from My Items API only.*";

    return {
      content: [{ type: "text", text: header + table }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
