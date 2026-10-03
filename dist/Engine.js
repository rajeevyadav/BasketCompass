// Deterministic pricing core: postal/province resolution, package-size parsing,
// Canadian sales tax, per-offer quotes, the store price matrix, and the
// complete-basket plan optimizer. No I/O and no randomness live here so the whole
// module can be reproduced and checked by hand, which is what the test suite does.

export const STORES = ['costco', 'walmart', 'maxi', 'metro', 'iga', 'superc', 'provigo'];

export const NAMES = {
  costco: 'Costco', walmart: 'Walmart', maxi: 'Maxi', metro: 'Metro',
  iga: 'IGA', superc: 'Super C', provigo: 'Provigo',
};

export const PROVINCES = {
  QC: 'Quebec', ON: 'Ontario', BC: 'British Columbia', AB: 'Alberta',
  SK: 'Saskatchewan', MB: 'Manitoba', NS: 'Nova Scotia', NB: 'New Brunswick',
  NL: 'Newfoundland & Labrador', PE: 'Prince Edward Island', YT: 'Yukon',
  NT: 'Northwest Territories', NU: 'Nunavut',
};

// Standard combined sales tax per province as [federal, provincial] fractions.
// Federal covers GST or the federal part of HST; provincial covers PST/QST or the
// provincial part of HST (0 where a single HST or GST-only rate applies). These
// are standard rates only; product- and province-specific exemptions are not here.
export const RATES = {
  QC: [0.05, 0.09975], ON: [0.13, 0], BC: [0.05, 0.07], AB: [0.05, 0],
  SK: [0.05, 0.06], MB: [0.05, 0.07], NS: [0.14, 0], NB: [0.15, 0],
  NL: [0.15, 0], PE: [0.15, 0], YT: [0.05, 0], NT: [0.05, 0], NU: [0.05, 0],
};

// Format integer cents as Canadian dollars for display.
export const money = (cents) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);

// Normalize and validate a Canadian postal code, returning it as "ANA NAN".
// Rejects anything that is not the standard letter/digit pattern so a typo never
// silently resolves to the wrong province's tax.
export function postal(raw) {
  const compact = String(raw).toUpperCase().replace(/\s/g, '');
  if (!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(compact)) {
    throw Error('Enter a valid Canadian postal code, such as H7N 1A1.');
  }
  return compact.slice(0, 3) + ' ' + compact.slice(3);
}

// Resolve a province code from the first character of a postal code. The X prefix
// spans both territories, so the first forward sortation area decides Nunavut
// (X0A/X0B/X0C) versus Northwest Territories.
export function province(postalCode) {
  const firstLetter = postalCode[0];
  const byFirstLetter = {
    A: 'NL', B: 'NS', C: 'PE', E: 'NB', G: 'QC', H: 'QC', J: 'QC', K: 'ON',
    L: 'ON', M: 'ON', N: 'ON', P: 'ON', R: 'MB', S: 'SK', T: 'AB', V: 'BC', Y: 'YT',
    X: (postalCode.replace(/\s/g, '').startsWith('X0A')
        || postalCode.startsWith('X0B') || postalCode.startsWith('X0C')) ? 'NU' : 'NT',
  };
  return byFirstLetter[firstLetter];
}

// Parse a package size string into a comparable {value, unit}. Weight/volume
// collapse to a base unit (grams or millilitres) so a 2 L and a 2000 ml offer
// compare directly; multipacks like "4 x 500 ml" multiply out. Countable packs
// ("12 each", "12 eggs") return an 'each' unit. Returns null when nothing parses.
export function size(raw) {
  const text = String(raw).toLowerCase().replace(/,/g, '.');

  const multipackMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
  const packCount = multipackMatch ? +multipackMatch[1] : 1;

  let measure = multipackMatch
    ? [multipackMatch[0], multipackMatch[2], multipackMatch[3]]
    : text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);

  if (measure) {
    const totalAmount = +measure[1] * packCount;
    const unit = measure[2];
    const toBaseFactor = unit === 'kg' || unit === 'l' ? 1000 : 1;
    const baseUnit = unit === 'l' || unit === 'ml' ? 'ml' : 'g';
    return { value: totalAmount * toBaseFactor, unit: baseUnit };
  }

  const countMatch = text.match(/^(\d+)\s*(?:each|ea|units?|unité|unites?|count|ct|pk|pack|eggs|œufs)\b/);
  return countMatch ? { value: +countMatch[1], unit: 'each' } : null;
}

// Tax on an integer-cents amount for an item category and province. GST/HST and
// the provincial portion are rounded separately, matching how retailers compute
// them. An 'unknown' category or missing province returns null, which blocks a
// checkout total downstream rather than guessing.
export function tax(cents, category, provinceCode) {
  if (category === 'unknown' || !RATES[provinceCode]) return null;
  const [federalRate, provincialRate] = RATES[provinceCode];
  if (category === 'zero') return 0;
  if (category === 'federal') return Math.round(cents * federalRate);
  if (category !== 'standard') return null;
  return Math.round(cents * federalRate) + Math.round(cents * provincialRate);
}

// Turn one store offer into a quote for the quantity an item needs: how many whole
// packs, the pack subtotal, tax, deposits, and the all-in total. Returns null when
// the offer is unusable — malformed price, stale (>7 days) or future-dated
// observation, expired or not-yet-started sale, or a size that cannot satisfy the
// item's unit. Demo offers skip the freshness check because they are fixed samples.
export function quote(item, offer, provinceCode, now = Date.now()) {
  if (!offer || !Number.isInteger(offer.cents) || offer.cents < 0 || offer.cents > 100000000) return null;

  if (offer.source !== 'demo') {
    const observedAt = Date.parse(offer.observed);
    const olderThanSevenDays = now - observedAt > 7 * 86400000;
    const datedInFuture = observedAt > now + 86400000;
    if (!offer.observed || !Number.isFinite(observedAt) || olderThanSevenDays || datedInFuture) return null;
  }
  if (offer.expires && Date.parse(offer.expires) < now) return null;
  if (offer.starts && Date.parse(offer.starts) > now) return null;

  let packsNeeded;
  if (item.unit === 'pack') {
    packsNeeded = Math.ceil(item.quantity);
  } else {
    const baseUnitForItem = { kg: 'g', g: 'g', L: 'ml', ml: 'ml', each: 'each' }[item.unit];
    const amountNeeded = item.quantity * (item.unit === 'kg' || item.unit === 'L' ? 1000 : 1);
    const packSize = size(offer.size);
    if (!packSize || packSize.unit !== baseUnitForItem || packSize.value <= 0) return null;
    packsNeeded = Math.ceil(amountNeeded / packSize.value);
  }
  if (!Number.isFinite(packsNeeded) || packsNeeded <= 0) return null;

  const subtotal = packsNeeded * offer.cents;
  const taxDue = tax(subtotal, item.tax, provinceCode);
  const deposit = packsNeeded * (offer.deposit || 0);
  return {
    offer,
    packs: packsNeeded,
    subtotal,
    tax: taxDue,
    deposit,
    total: taxDue === null ? null : subtotal + taxDue + deposit,
  };
}

// Build the price matrix: one row per enabled item, each row holding the cheapest
// usable quote at every selected store (or null where none is usable). Lowest
// all-in total wins; items whose tax is unknown fall back to comparing subtotals.
export function matrix(items, stores, provinceCode) {
  return items.filter((item) => item.enabled).map((item) => ({
    item,
    cells: Object.fromEntries(stores.map((store) => {
      const quotesForStore = (item.offers || [])
        .filter((offer) => offer.store === store)
        .map((offer) => quote(item, offer, provinceCode))
        .filter(Boolean)
        .sort((a, b) => (a.total ?? a.subtotal) - (b.total ?? b.subtotal));
      return [store, quotesForStore[0] || null];
    })),
  }));
}

// Find the cheapest complete-basket plan over the selected stores, visiting at
// most maxStores and charging extraStop for each store beyond the first. Only
// complete baskets (every row priced at a chosen store) are ranked, so a cheap
// but partial basket never wins. Returns the best plan and the best single-store
// plan for comparison.
export function optimize(rows, stores, maxStores = 2, extraStop = 0) {
  if (!rows.length) return { best: null, single: null };

  const plans = [];
  for (let storeSubset = 1; storeSubset < 2 ** stores.length; storeSubset++) {
    const chosenStores = stores.filter((_, index) => storeSubset & (1 << index));
    if (chosenStores.length > maxStores) continue;

    const lines = [];
    let subtotal = 0, taxes = 0, deposit = 0;
    for (const row of rows) {
      const cheapestForRow = chosenStores
        .map((store) => ({ store, quote: row.cells[store] }))
        .filter((candidate) => candidate.quote?.total !== null && candidate.quote?.total !== undefined)
        .sort((a, b) => a.quote.total - b.quote.total);
      if (!cheapestForRow.length) { lines.length = 0; break; }
      const pick = cheapestForRow[0];
      lines.push({ item: row.item, ...pick });
      subtotal += pick.quote.subtotal;
      taxes += pick.quote.tax;
      deposit += pick.quote.deposit;
    }
    if (lines.length !== rows.length) continue;

    const storesUsed = [...new Set(lines.map((line) => line.store))];
    const checkout = subtotal + taxes + deposit;
    const travel = Math.max(0, storesUsed.length - 1) * extraStop;
    plans.push({ stores: storesUsed, lines, subtotal, taxes, deposit, checkout, travel, total: checkout + travel });
  }

  plans.sort((a, b) => a.total - b.total || a.stores.length - b.stores.length);
  return {
    best: plans[0] || null,
    single: plans.filter((plan) => plan.stores.length === 1).sort((a, b) => a.total - b.total)[0] || null,
  };
}

// Validate an imported backup before any of it touches state. Every bound here is
// deliberate: a backup is untrusted input in a public app, so malformed lists,
// items, or offers are rejected with a clear message rather than stored.
export function validateBackup(backup) {
  if (!backup || backup.version !== 1 || !Array.isArray(backup.lists)
      || !backup.lists.length || backup.lists.length > 50) {
    throw Error('This is not a BasketCompass backup.');
  }

  const seenListIds = new Set();
  for (const list of backup.lists) {
    if (typeof list.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(list.id)
        || seenListIds.has(list.id) || typeof list.name !== 'string' || list.name.length > 80
        || !Array.isArray(list.items) || list.items.length > 100) {
      throw Error('Invalid list in backup.');
    }
    seenListIds.add(list.id);

    for (const item of list.items) {
      if (typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id)
          || typeof item.name !== 'string' || item.name.length > 200
          || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 10000
          || !['pack', 'g', 'kg', 'ml', 'L', 'each'].includes(item.unit)
          || !['zero', 'standard', 'federal', 'unknown'].includes(item.tax)
          || typeof item.enabled !== 'boolean' || !Array.isArray(item.offers) || item.offers.length > 200) {
        throw Error('Invalid item in backup.');
      }

      for (const offer of item.offers) {
        if (!STORES.includes(offer.store) || !Number.isInteger(offer.cents)
            || offer.cents < 0 || offer.cents > 100000000 || typeof offer.size !== 'string'
            || !['demo', 'manual', 'epiceries'].includes(offer.source)
            || (offer.deposit !== undefined && (!Number.isInteger(offer.deposit) || offer.deposit < 0))
            || (offer.observed !== undefined && !Number.isFinite(Date.parse(offer.observed)))) {
          throw Error('Invalid price in backup.');
        }
      }
    }
  }
  return backup;
}
