// Application shell: rendering, local persistence, search and list workflows,
// backups, manual price entry, and install help. All product-safety logic (tax,
// quotes, the plan optimizer, backup validation) lives in Engine.js; this file is
// the UI around it. User text is HTML-escaped on the way into every template.
import {STORES, NAMES, PROVINCES, RATES, money, postal, province, size, quote, matrix, optimize, validateBackup} from './Engine.js';
import {search, product, demo} from './Provider.js';

const select = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const newId = () => crypto.randomUUID();

const retailerUrls = {costco:'https://www.costco.ca/',walmart:'https://www.walmart.ca/',maxi:'https://www.maxi.ca/',metro:'https://www.metro.ca/',iga:'https://www.iga.net/',superc:'https://www.superc.ca/',provigo:'https://www.provigo.ca/'};

// Local-storage key. It is versioned so a future breaking change can migrate
// rather than silently misread older saved lists; do not change it casually.
const STORAGE_KEY = 'basketcompass-v1';
let state = {version:1, postal:'', province:'QC', stores:[...STORES], lists:[{id:newId(), name:'Weekly groceries', items:[]}], active:'', maxStores:2, extraStop:0, mode:'live'};

// Load saved state, revalidating everything untrusted. A corrupt store must not
// crash the app, so a parse/validation failure leaves the defaults and warns.
let storageIssue = '';
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const saved = validateBackup(JSON.parse(raw));
    state = {...state, ...saved};
    state.postal = saved.postal ? postal(saved.postal) : '';
    state.province = PROVINCES[saved.province] ? saved.province : province(state.postal) || 'QC';
    state.stores = Array.isArray(saved.stores) ? saved.stores.filter((store) => STORES.includes(store)) : STORES;
    state.maxStores = [1,2,3].includes(saved.maxStores) ? saved.maxStores : 2;
    state.extraStop = Number.isFinite(saved.extraStop) && saved.extraStop >= 0 ? saved.extraStop : 0;
    state.mode = saved.mode === 'demo' ? 'demo' : 'live';
  }
} catch {
  storageIssue = 'Saved data could not be loaded. Import a backup to recover your lists.';
}

if (!state.lists.some((list) => list.id === state.active)) state.active = state.lists[0]?.id;

// Transient view state, not persisted.
let stage = state.postal ? 'work' : 'postal';
let tab = 'search';
let results = [];
let current = null;
let busy = false;
let lastQuery = '';
let error = '';
let deferredInstall = null;

// Persist state. A full device store is surfaced, not swallowed, so the user can
// export a backup before losing anything.
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageIssue = '';
    return true;
  } catch {
    storageIssue = 'Device storage is unavailable or full. Export a backup before closing this page.';
    toast(storageIssue);
    return false;
  }
}

function toast(message) {
  select('#toast').textContent = message;
  select('#toast').style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => select('#toast').style.display = 'none', 5500);
}

function modal(html) {
  select('#modal-content').innerHTML = html;
  select('#modal').showModal();
}
select('#modal-close').onclick = () => select('#modal').close();

function list() {
  return state.lists.find((entry) => entry.id === state.active) || state.lists[0];
}

function stepper() {
  return `<div class="steps"><span class="${stage==='postal'?'active':''}"><span class="step-number">1</span>Location</span><span class="${stage==='stores'?'active':''}"><span class="step-number">2</span>Stores</span><span class="${stage==='work'?'active':''}"><span class="step-number">3</span>Search & lists</span></div>`;
}

function render() {
  const locationButton = select('#location');
  locationButton.hidden = !state.postal;
  locationButton.textContent = state.postal + ' · ' + state.province;
  locationButton.onclick = () => { stage = 'postal'; render(); };
  if (stage === 'postal') renderPostal();
  else if (stage === 'stores') renderStores();
  else renderWork();
}

function renderPostal() {
  select('#app').innerHTML = stepper() + `<section class="onboard"><div><span class="eyebrow">A better grocery run</span><h1>Start local.<br>Shop smarter.</h1><p class="intro">Compare the items you actually buy. Build a reusable list, see prices side by side, and choose a shopping plan.</p><p class="fine">Phone, tablet, or desktop.<br>Your lists stay in this browser, on this device.</p></div><form class="card" id="postal-form"><h2>Where are you shopping?</h2><label for="postal">Canadian postal code</label><input id="postal" class="postal-input" autocomplete="postal-code" inputmode="text" placeholder="H7N 1A1" maxlength="7" value="${escapeHtml(state.postal)}" required><p class="error" id="postal-error" role="alert"></p><button class="full" type="submit">Choose stores</button><p class="fine">Postal code sets your province for estimated tax. Live price coverage currently uses a Quebec price feed; branch availability must be checked.</p></form></section>`;
  select('#postal-form').onsubmit = (event) => {
    event.preventDefault();
    try {
      state.postal = postal(select('#postal').value);
      state.province = province(state.postal);
      save();
      stage = 'stores';
      render();
    } catch (postalError) {
      select('#postal-error').textContent = postalError.message;
    }
  };
}

function renderStores() {
  select('#app').innerHTML = stepper() + `<span class="eyebrow">${escapeHtml(state.postal)} · ${PROVINCES[state.province]}</span><h1>Choose your stores</h1><p class="muted">Select the retailers you shop at. Use “Find locations” to check branches near your postal code.</p><div class="notice info">${state.province==='QC'?'Live source: six Quebec retailer banners. The feed does not resolve branch-specific prices or distance.':'Outside Quebec: live local coverage is unavailable. You can compare manually entered prices or use the labelled demo.'} Costco prices can be entered manually.</div><div class="stores">${STORES.map((store)=>`<div class="store ${state.stores.includes(store)?'selected':''}"><label for="store-${store}">${NAMES[store]}<input id="store-${store}" type="checkbox" data-store="${store}" ${state.stores.includes(store)?'checked':''}></label><small>${store==='costco'?'Manual prices · membership required':'Quebec price feed + manual prices'}</small><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(NAMES[store]+' near '+state.postal)}" target="_blank" rel="noopener">Find locations</a> · <a href="${retailerUrls[store]}" target="_blank" rel="noopener">Retailer site</a></div>`).join('')}</div><div class="row"><span class="fine">Store selection is saved on this device.</span><button id="continue">Continue to search</button></div>`;
  document.querySelectorAll('[data-store]').forEach((checkbox) => checkbox.onchange = () => {
    state.stores = STORES.filter((store) => select('#store-' + store).checked);
    save();
    checkbox.closest('.store').classList.toggle('selected', checkbox.checked);
  });
  select('#continue').onclick = () => {
    if (!state.stores.length) return toast('Select at least one store.');
    stage = 'work';
    render();
  };
}

function renderWork() {
  const currentList = list();
  select('#app').innerHTML = stepper() + `<div class="row"><div><span class="eyebrow">Your grocery workspace</span><h1>Make every basket count.</h1></div><div class="actions"><select id="mode" class="mode" aria-label="Price source"><option value="live" ${state.mode==='live'?'selected':''}>Live / manual prices</option><option value="demo" ${state.mode==='demo'?'selected':''}>Offline demo prices</option></select><button id="choose-stores" class="ghost">Stores (${state.stores.length})</button></div></div>${storageIssue?`<div class="notice">${escapeHtml(storageIssue)}</div>`:''}<div class="notice ${state.mode==='live'?'info':''}">${state.mode==='demo'?'<strong>DEMO MODE.</strong> All sample offers are invented for testing. They are not current store prices.':'<strong>Price source: épiceries.ca.</strong> Quebec price observations, not branch-specific flyers. Prices older than 7 days are excluded. Search terms are sent to this provider; lists and postal code stay on your device.'}${!navigator.onLine?' <strong>You are offline.</strong> Saved lists and saved offers remain available.':''}</div><nav class="tabs" aria-label="Workspace"><button class="tab ${tab==='search'?'active':''}" data-tab="search">Search one item</button><button class="tab ${tab==='lists'?'active':''}" data-tab="lists">My lists</button></nav><div class="workspace"><aside class="card sidebar"><div class="row"><h2>My lists</h2><span class="tiny">Saved here</span></div><select id="list-select" class="list-select" aria-label="Select grocery list">${state.lists.map((entry)=>`<option value="${escapeHtml(entry.id)}" ${entry.id===state.active?'selected':''}>${escapeHtml(entry.name)} (${entry.items.length})</option>`).join('')}</select><div class="actions"><button id="new-list" class="ghost">New list</button><button id="rename-list" class="link">Rename</button><button id="duplicate-list" class="link">Duplicate</button></div><div class="list-items">${currentList.items.length?currentList.items.map(itemHTML).join(''):'<p class="fine">Search for an item and add it, or enter an item with a manual price.</p>'}</div><button id="manual" class="ghost full top-gap">Add item / manual price</button><div class="settings"><div><label for="max-stores">Max. stores</label><select id="max-stores">${[1,2,3].map((count)=>`<option ${count===state.maxStores?'selected':''}>${count}</option>`).join('')}</select></div><div><label for="extra-stop">Cost per extra stop</label><input id="extra-stop" type="number" min="0" max="1000" step=".01" value="${state.extraStop/100}"></div></div><p class="tiny">Extra-stop cost is your estimate for fuel and time. No distance or route is inferred.</p><div class="tools actions"><button id="backup" class="link">Export backup</button><button id="restore" class="link">Import backup</button><button id="delete-list" class="link danger">Delete list</button><input id="backup-file" type="file" accept="application/json,.json" hidden></div></aside><section id="main-panel">${tab==='search'?searchHTML():listHTML()}</section></div>`;
  bindWork();
}

function itemHTML(item) {
  return `<div class="list-item"><div class="item-title"><input type="checkbox" aria-label="Include ${escapeHtml(item.name)}" data-enabled="${item.id}" ${item.enabled?'checked':''}><span>${escapeHtml(item.name)}</span><button class="ghost" data-remove="${item.id}" aria-label="Remove ${escapeHtml(item.name)}">×</button></div><div class="item-controls"><input type="number" step=".1" min=".1" max="10000" value="${item.quantity}" data-quantity="${item.id}" aria-label="Quantity for ${escapeHtml(item.name)}"><select data-unit="${item.id}" aria-label="Unit for ${escapeHtml(item.name)}">${['pack','L','ml','kg','g','each'].map((unit)=>`<option ${item.unit===unit?'selected':''}>${unit}</option>`).join('')}</select><select data-tax="${item.id}" aria-label="Tax category for ${escapeHtml(item.name)}">${taxOptions(item.tax)}</select></div><div class="row top-gap"><span class="tiny">${item.offers.length} price observations</span><button class="link" data-manual="${item.id}">Add price</button><button class="link" data-refresh="${item.id}">Refresh</button></div></div>`;
}

function taxOptions(selected = 'unknown') {
  return [['unknown','Review tax'],['zero','Basic grocery · 0%'],['standard','Standard taxable'],['federal','GST/HST only']].map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');
}

function searchHTML() {
  return `<div class="card"><h2>What are you looking for?</h2><form id="search-form" class="search-row"><input id="query" type="search" placeholder="Try organic milk, eggs, or paneer" value="${escapeHtml(lastQuery)}" minlength="2" maxlength="100" aria-label="Search grocery item" required><button ${busy?'disabled':''}>${busy?'Searching…':'Search'}</button></form><div class="actions top-gap">${['Organic milk','Eggs','Greek yogurt'].map((suggestion)=>`<button class="ghost" data-query="${suggestion}">${suggestion}</button>`).join('')}</div><p class="fine">Choose an exact product to compare matching packages. Common English grocery terms are translated for the Quebec feed; French terms also work.</p>${error?`<p class="error" role="alert">${escapeHtml(error)}</p>`:''}<div class="product-list">${results.map(resultHTML).join('')}</div>${!results.length&&!busy?`<div class="empty top-gap"><h3>${lastQuery?'No matching products yet':'Your next saving starts here'}</h3><p class="muted">${lastQuery?'Try a broader term or enter a price manually.':'Search an item, choose a product, and compare store prices.'}</p>${state.mode==='demo'?'<button id="demo-basket">Load sample weekly list</button>':''}</div>`:''}</div>${current?`<div class="card top-gap"><div class="row"><h2>${escapeHtml(current.name)}</h2><button id="add-current">Add to ${escapeHtml(list().name)}</button></div><div class="settings"><div><label for="quick-qty">Quantity</label><input id="quick-qty" type="number" step=".1" min=".1" max="10000" value="${current.quantity}"></div><div><label for="quick-unit">Unit</label><select id="quick-unit">${['pack','L','ml','kg','g','each'].map((unit)=>`<option ${current.unit===unit?'selected':''}>${unit}</option>`).join('')}</select></div><div class="span2"><label for="quick-tax">Tax classification (confirm for this product)</label><select id="quick-tax">${taxOptions(current.tax)}</select></div></div>${comparisonHTML([current],false)}</div>`:''}`;
}

// Only https links from source data are rendered, so a crafted http or
// javascript URL in feed output can never become a live link.
function safeURL(candidate) {
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function resultHTML(result) {
  const image = safeURL(result.image);
  return `<article class="product">${image?`<img src="${escapeHtml(image)}" alt="${escapeHtml(result.name)}" loading="lazy" referrerpolicy="no-referrer">`:''}<div class="product-copy"><strong>${escapeHtml(result.name)}</strong><p class="fine">${escapeHtml(result.brand)} · ${escapeHtml(result.size)}</p><span class="tiny">${result.source==='demo'?'Sample product · demo':'Source product · verify size, brand and organic status'}</span></div><button class="ghost" data-product="${escapeHtml(result.id)}" ${busy?'disabled':''}>Compare</button></article>`;
}

function listHTML() {
  return `<div class="row"><div><h2>${escapeHtml(list().name)}</h2><p class="fine">${list().items.filter((item)=>item.enabled).length} selected items · estimated taxes for ${PROVINCES[state.province]}</p></div><div class="actions"><button id="refresh-all" class="ghost" ${busy?'disabled':''}>${busy?'Refreshing…':'Refresh prices'}</button><button id="print" class="ghost">Print / PDF</button></div></div>${error?`<p class="error" role="alert">${escapeHtml(error)}</p>`:''}${comparisonHTML(list().items,true)}`;
}

function comparisonHTML(items, plan) {
  const selected = items.filter((item) => item.enabled);
  if (!selected.length) return `<div class="empty"><h3>Your list is ready to grow.</h3><p class="muted">Add products from search or enter your own store prices.</p><button id="go-search">Search items</button>${state.mode==='demo'?'<button id="demo-basket" class="ghost top-gap">Load sample weekly list</button>':''}</div>`;

  const rows = matrix(items, state.stores, state.province);
  const hasDemo = selected.some((item) => item.offers.some((offer) => offer.source === 'demo'));
  let html = `${hasDemo?'<div class="notice"><strong>Contains DEMO prices.</strong> Totals and savings are testing examples.</div>':''}${selected.some((item)=>item.tax==='unknown')?'<div class="notice">Review each item’s tax category to calculate checkout totals and a complete shopping plan.</div>':''}<div class="table-wrap"><table><thead><tr><th>Item / required quantity</th>${state.stores.map((store)=>`<th>${NAMES[store]}</th>`).join('')}</tr></thead><tbody>${rows.map((row)=>{const pricedCells=Object.values(row.cells).filter((cell)=>cell?.total!==null&&cell?.total!==undefined);const lowest=pricedCells.length?Math.min(...pricedCells.map((cell)=>cell.total)):null;return `<tr><td><strong>${escapeHtml(row.item.name)}</strong><p class="tiny">${row.item.quantity} ${row.item.unit}<br>${row.item.tax==='zero'?'Basic grocery · zero-rated':row.item.tax==='unknown'?'Tax needs review':'Taxable · estimate'}</p></td>${state.stores.map((store)=>{const cell=row.cells[store];if(!cell)return '<td><span class="muted">—</span><p class="tiny">No usable price</p></td>';const offer=cell.offer,packSize=size(offer.size),unitPrice=packSize?money(Math.round(offer.cents/packSize.value*(packSize.unit==='each'?1:1000)))+'/'+(packSize.unit==='g'?'kg':packSize.unit==='ml'?'L':'each'):null;return `<td><span class="cell-price">${cell.total===null?money(cell.subtotal)+' + tax?':money(cell.total)}</span>${offer.sale?'<span class="badge sale">SALE</span>':''}${cell.total!==null&&cell.total===lowest?'<span class="badge lowest">LOWEST</span>':''}${offer.source==='demo'?'<span class="badge demo">DEMO</span>':''}<div class="tiny">${cell.packs} × ${escapeHtml(offer.size||'package')}<br>Pack: ${money(offer.cents)}${unitPrice?'<br>'+unitPrice:''}<br>Tax: ${cell.tax===null?'review':money(cell.tax)}${cell.deposit?'<br>Deposit: '+money(cell.deposit):''}<br>${offer.source==='manual'?'Manual observation':offer.source==='demo'?'Sample only':'épiceries.ca'}${offer.observed?'<br>'+escapeHtml(new Date(offer.observed).toLocaleDateString('en-CA')):''}</div>${safeURL(offer.link)?`<a class="tiny" href="${escapeHtml(safeURL(offer.link))}" target="_blank" rel="noopener">Check source</a>`:''}</td>`;}).join('')}</tr>`;}).join('')}<tr><th>Estimated checkout</th>${state.stores.map((store)=>{const cells=rows.map((row)=>row.cells[store]);const complete=cells.every((cell)=>cell&&cell.total!==null);return `<td><strong>${complete?money(cells.reduce((sum,cell)=>sum+cell.total,0)):'Incomplete'}</strong><p class="tiny">${cells.filter((cell)=>cell&&cell.total!==null).length}/${rows.length} items priced</p></td>`;}).join('')}</tr></tbody></table></div><p class="fine">Row prices cover whole packs needed for your quantity, including estimated tax and entered deposits. Unpriced, stale, future, expired, or incompatible sizes show “—”. SALE is the source label; LOWEST compares available checkout prices.</p>`;

  if (!plan) return html;
  const result = optimize(rows, state.stores, state.maxStores, state.extraStop);
  if (!result.best) return html + `<div class="empty"><h3>A complete plan needs more prices.</h3><p class="muted">Confirm tax categories, add missing prices, or allow more stores. Partial baskets are not ranked as complete baskets.</p></div>`;

  const best = result.best;
  return html + `<div class="plan"><div class="row"><div><span class="eyebrow" style="color:#b8dfce">${hasDemo?'Sample':'Lowest-cost available'} shopping plan</span><h2 class="top-gap">${best.stores.map((store)=>NAMES[store]).join(' + ')}</h2></div><div><span class="price">${money(best.total)}</span><div class="muted">including your extra-stop estimate</div></div></div><div class="row"><p class="muted">Products ${money(best.subtotal)} · Tax ${money(best.taxes)} · Deposits ${money(best.deposit)} · Extra stops ${money(best.travel)}</p></div>${result.single?`<p>${best.total<result.single.total?'Save '+money(result.single.total-best.total)+' vs the lowest complete single-store basket.':'A single store is the best plan with your current preferences.'} Single-store total: ${money(result.single.total)} (${result.single.stores.map((store)=>NAMES[store]).join(', ')}).</p>`:'<p>No complete single-store basket is available. Savings cannot be calculated.</p>'}<div class="plan-grid">${best.stores.map((store)=>`<div class="plan-store"><h3>${NAMES[store]}</h3>${best.lines.filter((line)=>line.store===store).map((line)=>`<p>${escapeHtml(line.item.name)}<br><span class="muted">${line.quote.packs} × ${escapeHtml(line.quote.offer.size)} · ${money(line.quote.total)}</span></p>`).join('')}<strong>${money(best.lines.filter((line)=>line.store===store).reduce((sum,line)=>sum+line.quote.total,0))}</strong></div>`).join('')}</div></div><p class="fine">Best among your selected retailers and available matched products. Availability, membership fees, coupons, loyalty conditions and unentered deposits are not included. Confirm final prices in store.</p>`;
}

function bindWork() {
  select('#choose-stores').onclick = () => { stage = 'stores'; render(); };
  select('#mode').onchange = (event) => { state.mode = event.target.value; results = []; current = null; lastQuery = ''; error = ''; save(); render(); };
  document.querySelectorAll('[data-tab]').forEach((button) => button.onclick = () => { tab = button.dataset.tab; render(); });
  select('#list-select').onchange = (event) => { state.active = event.target.value; save(); render(); };
  select('#new-list').onclick = () => nameList();
  select('#rename-list').onclick = () => nameList(true);
  select('#duplicate-list').onclick = () => {
    if (state.lists.length >= 50) return toast('Maximum 50 lists.');
    const copy = JSON.parse(JSON.stringify(list()));
    copy.id = newId();
    copy.name = (copy.name + ' copy').slice(0, 80);
    copy.items.forEach((item) => item.id = newId());
    state.lists.push(copy);
    state.active = copy.id;
    save();
    tab = 'lists';
    render();
  };
  select('#delete-list').onclick = () => {
    modal(`<h2>Delete ${escapeHtml(list().name)}?</h2><p>This removes this list from this device.</p><button id="confirm-delete">Delete list</button>`);
    select('#confirm-delete').onclick = () => {
      state.lists = state.lists.filter((entry) => entry.id !== state.active);
      if (!state.lists.length) state.lists.push({id:newId(), name:'Weekly groceries', items:[]});
      state.active = state.lists[0].id;
      save();
      select('#modal').close();
      render();
    };
  };
  select('#manual').onclick = () => manual();
  select('#max-stores').onchange = (event) => { state.maxStores = +event.target.value; save(); render(); };
  select('#extra-stop').onchange = (event) => {
    const dollars = +event.target.value;
    if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1000) return toast('Enter an extra-stop cost from $0 to $1,000.');
    state.extraStop = Math.round(dollars * 100);
    save();
    render();
  };
  for (const field of ['enabled','quantity','unit','tax']) {
    document.querySelectorAll(`[data-${field}]`).forEach((control) => control.onchange = () => {
      const item = list().items.find((entry) => entry.id === control.dataset[field]);
      if (field === 'quantity') {
        const value = +control.value;
        if (!Number.isFinite(value) || value <= 0 || value > 10000) { toast('Enter a positive quantity up to 10,000.'); render(); return; }
        item.quantity = value;
      } else if (field === 'enabled') {
        item.enabled = control.checked;
      } else {
        item[field] = control.value;
      }
      save();
      render();
    });
  }
  document.querySelectorAll('[data-remove]').forEach((button) => button.onclick = () => {
    list().items = list().items.filter((entry) => entry.id !== button.dataset.remove);
    save();
    render();
  });
  document.querySelectorAll('[data-manual]').forEach((button) => button.onclick = () => manual(button.dataset.manual));
  document.querySelectorAll('[data-refresh]').forEach((button) => button.onclick = () => refresh([list().items.find((entry) => entry.id === button.dataset.refresh)]));
  select('#backup').onclick = exportBackup;
  select('#restore').onclick = () => select('#backup-file').click();
  select('#backup-file').onchange = importBackup;
  if (select('#search-form')) select('#search-form').onsubmit = (event) => { event.preventDefault(); runSearch(select('#query').value); };
  document.querySelectorAll('[data-query]').forEach((button) => button.onclick = () => runSearch(button.dataset.query));
  document.querySelectorAll('[data-product]').forEach((button) => button.onclick = () => chooseProduct(button.dataset.product));
  if (select('#demo-basket')) select('#demo-basket').onclick = loadDemo;
  if (select('#go-search')) select('#go-search').onclick = () => { tab = 'search'; render(); };
  if (select('#add-current')) select('#add-current').onclick = () => {
    if (list().items.length >= 100) return toast('Maximum 100 items per list.');
    const item = JSON.parse(JSON.stringify(current));
    item.id = newId();
    list().items.push(item);
    save();
    toast('Added to ' + list().name);
    tab = 'lists';
    render();
  };
  for (const field of ['qty','unit','tax']) {
    if (select('#quick-' + field)) select('#quick-' + field).onchange = (event) => {
      if (field === 'qty') {
        if (!Number.isFinite(+event.target.value) || +event.target.value <= 0 || +event.target.value > 10000) { toast('Enter a positive quantity up to 10,000.'); render(); return; }
        current.quantity = +event.target.value;
      } else {
        current[field] = event.target.value;
      }
      render();
    };
  }
  if (select('#refresh-all')) select('#refresh-all').onclick = () => refresh(list().items);
  if (select('#print')) select('#print').onclick = () => window.print();
  document.querySelectorAll('img').forEach((image) => image.onerror = () => image.remove());
}

async function runSearch(queryText) {
  if (busy) return;
  if (queryText.trim().length < 2) return toast('Enter at least two characters.');
  lastQuery = queryText.trim();
  current = null;
  results = [];
  error = '';
  busy = true;
  render();
  try {
    if (state.mode === 'demo') {
      results = demo()
        .filter((sample) => (sample.name + ' ' + sample.brand).toLowerCase().includes(queryText.toLowerCase()))
        .map((sample, index) => ({...sample, id: 'demo-' + index, source: 'demo', size: sample.offers[0].size}));
    } else {
      if (state.province !== 'QC') throw Error('The live feed currently covers Quebec. Switch to demo or enter local prices manually.');
      if (!navigator.onLine) throw Error('You are offline. Saved offers remain in your lists.');
      results = await search(queryText);
      if (!results.length) error = 'No products found. Try French terms, a broader search, or manual entry.';
    }
  } catch (searchError) {
    error = searchError.message || 'Live lookup failed. You can still use manual prices or demo mode.';
  } finally {
    busy = false;
    render();
  }
}

async function chooseProduct(id) {
  if (busy) return;
  busy = true;
  error = '';
  render();
  try {
    const picked = results.find((entry) => entry.id === id);
    if (!picked) throw Error('Select a product again.');
    if (state.mode === 'demo') {
      current = {...picked, id: newId()};
    } else {
      const detail = await product(id);
      current = {
        id: newId(),
        providerId: id,
        name: [detail.brand, detail.name].filter(Boolean).join(' ').slice(0, 200),
        quantity: 1,
        unit: 'pack',
        tax: 'unknown',
        enabled: true,
        offers: detail.offers,
      };
    }
  } catch (productError) {
    error = productError.message;
  } finally {
    busy = false;
    render();
  }
}

function nameList(rename = false) {
  modal(`<h2>${rename?'Rename list':'Create a list'}</h2><form id="name-form"><label for="list-name">List name</label><input id="list-name" maxlength="80" required value="${rename?escapeHtml(list().name):''}" placeholder="Weekly groceries"><button class="top-gap">Save list</button></form>`);
  select('#name-form').onsubmit = (event) => {
    event.preventDefault();
    const name = select('#list-name').value.trim();
    if (!name) return;
    if (rename) {
      list().name = name;
    } else {
      if (state.lists.length >= 50) return toast('Maximum 50 lists.');
      const created = {id:newId(), name, items:[]};
      state.lists.push(created);
      state.active = created.id;
    }
    save();
    select('#modal').close();
    tab = 'lists';
    render();
  };
}

function loadDemo() {
  if (state.lists.length >= 50) return toast('Maximum 50 lists.');
  const created = {id:newId(), name:'Sample weekly groceries', items:demo()};
  state.lists.push(created);
  state.active = created.id;
  state.mode = 'demo';
  save();
  tab = 'lists';
  render();
}

function manual(id) {
  const existing = id ? list().items.find((entry) => entry.id === id) : null;
  modal(`<h2>${existing?'Add a store price':'Add item & price'}</h2><p class="fine">Enter a price you have checked. This is saved as a manual observation, separately from source prices.</p><form id="manual-form" class="form-grid"><div class="span2"><label for="manual-name">Item name</label><input id="manual-name" maxlength="200" required value="${escapeHtml(existing?.name||'')}" ${existing?'readonly':''}></div><div><label for="manual-store">Store</label><select id="manual-store">${STORES.map((store)=>`<option value="${store}">${NAMES[store]}</option>`).join('')}</select></div><div><label for="manual-price">Price per package (CAD)</label><input id="manual-price" type="number" min="0" max="1000000" step=".01" required></div><div><label for="manual-size">Package size</label><input id="manual-size" placeholder="2 L, 750 g, 12 each" maxlength="80" required></div><div><label for="manual-tax">Tax category</label><select id="manual-tax">${taxOptions(existing?.tax||'unknown')}</select></div><div><label for="manual-date">Observed date</label><input id="manual-date" type="date" value="${new Date().toLocaleDateString('en-CA')}" required></div><div><label for="manual-expiry">Valid through (optional)</label><input id="manual-expiry" type="date"></div><div><label for="manual-deposit">Deposit per pack (CAD)</label><input id="manual-deposit" type="number" min="0" max="1000" step=".01" value="0"></div><div class="check-row"><input id="manual-sale" type="checkbox"><label for="manual-sale">Advertised sale</label></div><p class="error span2" id="manual-error" role="alert"></p><button class="span2">Save price</button></form>`);
  select('#manual-form').onsubmit = (event) => {
    event.preventDefault();
    const name = select('#manual-name').value.trim();
    const packSize = select('#manual-size').value.trim();
    const observed = select('#manual-date').value;
    const expires = select('#manual-expiry').value;
    if (!name || !packSize) return;
    if (Date.parse(observed) > Date.now() + 86400000 || (expires && Date.parse(expires + 'T23:59:59') < Date.parse(observed))) {
      return select('#manual-error').textContent = 'Check the observation and expiry dates.';
    }
    if (!existing && list().items.length >= 100) return toast('Maximum 100 items per list.');
    const item = existing || {id:newId(), name, quantity:1, unit:'pack', enabled:true, offers:[]};
    item.tax = select('#manual-tax').value;
    const store = select('#manual-store').value;
    // Replace any prior manual price for this store; source observations are kept.
    item.offers = item.offers.filter((offer) => offer.store !== store || offer.source !== 'manual');
    item.offers.push({
      store,
      cents: Math.round(+select('#manual-price').value * 100),
      size: packSize,
      sale: select('#manual-sale').checked,
      source: 'manual',
      observed: observed + 'T12:00:00',
      expires: expires ? expires + 'T23:59:59' : undefined,
      deposit: Math.round(+select('#manual-deposit').value * 100),
    });
    if (!existing) list().items.push(item);
    save();
    select('#modal').close();
    tab = 'lists';
    render();
  };
}

async function refresh(items) {
  if (busy) return;
  const refreshable = items.filter((item) => item.providerId);
  if (!refreshable.length) return toast('Manual prices need a new observation; demo prices are fixed samples.');
  busy = true;
  error = '';
  render();
  let failed = 0;
  for (const item of refreshable) {
    try {
      const detail = await product(item.providerId);
      // Keep manual observations; replace the source-fed offers with fresh ones.
      item.offers = [...item.offers.filter((offer) => offer.source === 'manual'), ...detail.offers];
    } catch {
      failed++;
    }
  }
  save();
  busy = false;
  error = failed ? `${failed} item(s) could not refresh. Previous observations were retained; stale prices are still excluded.` : '';
  toast(failed ? 'Refresh finished with missing updates.' : 'Prices refreshed.');
  render();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'basketcompass-backup-' + new Date().toLocaleDateString('en-CA') + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Backup downloaded. Keep it to restore on another device.');
}

async function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2000000) return toast('Backup is too large (maximum 2 MB).');
  try {
    const backup = validateBackup(JSON.parse(await file.text()));
    modal(`<h2>Import ${backup.lists.length} lists?</h2><p>Your existing lists will be kept. Imported lists will be added as new copies.</p><button id="confirm-import">Import lists</button>`);
    select('#confirm-import').onclick = () => {
      if (backup.lists.length + state.lists.length > 50) return toast('Import would exceed 50 lists.');
      // Imported lists and items get fresh ids so they never collide with existing ones.
      const incoming = backup.lists.map((entry) => ({...entry, id: newId(), items: entry.items.map((item) => ({...item, id: newId()}))}));
      state.lists.push(...incoming);
      if (incoming.length) state.active = incoming[0].id;
      save();
      select('#modal').close();
      tab = 'lists';
      render();
      toast('Lists imported.');
    };
  } catch (importError) {
    toast(importError.message || 'Could not read this backup.');
  }
}

select('#help').onclick = () => modal(`<h2>About BasketCompass</h2><p>1. Enter your postal code.<br>2. Choose stores.<br>3. Search an exact product or enter a manual price.<br>4. Save it to a list, set quantities and confirm tax.<br>5. Compare and use the shopping plan.</p><h3>Coverage</h3><p class="fine">Live adapter: <a href="https://epiceries.ca/developers" target="_blank" rel="noopener">épiceries.ca</a>, a documented public Quebec price API. This release does not aggregate every store’s flyers, locate nearby branches automatically, or provide live Costco prices. Retailer site links and maps help you check local availability. Source requests can fail; manual entry and demo remain available.</p><h3>Tax & pricing</h3><p class="fine">Basic groceries may be zero-rated. Classification depends on the actual product; confirm the dropdown. Rates were checked against <a href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html" target="_blank" rel="noopener">CRA</a> and <a href="https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/basic-rules-for-applying-the-gsthst-and-qst/tables-of-gst-and-qst-rates/" target="_blank" rel="noopener">Revenu Québec</a> on 2026-10-03. Standard GST/HST and provincial rates are calculated separately; province-specific exemptions, coupon rules, cash rounding and special levies need confirmation. Deposits are included only if entered. Whole-pack rounding can produce surplus.</p><h3>Your data</h3><p class="fine">Lists, postal code, selected offers and preferences are stored in this browser’s local storage. They are not encrypted. Clearing browser data or device storage eviction can remove them. Export a backup regularly; import on another device to move your lists. Live search sends the search term and product ID to the price provider. Product images load from source websites. No analytics are added.</p><h3>Offline & installation</h3><p class="fine">Open the app online once before using it offline. Saved lists and eligible saved prices work offline; new live searches do not. Installation varies by browser; iPhone uses Safari’s Share menu. Private hosting may require ChatGPT sign-in when online. Retailer names and product images belong to their respective owners. No retailer affiliation is implied.</p>`);

// Capture the browser's install prompt so the Install button can trigger it later.
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstall = event; });
select('#install').onclick = async () => {
  if (deferredInstall) { await deferredInstall.prompt(); deferredInstall = null; return; }
  modal(`<h2>Install BasketCompass</h2><p><strong>iPhone / iPad:</strong> Open this site in Safari. Tap Share, then Add to Home Screen, and turn on Open as Web App if shown.</p><p><strong>Android:</strong> Open in Chrome, then choose Install app or Add to Home screen from the menu.</p><p><strong>Desktop:</strong> In Chrome or Edge, use the install icon in the address bar or the browser menu.</p><p class="fine">No App Store is needed. If your browser offers a shortcut instead of installation, you can still use the site and save lists locally.</p>`);
};

window.addEventListener('online', () => { toast('You are online.'); render(); });
window.addEventListener('offline', () => { toast('Offline: your saved lists are available.'); render(); });
// A second tab may edit the same lists; warn rather than overwrite silently.
window.addEventListener('storage', (event) => { if (event.key === STORAGE_KEY) toast('Lists changed in another tab. Reload to see the latest version before editing.'); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./ServiceWorker.js').catch(() => toast('Offline installation is unavailable in this browser. Saved lists still work.'));
}

// Optional read-only integration: if the host exposes a model-context tool API,
// expose the lists for reading without ever mutating them.
if (document.modelContext?.registerTool) {
  try {
    const registration = document.modelContext.registerTool({
      name: 'read_grocery_lists',
      description: 'Read the lists stored on this device without changing them.',
      inputSchema: {type: 'object', properties: {}, additionalProperties: false},
      annotations: {readOnlyHint: true},
      execute: () => ({lists: state.lists.map((entry) => ({name: entry.name, items: entry.items.map((item) => ({name: item.name, quantity: item.quantity, unit: item.unit}))}))}),
    });
    Promise.resolve(registration).catch(() => {});
  } catch {}
}

render();
