# wegmans-mcp

An MCP (Model Context Protocol) server that lets AI assistants interact with Wegmans grocery stores. Search products, find store locations, manage your shopping cart, and access your purchase history — all through natural language.

## What it does

This server connects to Wegmans' Algolia search API and commerce backend to expose 12 tools:

| Tool | Auth? | Description |
|------|-------|-------------|
| `search_products` | No | Full-text product search with prices, aisle locations, images, ratings |
| `get_product_details` | No | Detailed product lookup by ID |
| `browse_category` | No | Browse by department (Produce, Deli, Bakery, etc.) |
| `find_stores` | No | Find store numbers by city, state, or zip code |
| `get_my_items` | No | Your most frequently purchased items, ranked by purchase frequency |
| `add_to_cart` | Yes | Add products to your real Wegmans cart |
| `get_cart` | Yes | View current cart contents |
| `refresh_my_items` | No | Update purchase history from a browser capture (legacy) |
| **`sync_purchase_history`** | **Yes** | **Fetch full purchase history from receipts, orders, and rankings** |
| **`get_purchase_patterns`** | **No*** | **Analyze how often you buy each item and when you'll need it again** |
| **`get_shopping_suggestions`** | **No*** | **Smart shopping list — items you likely need, sorted by urgency** |
| **`get_product_history`** | **No*** | **Full purchase timeline for a specific product** |

*\*Reads from local data synced by `sync_purchase_history`.*

The unauthenticated tools work out of the box — no account needed. Cart and sync operations require your Wegmans credentials.

## Setup

```bash
git clone https://github.com/BrianVia/wegmans-mcp.git
cd wegmans-mcp
npm install
npm run build
```

### Add to Claude Code

```json
{
  "mcpServers": {
    "wegmans": {
      "command": "node",
      "args": ["/path/to/wegmans-mcp/dist/index.js"],
      "env": {
        "WEGMANS_STORE": "133"
      }
    }
  }
}
```

### Add to Claude Desktop

```json
{
  "mcpServers": {
    "wegmans": {
      "command": "node",
      "args": ["/path/to/wegmans-mcp/dist/index.js"],
      "env": {
        "WEGMANS_STORE": "133",
        "WEGMANS_EMAIL": "your-email@example.com",
        "WEGMANS_PASSWORD": "your-password",
        "WEGMANS_CUSTOMER_ID": "your-customer-uuid"
      }
    }
  }
}
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WEGMANS_STORE` | No | Your store number (default: `133`). Use `find_stores` to look up yours. |
| `WEGMANS_EMAIL` | For cart ops | Your wegmans.com account email |
| `WEGMANS_PASSWORD` | For cart ops | Your wegmans.com account password |
| `WEGMANS_CUSTOMER_ID` | For cart ops | Your Wegmans customer UUID (see [Finding your customer ID](#finding-your-customer-id)) |

## Finding your store number

Every Wegmans has a numeric store ID used for pricing, inventory, and aisle locations.

**Common stores:**

| Store | Number |
|-------|--------|
| Chantilly, VA (14361 Newbrook Dr.) | `133` |
| Reston, VA (11950 Hopper St.) | `146` |

Use the `find_stores` tool to look up others, or:

```
> find_stores("Reston")
  Reston, VA — Store #146 — 11950 Hopper St., Reston, VA 20191

> find_stores("VA")
  Dulles #7, Fairfax #16, Chantilly #133, Reston #146, Tysons #115, ...
```

The store number determines which products are available, what prices you see, and which aisle locations are returned. Stores carry different inventory, so this matters.

## Finding your customer ID

Your customer ID is a UUID that Wegmans assigns to your account. To find it:

1. Log into [wegmans.com](https://www.wegmans.com)
2. Open DevTools (F12) → Network tab
3. Search for any request to `algolia.net`
4. Look for `userToken` in the request body — that's your customer ID

It looks like: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (a UUID)

## Usage examples

### Search for products

Search returns product names, in-store and delivery prices, aisle locations, images, ratings, allergen info, and more.

```
> search_products("lactose free 2% milk")

1. fairlife 2% Reduced Fat Ultra-Filtered Milk, Lactose Free — $5.49 (Aisle: Dairy)
2. Lactaid Milk, Reduced Fat, 2% Milkfat — $5.99 (Aisle: Dairy)
3. Wegmans 2% Reduced Fat Lactose Free Milk — $3.79 (Aisle: Dairy)
4. Organic Valley Milk, Lactose Free, Reduced Fat, 2% — $6.29 (Aisle: Dairy)
```

```
> search_products("bananas", { max_results: 2 })

1. Bananas, Sold by the Each — $0.19 ($0.49/lb.) — Aisle: Produce
2. Organic Bananas, Bunch — $1.38 ($0.69/lb.) — Aisle: Produce
```

### Add items to your cart

The `add_to_cart` tool takes a product ID (from search results) and quantity. It looks up the full product details, authenticates with Wegmans, and adds it to your real cart.

```
> add_to_cart("92685", 5)
  Added to cart: 5x Bananas, Sold by the Each ($0.19 each)

> add_to_cart("116893", 1)
  Added to cart: 1x Lactaid Milk, Reduced Fat, 2% Milkfat ($5.99 each)
```

Items accumulate — each add reads the existing cart first and merges the new item in, so you won't lose what's already there.

### View your most-purchased items

The `get_my_items` tool returns your purchase history ranked by frequency. This is great for building a weekly shopping list or letting an AI suggest what you might need.

```
> get_my_items({ limit: 10 })

Your top 10 most-purchased items (out of 546 total):

1. Wegmans Grade AA Large Eggs, 18 Count — $2.49 (Aisle: Dairy)
2. Lactaid Milk, Reduced Fat, 2% Milkfat — $5.99 (Aisle: Dairy)
3. Bananas, Sold by the Each — $0.19 (Aisle: Produce)
4. Large Fresh Limes — $0.50 (Aisle: Produce)
5. Strawberries — $2.99 (Aisle: Produce)
6. Wegmans Organic Lemonade — $3.49 (Aisle: 18A)
7. Wegmans Cherry Tomatoes on the Vine, Flavor Bombs — $5.79 (Aisle: Produce)
8. Wegmans Pancake Mix — $2.29 (Aisle: 11B)
9. Lemons — $0.69 (Aisle: Produce)
10. MadeGood Mornings Soft Baked Blueberry Flavor Oat Bars — $4.49 (Aisle: 04B)
```

### Bulk add your regular items

An AI assistant can combine `get_my_items` with `add_to_cart` to quickly build your weekly cart:

```
"Add my regular top 10 shopping items"

  OK — Wegmans Grade AA Large Eggs, 18 Count (10 items in cart)
  OK — Lactaid Milk, Reduced Fat, 2% Milkfat (10 items in cart)
  OK — Bananas, Sold by the Each (10 items in cart)
  OK — Large Fresh Limes (10 items in cart)
  OK — Strawberries (10 items in cart)
  ...
```

### Purchase intelligence — "What do I need this week?"

The real power: sync your full purchase history, then let the AI figure out what you need.

**Step 1: Sync your history** (fetches 63+ receipts and 71+ orders from Wegmans)

```
> sync_purchase_history

  Purchase history synced:
  - 63 in-store receipts (862 line items)
  - 71 online orders (1238 line items)
  - 2100 total purchase events
  - 818 unique products tracked
```

**Step 2: See your patterns**

```
> get_purchase_patterns({ product_name: "milk" })

  1. [~] Milk, Reduced Fat, 2% Milkfat (Dairy)
     53 purchases | Every ~7 days | Last: 1d ago | Due in 6d

> get_purchase_patterns({ urgency: "overdue" })

  1. [!!] Clementines, Bagged (Produce) — 68d ago, usually every 26d (42d overdue)
  2. [!!] Whipped Cream Cheese Spread (Dairy) — 63d ago, usually every 24d (39d overdue)
  ...
```

**Step 3: Get a smart shopping list**

```
> get_shopping_suggestions({ lookahead_days: 7 })

  1. [!!] Clementines, Bagged (Produce) [ID: 44091]
     Last bought 68 days ago, you usually buy every 26 days (42 days overdue)

  2. [!!] Cream Cheese Icing Cinnamon Rolls (Dairy) [ID: 139106]
     Last bought 38 days ago, you usually buy every 24 days (15 days overdue)

  3. [!] Bananas, Sold by the Each (Produce) [ID: 92685]
     Last bought 5 days ago, you usually buy every 8 days (due in 3 days)
```

**Step 4: Dive into a specific product**

```
> get_product_history({ product_id: "116893" })

  ## Milk, Reduced Fat, 2% Milkfat (ID: 116893)

  You buy this roughly every 7 days (based on 53 purchases). Last bought 1 day ago.

  Summary: 53 purchases | Total spent: $351.49 | Avg per trip: $6.63

  | Date       | Qty | Price  | Source  | Store |
  |------------|-----|--------|---------|-------|
  | 2026-04-04 | 2   | $13.78 | order   | -     |
  | 2026-03-26 | 1   | $6.89  | order   | -     |
  | 2026-03-21 | 1   | $6.89  | order   | -     |
  | ...        |     |        |         |       |
```

**The killer combo**: Ask an AI assistant "add everything I need this week to my cart" — it calls `get_shopping_suggestions` then `add_to_cart` for each item.

### Legacy: Refresh my-items from browser

The `refresh_my_items` tool still works for updating the Algolia-based frequency ranking. For full purchase history with timestamps and patterns, use `sync_purchase_history` instead.

## Architecture

```
src/
  index.ts              # MCP server — tool definitions and handlers
  algolia.ts            # Algolia product search client
  auth.ts               # Azure AD B2C OAuth authentication (PKCE flow)
  cart.ts               # Cart operations (add to cart, get cart, product lookup)
  stores.ts             # Store locator (fetches from wegmans.com/api/stores)
  receipts.ts           # In-store receipt fetcher (63+ receipts with item detail)
  orders.ts             # Online order fetcher (71+ orders with line items)
  my-items-api.ts       # Wegmans My Items API (ranked list with lastPurchasedDate)
  purchase-history.ts   # Unified data layer — merges all sources, persists locally
  patterns.ts           # Pure analysis — intervals, predictions, shopping suggestions
  my-items.ts           # Query Algolia for scored product lists
  refresh-my-items.ts   # Parse and save purchase history data

data/
  purchase-history.json # Unified purchase timeline (gitignored)
  my-items.json         # Legacy Algolia-based frequency cache (gitignored)

docs/
  api-reference.md      # Documented Wegmans API endpoints
```

### How it works

**Product search** hits Wegmans' Algolia index directly using their public search API key. No authentication needed. Every product has store-specific pricing, aisle locations, and availability — so the `WEGMANS_STORE` setting matters.

**Cart operations** use Wegmans' commerce API at `api.digitaldevelopment.wegmans.cloud`. Authentication goes through Azure AD B2C with a PKCE OAuth flow — the server handles the full login flow (GET authorize page → POST credentials → GET auth code → exchange for token) and caches the access token until it expires.

**Purchase intelligence** syncs three API sources:
- `/commerce/receipts` — 63+ in-store receipts with item-level detail (product, quantity, price, timestamp, store)
- `/commerce/order/orders/{id}` — 71+ online orders with line items
- `/commerce/my-items` — ranked product list with `lastPurchasedDate`

These are merged into a unified timeline in `data/purchase-history.json`. The `patterns.ts` module computes per-product purchase intervals using median (robust against outliers), classifies urgency, and generates shopping suggestions. Items you stopped buying are automatically filtered out.

### Store-aware data

All product data is store-specific. The same product can have different prices, aisle locations, and availability across stores:

- **Store 133 (Chantilly, VA)**: Bananas at $0.49/lb, Aisle: Produce
- **Store 146 (Reston, VA)**: Same product, potentially different aisle position

The `WEGMANS_STORE` env var (or the `store_number` parameter on each tool) controls which store's data you see.

## API details

See [docs/api-reference.md](docs/api-reference.md) for full documentation of the Wegmans APIs this server uses, including:

- Algolia product search (public, no auth)
- Store locator API (public, no auth)
- Cart management API (authenticated)
- Azure AD B2C authentication flow

### Rate limits

From Wegmans' response headers:
- Product search (Algolia): 50,000 calls per period
- Cart API: 5,000 calls per period

## Limitations

- **No coupon management** — The Algolia data includes digital coupon IDs, and the receipts show discount amounts, but clipping/applying coupons is not yet implemented.
- **Single fulfillment type per cart** — The cart API ties each cart to one fulfillment type (instore, pickup, or delivery).
- **Pattern accuracy depends on data** — Products with fewer than 3 purchases don't get interval predictions. Items you stopped buying are filtered out after 3x their usual interval or 90 days, whichever comes first.
- **Sync is explicit** — You must call `sync_purchase_history` to fetch fresh data. There is no background polling.

## Prior art

This project was informed by the [wegmans-shopping](https://github.com/nathannorman-toast/wegmans-shopping) project, which uses Playwright to scrape product data via Algolia interception. This MCP server takes a different approach — hitting Algolia directly without a browser for search, and using the commerce API for cart operations.

## License

ISC
