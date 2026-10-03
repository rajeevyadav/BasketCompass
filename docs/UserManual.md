# BasketCompass — test release 0.1.0

Postal code → store selection → single-item search or saved list → price matrix → up to three-store plan.

## Run locally

No dependencies or build step are required. Use `python3 -m http.server 8080 --directory dist` and open http://localhost:8080. A secure HTTPS deployment or localhost is needed for service workers and installation. Do not open index.html directly from the filesystem. Run checks with `npm test`.

## Test the complete flow

1. Enter H7N 1A1, select stores, and continue.
2. Select Offline demo prices and load the sample weekly list.
3. Change quantities, disable an item, and change maximum stores and extra-stop cost. Confirm the matrix and plan update.
4. Create, duplicate, rename and delete lists. Reload and check persistence.
5. Export a JSON backup. Import it; imported copies preserve current lists.
6. Add a manual Costco price, package size, tax category and optional deposit. Compare it.
7. In live mode, search `lait` or `organic milk`, select an exact product, confirm tax, then add it to a list.
8. Open once online, then test offline reload and saved lists. Use the Install app instructions for phone or desktop.

## Known limits — do not represent as full live coverage

- The documented public épiceries.ca adapter covers six Quebec banners, not branch-specific prices. This development environment blocked outbound API requests (HTTP 403); successful real API responses and cross-origin behaviour have not been independently verified here. Contract fixtures test mapping only. The app surfaces failures and never falls back silently to demo prices.
- Costco has manual price entry, a retailer link and a maps search. Automatic Costco prices and all-retailer flyer aggregation are not implemented.
- Postal-code syntax and province are resolved locally. This is not a deliverability validator, store locator, radius filter or distance service. Locations are checked with external maps.
- Product matching is user-confirmed exact SKU selection. Brand/organic requirements are not inferred. Saved items retain observed offers, which are excluded after seven days or expiry. No silent substitute products.
- Tax uses confirmed item categories and current standard province rates; product-specific provincial exemptions, special levies, coupon treatments and cash rounding require verification. Unknown tax prevents full checkout recommendations. Deposits must be entered manually. Rates verified 2026-10-03 against CRA and Revenu Québec.
- Shopping plans enumerate selected store combinations, round up to whole packs, require a complete basket and apply a user-entered per-extra-stop cost. They do not compute routes, historical deal scores or membership fees.
- Local storage is not encrypted. Browser data clearing/eviction removes it. Export/import supports backups and device transfers; there is no automatic synchronization or account system.
- Source terms and product IDs are sent directly to épiceries.ca with a five-minute session cache and sequential rate pacing. Lists and postal code are not transmitted by application code. External images/maps/retailer sites make their own requests. Attribution is shown. Retailer marks and images remain their owners’ property.
- Hosting is owner-private; the hosting platform may require ChatGPT sign-in. Installation and offline authentication behaviour require actual device testing.
- Browser visual/interaction and installed-device QA were unavailable in the supplied environment. Do not claim 100% acceptance or production readiness.

## Architecture

`dist/engine.js`: deterministic postal, size, tax, matrix, complete-basket optimization and backup validation.
`dist/provider.js`: documented public feed adapter, cache, query aliases and explicit test samples.
`dist/app.js`: responsive workflows, local persistence, backup, manual observations and install help.
`dist/sw.js`: local app-shell cache only; it rejects redirected/auth pages during installation and never caches external prices.

## Source references

- https://epiceries.ca/developers
- https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html
- https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/basic-rules-for-applying-the-gsthst-and-qst/tables-of-gst-and-qst-rates/
