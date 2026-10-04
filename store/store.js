const $ = s => document.querySelector(s);
const money = n => 'KSh ' + Math.round(n).toLocaleString('en-KE');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
let storeId = params.get('store') || window.SHOPKEEP_DEFAULT_STORE_ID || 'EFts4lAKg1dZasKupR1uQL9TJV73', products = [], basket = new Map(), category = 'All', searchText = '', customerProfile = null;
let isLoading = true;

if (storeId) $('#store-home').href = `./?store=${encodeURIComponent(storeId)}`;
const collection = name => window.shopkeepDb.collection('shops').doc(storeId).collection(name);

function updateCustomerLinks(user) {
  const account = $('#customer-account'), query = storeId ? `?store=${encodeURIComponent(storeId)}` : '';
  if (!user) { customerProfile = null; account.innerHTML = `<a href="../login.html${query}">Log in</a><a href="signup.html${query}">Sign up</a>`; return }
  window.shopkeepDb.collection('customers').doc(user.uid).get().then(profile => {
    if (!profile.exists) { customerProfile = null; account.innerHTML = `<a href="../login.html${query}">Log in</a><a href="signup.html${query}">Sign up</a>`; return }
    customerProfile = { ...profile.data(), uid: user.uid };
    account.innerHTML = `<span class="customer-name">Hi, ${esc(customerProfile.displayName || user.email)}</span><button id="customer-signout" type="button">Sign out</button>`;
  }).catch(() => { customerProfile = null; account.innerHTML = `<a href="../login.html${query}">Log in</a><a href="signup.html${query}">Sign up</a>` });
}

function promptForStore(message = 'Open the Shopkeep link shared by your local shop.') {
  $('#app').innerHTML = `<section class="store-select"><span class="eyebrow" style="color:var(--green)">Shopkeep Market</span><h1>Find your local shop</h1><p>${esc(message)}</p><form id="store-form"><input id="store-id" required aria-label="Shop code" placeholder="Enter shop code"><button>Open shop</button></form></section>`;
  $('#store-form').addEventListener('submit', event => { event.preventDefault(); const id = $('#store-id').value.trim(); if (id) location.href = `?store=${encodeURIComponent(id)}` });
}

function chooseStore(stores) {
  $('#app').innerHTML = `<section class="store-select"><span class="eyebrow" style="color:var(--green)">Shopkeep Market</span><h1>Choose your shop</h1><p>Select a local shop to see its products.</p><div class="store-list">${stores.map(shop => `<button class="store-option" data-store-id="${esc(shop.storeId || shop.id)}">${esc(shop.name || 'Shopkeep Market')}</button>`).join('')}</div><p>Have a shop link? <a href="#store-form" id="enter-shop-code">Enter its shop code</a></p></section>`;
  $('#enter-shop-code').addEventListener('click', event => { event.preventDefault(); promptForStore() });
}

function renderLoading() {
  $('#catalog-title').textContent = 'Loading products...';
  $('#catalog-subtitle').textContent = '';
  $('#products').innerHTML = '<div class="empty">Loading...</div>';
}

function openStore(id) {
  storeId = id; history.replaceState(null, '', `${location.pathname}?store=${encodeURIComponent(id)}`); $('#store-home').href = `./?store=${encodeURIComponent(id)}`;
  updateCustomerLinks(window.shopkeepAuth?.currentUser || null);
  renderLoading();
  collection('public_products').onSnapshot(snapshot => {
    isLoading = false;
    products = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    if (category !== 'All' && !products.some(product => product.cat === category)) category = 'All';
    for (const [productId, line] of basket) {
      const current = products.find(product => product.id === productId);
      if (!current || current.stock <= 0) basket.delete(productId);
      else { line.product = current; if (line.qty > current.stock) line.qty = current.stock }
    }
    categoryList(); renderProducts(); renderBasket();
  }, error => {
    isLoading = false;
    toast(`Catalog unavailable: ${error.message}`);
  });
}

async function discoverStore() {
  try {
    const snapshot = await window.shopkeepDb.collectionGroup('public_products').get();
    const storeIds = [...new Set(snapshot.docs.map(doc => doc.ref.parent.parent.id))];
    if (storeIds.length === 1) openStore(storeIds[0]);
    else if (storeIds.length > 1) chooseStore(storeIds.map(id => ({ id, storeId: id, name: `Shop ${id}` })));
    else promptForStore('No products have been published yet. Open the shop link shared by your store.');
  } catch (error) {
    const message = error.code === 'permission-denied'
      ? 'Firestore rules are blocking public product browsing. Deploy backend/firestore.rules to allow customers to view products.'
      : `Could not find a published shop (${error.code || 'connection error'}). Open the shop link or enter its code.`;
    promptForStore(message);
  }
}

function categoryList() {
  const names = ['All', ...new Set(products.map(p => p.cat).filter(Boolean))];
  $('#categories').innerHTML = names.map(name => `<button class="category ${category === name ? 'active' : ''}" data-category="${esc(name)}">${esc(name)}<span>${name === 'All' ? products.length : products.filter(p => p.cat === name).length}</span></button>`).join('');
}

function visibleProducts() {
  let result = products.filter(p => (category === 'All' || p.cat === category) && (!searchText || (p.name + ' ' + p.cat).toLowerCase().includes(searchText)));
  const sort = $('#sort').value; if (sort === 'price-up') result.sort((a, b) => a.price - b.price); if (sort === 'price-down') result.sort((a, b) => b.price - a.price); if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

function renderProducts() {
  if (isLoading) return renderLoading();
  const list = visibleProducts(); $('#catalog-title').textContent = category === 'All' ? 'All products' : category; $('#catalog-subtitle').textContent = `${list.length} ${list.length === 1 ? 'item' : 'items'} available`;
  $('#products').innerHTML = list.map(p => `<article class="product"><div class="product-art">${p.imageUrl ? `<img class="product-image" src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy">` : `<span class="product-emoji" aria-hidden="true">${esc(p.emoji || '🛍️')}</span>`}<span class="product-cat">${esc(p.cat || 'Shop')}</span></div><div class="product-body"><p class="product-name">${esc(p.name)}</p><div class="availability">${p.stock > 0 ? (p.stock <= 5 ? `Only ${p.stock} left today` : 'Available today') : 'Currently unavailable'}</div><div class="price-row"><span class="price">${money(p.price)}</span><button class="add" data-add="${esc(p.id)}" aria-label="Add ${esc(p.name)} to basket" ${p.stock <= 0 ? 'disabled' : ''}>+</button></div></div></article>`).join('') || '<div class="empty">No products found. Try another category or search.</div>';
}

function renderBasket() {
  const lines = [...basket.values()], count = lines.reduce((sum, line) => sum + line.qty, 0), total = lines.reduce((sum, line) => sum + line.qty * line.product.price, 0);
  $('#cart-count').textContent = count; $('#basket-label').textContent = `${count} ${count === 1 ? 'item' : 'items'}`; $('#basket-total').textContent = money(total); $('#checkout').disabled = !count;
  $('#mobile-cart').hidden = !count; $('#mobile-cart-count').textContent = `Basket · ${count} ${count === 1 ? 'item' : 'items'}`; $('#mobile-cart-total').textContent = money(total);
  $('#basket-items').innerHTML = lines.length ? lines.map(line => `<div class="basket-line"><span class="basket-emoji">${esc(line.product.emoji || '🛍️')}</span><span class="basket-name">${esc(line.product.name)}<small>${money(line.product.price)} each</small></span><span class="stepper"><button data-qty="-1" data-id="${esc(line.product.id)}" aria-label="Remove one">−</button>${line.qty}<button data-qty="1" data-id="${esc(line.product.id)}" aria-label="Add one">+</button></span></div>`).join('') : '<div class="basket-empty">Your basket is empty.<br><br>Browse the shelves to find something good.</div>';
}

function addProduct(id, delta = 1) {
  const product = products.find(p => p.id === id); if (!product) return;
  const line = basket.get(id), qty = (line?.qty || 0) + delta; if (qty > product.stock) return toast(`Only ${product.stock} available.`);
  if (qty <= 0) basket.delete(id); else basket.set(id, { product, qty }); renderBasket();
}

function toast(message) { $('#toast').textContent = message; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').textContent = '', 2800) }

function checkoutForm() {
  const total = [...basket.values()].reduce((sum, line) => sum + line.qty * line.product.price, 0);
  $('#modal').innerHTML = `<div class="modal" data-close="true"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><button class="dialog-close" data-dismiss aria-label="Close">×</button><h2 id="checkout-title">Send your order</h2><p>${[...basket.values()].reduce((sum, line) => sum + line.qty, 0)} items · estimated ${money(total)}. The shop will confirm the final details.</p><form class="form" id="order-form"><label>Your name<input name="name" value="${esc(customerProfile?.displayName || '')}" required minlength="2" maxlength="100" autocomplete="name"></label><label>Phone number<input name="phone" value="${esc(customerProfile?.phone || '')}" required minlength="7" maxlength="24" autocomplete="tel" placeholder="07xx xxx xxx"></label><label>Email (optional)<input name="email" type="email" value="${esc(customerProfile?.email || '')}" maxlength="254" autocomplete="email"></label><button type="submit">Send order request</button></form></section></div>`;
  $('#order-form').addEventListener('submit', submitOrder);
  setTimeout(() => $('#order-form input[name="name"]')?.focus(), 10);
}

async function submitOrder(event) {
  event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'); button.disabled = true; button.textContent = 'Sending…';
  const items = [...basket.values()].map(line => ({ productId: line.product.id, name: line.product.name, qty: line.qty, price: line.product.price }));
  const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  // Security note: While we calculate total here for display, real pricing MUST be calculated on backend!
  try {
    await collection('orders').add({ customerName: form.elements.name.value.trim(), phone: form.elements.phone.value.trim(), email: form.elements.email.value.trim(), items, total, status: 'new', createdAt: firebase.firestore.FieldValue.serverTimestamp(), ...(customerProfile ? { customerUid: customerProfile.uid } : {}) });
    basket.clear(); $('#modal').innerHTML = ''; renderBasket(); toast('Order sent. The shop will contact you to confirm.');
  } catch (error) { button.disabled = false; button.textContent = 'Send order request'; toast(error.message || 'Could not send your order.'); }
}

function toastMissingFirebase() { promptForStore('The shop catalogue could not connect. Check that Firebase is configured and try again.'); }

document.addEventListener('click', event => {
  const storeButton = event.target.closest('[data-store-id]'); if (storeButton) { openStore(storeButton.dataset.storeId); return }
  const categoryButton = event.target.closest('[data-category]'); if (categoryButton) { category = categoryButton.dataset.category; categoryList(); renderProducts(); return }
  const add = event.target.closest('[data-add]'); if (add) { addProduct(add.dataset.add); return }
  const qty = event.target.closest('[data-qty]'); if (qty) { addProduct(qty.dataset.id, +qty.dataset.qty); return }
  if (event.target.closest('#customer-signout')) { window.shopkeepAuth.signOut().then(() => updateCustomerLinks(null)); return }
  if (event.target.closest('#checkout')) {
    if (!customerProfile) {
      const query = storeId ? `?store=${encodeURIComponent(storeId)}&redirect=order` : '';
      location.href = `../login.html${query}`;
      return;
    }
    checkoutForm();
  }
  if (event.target.closest('#jump-cart') || event.target.closest('#mobile-cart-trigger')) {
    const basketPanel = $('#basket');
    if (basketPanel) basketPanel.scrollIntoView({ behavior: 'smooth', block: 'center' }); else toast('Open a shop link to see its basket.');
  }
  if (event.target.closest('[data-dismiss]') || event.target.matches('[data-close="true"]')) {
    $('#modal').innerHTML = '';
    $('#checkout')?.focus();
  }
  if (event.target.closest('#clear-search')) {
      const searchInput = $('#search');
      searchInput.value = '';
      searchText = '';
      $('#search-form').classList.remove('has-text');
      renderProducts();
      searchInput.focus();
  }
});

$('#search-form').addEventListener('submit', event => event.preventDefault());
$('#search').addEventListener('input', event => { 
    searchText = event.target.value.trim().toLowerCase(); 
    if(event.target.value) {
        $('#search-form').classList.add('has-text');
    } else {
        $('#search-form').classList.remove('has-text');
    }
    renderProducts(); 
});
$('#sort').addEventListener('change', renderProducts);

if (window.shopkeepAuth) window.shopkeepAuth.onAuthStateChanged(updateCustomerLinks); else updateCustomerLinks(null);
renderBasket();
if (!window.shopkeepFirebaseConfigured || !window.shopkeepDb) toastMissingFirebase();
else if (storeId) openStore(storeId);
else discoverStore();
