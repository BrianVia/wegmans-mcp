const ALGOLIA_APP_ID = "QGPPR19V8V";
const ALGOLIA_API_KEY = "9a10b1401634e9a6e55161c3a60c200d";
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`;

const DEFAULT_STORE = process.env["WEGMANS_STORE"] ?? "133";

export interface AlgoliaProduct {
  productId: string;
  productName: string;
  price_inStore?: { amount: number; unitPrice?: string };
  price_delivery?: { amount: number; unitPrice?: string };
  images?: string[];
  category?: Array<{ name: string; key: string; seo: string }>;
  categoryPageId?: string[];
  planogram?: { aisle?: string };
  filterTags?: string[];
  isSoldByWeight?: boolean;
  onlineSellByUnit?: string;
  onlineApproxUnitWeight?: number;
  allergensAndWarnings?: string;
  digitalCouponsOfferIds?: string[];
  storeNumber?: string;
  bottleDeposit?: number;
  objectID: string;
  brand?: string;
  size?: string;
  upc?: string | string[];
  rating?: number;
  reviewCount?: number;
  ebtEligible?: boolean;
  fulfilmentType?: string[];
  categories?: { lvl0?: string; lvl1?: string; lvl2?: string };
}

interface AlgoliaResponse {
  results: Array<{
    hits: AlgoliaProduct[];
    nbHits: number;
    page: number;
    nbPages: number;
    hitsPerPage: number;
    processingTimeMS: number;
    query: string;
    index: string;
  }>;
}

export interface SearchOptions {
  query: string;
  storeNumber?: string;
  fulfillmentType?: "instore" | "delivery";
  page?: number;
  hitsPerPage?: number;
  category?: string;
}

export async function searchProducts(options: SearchOptions): Promise<AlgoliaResponse> {
  const {
    query,
    storeNumber = DEFAULT_STORE,
    fulfillmentType = "instore",
    page = 0,
    hitsPerPage = 20,
    category,
  } = options;

  let filters = `storeNumber:${storeNumber} AND fulfilmentType:${fulfillmentType} AND excludeFromWeb:false AND isSoldAtStore:true`;
  if (category) {
    filters += ` AND categoryPageId:"${category}"`;
  }

  const body = {
    requests: [
      {
        indexName: "products",
        analytics: true,
        analyticsTags: [
          "product-search",
          "organic",
          `store-${storeNumber}`,
          `fulfillment-${fulfillmentType}`,
        ],
        attributesToHighlight: [],
        clickAnalytics: true,
        enableRules: true,
        facets: ["*"],
        filters,
        getRankingInfo: false,
        highlightPostTag: "__/ais-highlight__",
        highlightPreTag: "__ais-highlight__",
        maxValuesPerFacet: 100,
        page,
        hitsPerPage,
        query,
        responseFields: [
          "hits",
          "facets",
          "hitsPerPage",
          "nbHits",
          "nbPages",
          "page",
          "processingTimeMS",
          "query",
        ],
      },
    ],
  };

  const response = await fetch(
    `${ALGOLIA_URL}?x-algolia-api-key=${ALGOLIA_API_KEY}&x-algolia-application-id=${ALGOLIA_APP_ID}`,
    {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    throw new Error(`Algolia search failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<AlgoliaResponse>;
}

export function formatProduct(hit: AlgoliaProduct): string {
  const lines: string[] = [];

  lines.push(`**${hit.productName}**`);

  if (hit.brand) lines.push(`Brand: ${hit.brand}`);
  if (hit.size) lines.push(`Size: ${hit.size}`);

  // Price
  if (hit.price_inStore) {
    const price = `$${hit.price_inStore.amount.toFixed(2)}`;
    const unit = hit.price_inStore.unitPrice ? ` (${hit.price_inStore.unitPrice})` : "";
    lines.push(`In-store price: ${price}${unit}`);
  }
  if (hit.price_delivery) {
    const price = `$${hit.price_delivery.amount.toFixed(2)}`;
    const unit = hit.price_delivery.unitPrice ? ` (${hit.price_delivery.unitPrice})` : "";
    lines.push(`Delivery price: ${price}${unit}`);
  }

  // Location
  if (hit.planogram?.aisle) {
    lines.push(`Aisle: ${hit.planogram.aisle}`);
  }

  // Category
  if (hit.category?.length) {
    const cats = hit.category.map((c) => c.name).join(" > ");
    lines.push(`Category: ${cats}`);
  }

  // Tags
  if (hit.filterTags?.length) {
    lines.push(`Tags: ${hit.filterTags.join(", ")}`);
  }

  // Rating
  if (hit.rating) {
    lines.push(`Rating: ${hit.rating}${hit.reviewCount ? ` (${hit.reviewCount} reviews)` : ""}`);
  }

  // Weight
  if (hit.isSoldByWeight) {
    lines.push(`Sold by weight (${hit.onlineSellByUnit ?? "lb"})`);
  }

  // Allergens
  if (hit.allergensAndWarnings) {
    lines.push(`Allergens: ${hit.allergensAndWarnings}`);
  }

  // Image
  if (hit.images?.length) {
    lines.push(`Image: ${hit.images[0]}`);
  }

  lines.push(`Product ID: ${hit.productId}`);

  return lines.join("\n");
}
