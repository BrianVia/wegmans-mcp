# Wegmans API Reference

Documented API endpoints discovered from network traffic analysis and the [wegmans-shopping](https://github.com/nathannorman-toast/wegmans-shopping) reference project.

## Public APIs (No Auth Required)

### Algolia Product Search

Wegmans uses Algolia for product search. The public search-only API key allows direct queries.

- **URL**: `https://qgppr19v8v-dsn.algolia.net/1/indexes/*/queries`
- **Method**: POST
- **Auth**: Query params `x-algolia-api-key` and `x-algolia-application-id`
- **App ID**: `QGPPR19V8V`
- **API Key**: `9a10b1401634e9a6e55161c3a60c200d` (public search-only key)
- **Index**: `products`

#### Key Filter Fields

| Field | Example | Notes |
|-------|---------|-------|
| `storeNumber` | `133` | Required — products/prices are store-specific |
| `fulfilmentType` | `instore`, `delivery` | Note: "fulfilment" not "fulfillment" |
| `excludeFromWeb` | `false` | Always filter to `false` |
| `isSoldAtStore` | `true` | Filter out non-available items |
| `categoryPageId` | `"Produce"` | For category browsing |

#### Product Fields

| Field | Type | Description |
|-------|------|-------------|
| `productId` | string | Unique product identifier |
| `productName` | string | Display name |
| `brand` | string | Brand name |
| `size` | string | Package size |
| `price_inStore` | `{ amount, unitPrice }` | In-store price |
| `price_delivery` | `{ amount, unitPrice }` | Delivery price |
| `images` | string[] | Product image URLs |
| `category` | array | Hierarchical category chain |
| `categoryPageId` | string[] | Category path (e.g. `"Produce > Fruit > Bananas"`) |
| `planogram.aisle` | string | Physical aisle location in store |
| `filterTags` | string[] | Tags like "Organic", "Wegmans Brand", "Food You Feel Good About" |
| `isSoldByWeight` | boolean | Weight-based pricing |
| `onlineSellByUnit` | string | Unit type (e.g. "Each", "lb") |
| `onlineApproxUnitWeight` | number | Approximate weight per unit |
| `allergensAndWarnings` | string | Allergen info |
| `digitalCouponsOfferIds` | string[] | Available digital coupon IDs |
| `rating` | number | Average rating |
| `reviewCount` | number | Number of reviews |
| `upc` | string | UPC barcode |
| `bottleDeposit` | number | Bottle deposit amount |

#### Rate Limits

From response headers: `x-wegmans-ratelimit: 50000` calls per period.

### Store Locator

- **URL**: `https://www.wegmans.com/api/stores`
- **Method**: GET
- **Auth**: None required

Returns all ~114 Wegmans store locations with:
- `storeNumber` — numeric ID used in Algolia filters
- `name`, `city`, `stateAbbreviation`, `zip`, `streetAddress`
- `latitude`, `longitude`
- `phoneNumber`
- `hasPharmacy`, `hasPickup`, `hasDelivery`, `hasECommerce`
- `sellsAlcohol`, `alcoholTypesForSale`
- `slug` — URL-friendly identifier (e.g. `reston-va`)
- `aislePositionMapping` — JSON mapping of aisle names to sort positions
- `openState` — e.g. "Open"

#### Single Store Lookup

- **URL**: `https://www.wegmans.com/api/stores/store-number/{storeNumber}`
- **Method**: GET

### Categories

- **URL**: `https://www.wegmans.com/api/categories/v3/{fulfillmentType}/{storeNumber}?categoryKeys=[...]`
- **Method**: GET
- **Example**: `/api/categories/v3/instore/133?categoryKeys=["2957335","2952090"]`

## Authenticated APIs

These require Azure AD B2C authentication (OAuth 2.0 + PKCE).

- **Auth Provider**: `myaccount.wegmans.com` (Azure AD B2C)
- **Client ID**: `38c78f8d-d124-4796-8430-1cd476d9a982`
- **Scopes**: Users.Profile.Read/Write, DigitalCoupons.Offers, InstacartConnect.*, Commerce.SignalR, Feedback.Write

### Cart Management

- **URL**: `https://www.wegmans.com/commerce/cart/carts/lineitems`
- **Method**: GET
- **Auth**: Bearer token required

### Real-time Updates

- **Protocol**: WebSocket via Azure SignalR
- **Used for**: Cart sync, order status updates

## Third-Party Integrations

| Service | Purpose |
|---------|---------|
| Algolia | Product search |
| Instacart | Delivery/pickup fulfillment |
| Adobe Experience Cloud | Analytics, personalization (AJO) |
| Bazaarvoice | Product reviews |
| LaunchDarkly | Feature flags |
| Riskified | Fraud detection |
