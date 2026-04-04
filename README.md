# wegmans-mcp

An MCP (Model Context Protocol) server that lets AI assistants interact with Wegmans grocery stores. Search products, find store locations, manage your shopping cart, and access your purchase history — all through natural language.

## What it does

This server connects to Wegmans' Algolia search API and commerce backend to expose 8 tools:

| Tool | Auth? | Description |
|------|-------|-------------|
| `search_products` | No | Full-text product search with prices, aisle locations, images, ratings |
| `get_product_details` | No | Detailed product lookup by ID |
| `browse_category` | No | Browse by department (Produce, Deli, Bakery, etc.) |
| `find_stores` | No | Find store numbers by city, state, or zip code |
| `get_my_items` | No | Your most frequently purchased items, ranked by purchase frequency |
| `add_to_cart` | Yes | Add products to your real Wegmans cart |
| `get_cart` | Yes | View current cart contents |
| `refresh_my_items` | No | Update purchase history from a browser capture |

The unauthenticated tools work out of the box — no account needed. Cart operations require your Wegmans credentials.

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

Every Wegmans has a numeric store ID used for pricing, inventory, and aisle locations. Use the `find_stores` tool, or:

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

It looks like: `f2abf2c9-055d-4ca9-b51e-59a702c949c5`

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

### Refresh your purchase history

Your purchase history is stored locally in `data/my-items.json`. To update it with fresh data from Wegmans:

1. Log into [wegmans.com](https://www.wegmans.com)
2. Go to [wegmans.com/items](https://www.wegmans.com/items)
3. Open DevTools → Network tab → filter for `algolia`
4. Right-click the first `algolia.net` request → **Copy as fetch**
5. Pass the copied text to `refresh_my_items`

The tool parses the `productID:<score>` patterns from the Algolia request and saves them. Scores represent purchase frequency (higher = more frequently bought).

```
> refresh_my_items({ algolia_payload: "fetch(\"https://qgppr19v8v-dsn.algolia.net/...\")" })

  Updated my-items: 546 products saved. Top score: 546, lowest: 1.
```

## Architecture

```
src/
  index.ts              # MCP server — tool definitions and handlers
  algolia.ts            # Algolia product search client
  auth.ts               # Azure AD B2C OAuth authentication (PKCE flow)
  cart.ts               # Cart operations (add to cart, get cart, product lookup)
  stores.ts             # Store locator (fetches from wegmans.com/api/stores)
  my-items.ts           # Query Algolia for scored product lists
  refresh-my-items.ts   # Parse and save purchase history data

data/
  my-items.json         # Local cache of purchase history (gitignored)

docs/
  api-reference.md      # Documented Wegmans API endpoints
```

### How it works

**Product search** hits Wegmans' Algolia index directly using their public search API key. No authentication needed. Every product has store-specific pricing, aisle locations, and availability — so the `WEGMANS_STORE` setting matters.

**Cart operations** use Wegmans' commerce API at `api.digitaldevelopment.wegmans.cloud`. Authentication goes through Azure AD B2C with a PKCE OAuth flow — the server handles the full login flow (GET authorize page → POST credentials → GET auth code → exchange for token) and caches the access token until it expires.

**Purchase history** ("my items") is a scored list of product IDs that Wegmans stores server-side and injects into the frontend when you visit `/items`. There's no direct API for it — the data gets embedded in an Algolia query as `productID:12345<score=100>` filter patterns. The `refresh_my_items` tool parses these patterns from a captured request.

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

- **Purchase history requires manual refresh** — The "my items" data lives in your browser session and isn't exposed as a standalone API. You need to capture it from DevTools and pass it to `refresh_my_items` to update.
- **No order history** — The server can see your purchase frequency scores but not individual past orders.
- **No coupon management** — The Algolia data includes digital coupon IDs, but clipping/applying coupons is not yet implemented.
- **Single fulfillment type per cart** — The cart API ties each cart to one fulfillment type (instore, pickup, or delivery).

## Prior art

This project was informed by the [wegmans-shopping](https://github.com/nathannorman-toast/wegmans-shopping) project, which uses Playwright to scrape product data via Algolia interception. This MCP server takes a different approach — hitting Algolia directly without a browser for search, and using the commerce API for cart operations.

## License

ISC
