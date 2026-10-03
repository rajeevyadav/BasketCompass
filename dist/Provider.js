// Adapter for the documented public épiceries.ca price feed, plus the labelled
// offline demo data. Requests are cached briefly and paced so the app never
// hammers the source, and a failed lookup is surfaced to the caller rather than
// quietly falling back to invented prices.
import { STORES } from './Engine.js';

const FIVE_MINUTES = 300000;
const MIN_REQUEST_GAP_MS = 550;

const responseCache = new Map();
let lastRequestTime = 0;

// Call the feed for a set of query parameters, serving a cached response within
// five minutes and otherwise pacing requests at least ~550 ms apart. Throws a
// human-readable error on a non-OK response or a feed-level failure.
export async function api(params) {
  const cacheKey = new URLSearchParams(params).toString();
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.time < FIVE_MINUTES) return cached.data;

  const waitMs = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestTime));
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestTime = Date.now();

  const response = await fetch('https://epiceries.ca/api?' + cacheKey, {
    signal: AbortSignal.timeout(15000),
    credentials: 'omit',
  });
  if (!response.ok) {
    throw Error('Price source returned ' + response.status + '. Try again later or enter a price manually.');
  }
  const payload = await response.json();
  if (!payload.ok) throw Error(payload.error?.message || 'Price source unavailable.');

  responseCache.set(cacheKey, { time: Date.now(), data: payload.data });
  return payload.data;
}

// Common English grocery terms mapped to the French terms the Quebec feed indexes,
// so a user can search "milk" and still match "lait". French terms pass through.
const SEARCH_ALIASES = {
  'organic milk': 'lait biologique', 'milk': 'lait', 'eggs': 'œufs',
  'organic eggs': 'œufs biologiques', 'bananas': 'bananes', 'banana': 'bananes',
  'yogurt': 'yogourt', 'greek yogurt': 'yogourt grec', 'butter': 'beurre',
  'cheese': 'fromage', 'bread': 'pain', 'rice': 'riz', 'shampoo': 'shampooing',
  'dishwasher tablets': 'lave-vaisselle', 'apples': 'pommes', 'avocado': 'avocat',
};

// Search products by free text, returning only results with a usable string id.
export async function search(queryText) {
  const trimmed = queryText.trim();
  const data = await api({
    endpoint: 'search',
    q: SEARCH_ALIASES[trimmed.toLowerCase()] || trimmed,
    limit: 20,
  });
  return (data.results || []).filter((product) => typeof product.id === 'string');
}

// Fetch one product and normalize its prices into the offer shape the engine uses:
// integer cents, a size string, the sale flag, an observation date, and a source
// link. Offers for unknown stores or with non-finite prices are dropped.
export async function product(id) {
  const raw = await api({ endpoint: 'product', id });
  return {
    ...raw,
    offers: (raw.prices || [])
      .filter((price) => STORES.includes(price.store)
        && Number.isFinite(+price.price) && +price.price >= 0)
      .map((price) => ({
        store: price.store,
        cents: Math.round(+price.price * 100),
        size: price.size || raw.size || '',
        sale: price.discounted === true,
        observed: price.date
          || (price.timestamp ? new Date(price.timestamp * 1000).toISOString() : raw.updated),
        link: price.link || raw.url,
        source: 'epiceries',
        deposit: 0,
      })),
  };
}

// Fixed, clearly-labelled sample basket for offline and demo use. Every price is
// invented for testing and must never be presented as a current store price.
export function demo() {
  const now = new Date().toISOString();
  const samples = [
    { name: 'Organic milk', brand: 'Sample organic milk', size: '2 L', tax: 'zero', quantity: 4, unit: 'L', prices: [639, 599, 579, 629, 649, 569, 609] },
    { name: 'Eggs', brand: 'Sample large eggs', size: '12 each', tax: 'zero', quantity: 24, unit: 'each', prices: [419, 429, 399, 469, 489, 389, 439] },
    { name: 'Bananas', brand: 'Sample bananas', size: '1 kg', tax: 'zero', quantity: 2, unit: 'kg', prices: [229, 189, 179, 219, 239, 199, 209] },
    { name: 'Greek yogurt', brand: 'Sample plain yogurt', size: '750 g', tax: 'zero', quantity: 1, unit: 'pack', prices: [649, 599, 549, 499, 629, 529, 579] },
    { name: 'Shampoo', brand: 'Sample shampoo', size: '500 ml', tax: 'standard', quantity: 1, unit: 'pack', prices: [1299, 899, 999, 1099, 1199, 949, 1049] },
  ];
  return samples.map((sample, sampleIndex) => ({
    id: crypto.randomUUID(),
    name: sample.name,
    brand: sample.brand,
    quantity: sample.quantity,
    unit: sample.unit,
    tax: sample.tax,
    enabled: true,
    offers: STORES.map((store, storeIndex) => ({
      store,
      cents: sample.prices[storeIndex],
      size: sample.size,
      sale: (sampleIndex + storeIndex) % 3 === 0,
      source: 'demo',
      observed: now,
      deposit: 0,
    })),
  }));
}
