import { type AlgoliaProduct } from "./algolia.js";
import { getAccessToken } from "./auth.js";

const CART_API =
  "https://api.digitaldevelopment.wegmans.cloud/commerce/cart/carts/lineitems?api-version=2024-02-19-preview";
const CART_GET_API =
  "https://api.digitaldevelopment.wegmans.cloud/commerce/cart/carts?api-version=2024-02-19-preview";

interface CartLineItem {
  custom: Array<{ name: string; value: unknown }>;
  distributionChannelKey: string;
  isAlcoholic: boolean;
  isSoldByWeight: boolean;
  onlineApproxUnitWeight: number;
  onlineSellByUnit: string;
  quantity: number;
  sku: string;
  standalonePrice: number;
}

interface CartRequest {
  StoreKey: string;
  cartData: Array<{
    custom: Array<{ name: string; value: string }>;
    isAlcoholic: boolean;
    lineItems: CartLineItem[];
  }>;
  customerEmail: string;
  customerID: string;
}

export interface ExistingLineItem {
  productKey?: string;
  variant: {
    sku: string;
    attributesRaw?: Array<{ name: string; value: unknown }>;
  };
  name: string;
  quantity: number;
  price: { value: { centAmount: number } };
  custom?: {
    customFieldsRaw?: Array<{ name: string; value: unknown }>;
  };
}

export interface CartResponse {
  grocery?: {
    lineItems: ExistingLineItem[];
    custom?: {
      customFieldsRaw?: Array<{ name: string; value: unknown }>;
    };
  };
}

export async function getCart(): Promise<CartResponse> {
  const accessToken = await getAccessToken();
  const res = await fetch(CART_GET_API, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      origin: "https://www.wegmans.com",
      referer: "https://www.wegmans.com/",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch cart: ${res.status}`);
  }

  return (await res.json()) as CartResponse;
}

function getRequiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

export async function lookupProduct(
  productId: string,
  storeNumber: string
): Promise<AlgoliaProduct | null> {
  const ALGOLIA_APP_ID = "QGPPR19V8V";
  const ALGOLIA_API_KEY = "9a10b1401634e9a6e55161c3a60c200d";
  const url = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries?x-algolia-api-key=${ALGOLIA_API_KEY}&x-algolia-application-id=${ALGOLIA_APP_ID}`;

  const objectID = `${storeNumber}-${productId}`;
  const body = {
    requests: [
      {
        indexName: "products",
        filters: `objectID:${objectID}`,
        hitsPerPage: 1,
        attributesToHighlight: [],
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    results: Array<{ hits: AlgoliaProduct[] }>;
  };
  return data.results[0]?.hits[0] ?? null;
}

/**
 * Fetch the current cart and convert existing line items to the POST format
 * so we can preserve them when adding new items.
 */
async function getCurrentCartLineItems(
  accessToken: string,
  storeNumber: string,
  fulfillmentType: string
): Promise<CartLineItem[]> {
  const data = await getCart();
  const lineItems = data.grocery?.lineItems ?? [];

  const channelSuffix =
    fulfillmentType === "instore"
      ? "Instore"
      : fulfillmentType === "delivery"
        ? "Delivery"
        : "Pickup";

  return lineItems.map((li) => {
    // Rebuild the custom fields from the existing cart item
    const customFields: Array<{ name: string; value: unknown }> =
      li.custom?.customFieldsRaw ?? [];

    return {
      custom: customFields,
      distributionChannelKey: `${storeNumber}-${channelSuffix}`,
      isAlcoholic: false,
      isSoldByWeight:
        (customFields.find((f) => f.name === "isSoldByWeight")?.value as boolean) ?? false,
      onlineApproxUnitWeight: 0,
      onlineSellByUnit:
        (customFields.find((f) => f.name === "onlineSellByUnit")?.value as string) ?? "ea",
      quantity: li.quantity,
      sku: li.variant.sku,
      standalonePrice: li.price.value.centAmount,
    };
  });
}

function buildCartLineItem(
  product: AlgoliaProduct,
  quantity: number,
  storeNumber: string,
  fulfillmentType: string
): CartLineItem {
  const priceInCents = product.price_inStore
    ? Math.round(product.price_inStore.amount * 100)
    : 0;

  const categoryName = product.category?.[0]?.name ?? "Unknown";
  const categoryId = product.category?.[0]?.key ?? "";

  const channelSuffix =
    fulfillmentType === "instore"
      ? "Instore"
      : fulfillmentType === "delivery"
        ? "Delivery"
        : "Pickup";

  const upcValue = Array.isArray(product.upc) ? product.upc : product.upc ? [product.upc] : [];
  const fulfillmentTypes = product.fulfilmentType ?? ["instore", "pickup", "delivery"];

  return {
    custom: [
      { name: "category", value: categoryName },
      { name: "categoryId", value: categoryId },
      { name: "itemLevelAdjustments", value: "[]" },
      { name: "isSoldAtStore", value: true },
      { name: "ebtEligible", value: product.ebtEligible ?? true },
      { name: "isAvailable", value: true },
      {
        name: "planogram",
        value: JSON.stringify(product.planogram ?? {}),
      },
      { name: "note", value: "" },
      { name: "bottleDeposit", value: product.bottleDeposit ?? 0 },
      { name: "upc", value: upcValue },
      {
        name: "fulfillmentTypes",
        value: fulfillmentTypes,
      },
      { name: "maxQuantity", value: "20" },
    ],
    distributionChannelKey: `${storeNumber}-${channelSuffix}`,
    isAlcoholic: false,
    isSoldByWeight: product.isSoldByWeight ?? false,
    onlineApproxUnitWeight: product.onlineApproxUnitWeight ?? 0,
    onlineSellByUnit: product.onlineSellByUnit ?? "ea",
    quantity,
    sku: product.productId,
    standalonePrice: priceInCents,
  };
}

export interface AddToCartResult {
  success: boolean;
  product: AlgoliaProduct;
  quantity: number;
  totalCartItems?: number;
  response?: unknown;
  error?: string;
}

export async function addToCart(
  productId: string,
  quantity: number,
  storeNumber?: string,
  fulfillmentType?: string
): Promise<AddToCartResult> {
  const customerEmail = getRequiredEnv("WEGMANS_EMAIL");
  const customerID = getRequiredEnv("WEGMANS_CUSTOMER_ID");
  const store = storeNumber ?? process.env["WEGMANS_STORE"] ?? "133";
  const fulfillment = fulfillmentType ?? "instore";

  // Look up the product to get full details
  const product = await lookupProduct(productId, store);
  if (!product) {
    return {
      success: false,
      product: { productId, productName: "Unknown" } as AlgoliaProduct,
      quantity,
      error: `Product ${productId} not found at store ${store}`,
    };
  }

  const accessToken = await getAccessToken();
  const storeKey = await getStoreKey(store);

  // Fetch existing cart items so we don't blow them away
  const existingItems = await getCurrentCartLineItems(accessToken, store, fulfillment);

  // Merge: if the product already exists in cart, update its quantity; otherwise append
  const newItem = buildCartLineItem(product, quantity, store, fulfillment);
  let merged = false;
  const mergedItems = existingItems.map((item) => {
    if (item.sku === newItem.sku) {
      merged = true;
      return { ...item, quantity: item.quantity + quantity, custom: newItem.custom };
    }
    return item;
  });
  if (!merged) {
    mergedItems.push(newItem);
  }

  const cartRequest: CartRequest = {
    StoreKey: storeKey,
    cartData: [
      {
        custom: [
          { name: "orderLevelAdjustments", value: "[]" },
          { name: "storeNumber", value: store },
          { name: "fulfillmentType", value: fulfillment },
        ],
        isAlcoholic: false,
        lineItems: mergedItems,
      },
    ],
    customerEmail,
    customerID,
  };

  const res = await fetch(CART_API, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      origin: "https://www.wegmans.com",
      referer: "https://www.wegmans.com/",
    },
    body: JSON.stringify(cartRequest),
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      success: false,
      product,
      quantity,
      error: `Cart API error ${res.status}: ${text}`,
    };
  }

  const responseData = await res.json();
  return {
    success: true,
    product,
    quantity,
    totalCartItems: mergedItems.length,
    response: responseData,
  };
}

let storeKeyCache: Map<string, string> = new Map();

async function getStoreKey(storeNumber: string): Promise<string> {
  const cached = storeKeyCache.get(storeNumber);
  if (cached) return cached;

  const res = await fetch("https://www.wegmans.com/api/stores");
  if (!res.ok) {
    return `${storeNumber}-UNKNOWN`;
  }

  const stores = (await res.json()) as Array<{
    storeNumber: number;
    key: string;
  }>;
  for (const s of stores) {
    storeKeyCache.set(String(s.storeNumber), s.key);
  }

  return storeKeyCache.get(storeNumber) ?? `${storeNumber}-UNKNOWN`;
}
