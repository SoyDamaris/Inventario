const state = {
  booting: true,
  user: null,
  settings: { businessName: 'Mi negocio', currency: 'COP', demo: false },
  products: [],
  employees: [],
  shifts: [],
  sales: [],
  payments: [],
  movements: [],
  view: 'inicio',
  filter: 'todos',
  category: 'todas',
  sort: 'categoria',
  query: '',
  month: todayISO().slice(0, 7),
  openEmployee: null,
  expandedId: null,
  modal: null,
  saleDraft: { sectionId: '', rim: '', itemId: '', extraPatches: '0', description: '', carModel: '', methods: [], amounts: { yape: '', efectivo: '', transferencia: '' }, employeeId: '' },
  catalogDraft: null,
  loginUser: '',
  loginError: '',
};

let draftImage = '';
let toastTimer = 0;

function todayISO() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function parseQty(value) {
  return Number(String(value ?? '').trim().replace(/\s/g, '').replace(',', '.'));
}

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function money(n) {
  const currency = state.settings.currency || 'COP';
  const value = Number(n) || 0;
  const whole = currency === 'COP' || currency === 'CLP';
  const hasCents = Math.abs(value - Math.round(value)) > 0.001;
  const digits = whole && !hasCents ? 0 : 2;
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `$ ${value.toFixed(digits)}`;
  }
}

function qty(n) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function hoursLabel(n) {
  return `${qty(n)} h`;
}

function percentLabel(n) {
  return `${qty(n)}%`;
}

function formatDate(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function monthName(value) {
  if (value === 'all') return 'Todo el historial';
  const [y, m] = String(value).split('-');
  const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthOptions() {
  const now = new Date();
  const options = [];
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    options.push({ value, label: monthName(value) });
  }
  options.push({ value: 'all', label: 'Todo el historial' });
  return options;
}

function initials(name) {
  const skip = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'con', 'para', 'por', 'un', 'una', 'kg', 'g', 'gr', 'ml', 'l', 'lt', 'und', 'oz', 'lb']);
  const parts = String(name || '?').trim().split(/\s+/).filter((part) => (
    /\p{L}/u.test(part[0] || '') && !skip.has(part.toLowerCase())
  ));
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}

function tint(name) {
  let hue = 0;
  for (const char of String(name || 'N')) hue = (hue * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hue} 32% 32%)`;
}

function safeImage(src) {
  if (typeof src !== 'string') return '';
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=\r\n]+$/i.test(src) ? src : '';
}

function statusOf(product) {
  if (Number(product.stock) <= 0) return { key: 'agotado', label: 'Agotado', rank: 0 };
  if (Number(product.stock) <= Number(product.minStock)) return { key: 'bajo', label: 'Queda poco', rank: 1 };
  return { key: 'ok', label: 'Disponible', rank: 2 };
}

function icon(name) {
  const paths = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10.5V20h11V10.5"/>',
    box: '<path d="M3 8l9-4 9 4-9 4-9-4Z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>',
    users: '<path d="M9 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 11.5a2.5 2.5 0 1 0-2-4"/><path d="M16.5 14.2A5 5 0 0 1 21 19"/>',
    card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9"/><path d="M9.5 9.5c.8-1 4.2-1.2 4.2.8s-4.4.9-4.4 2.6 3.8 1.5 4.6.8"/>',
    receipt: '<path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21Z"/><path d="M9 8h6M9 12h6"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`;
}

function photo(product, size) {
  const src = safeImage(product.image);
  const style = src ? '' : ` style="background:${tint(product.name)}"`;
  const inner = src ? `<img alt="${esc(product.name)}" src="${src}">` : `<span>${esc(initials(product.name))}</span>`;
  return `<div class="photo ${size || ''}"${style}>${inner}</div>`;
}

function sumEmployee(emp, month) {
  const inMonth = (date) => month === 'all' || String(date || '').startsWith(month);
  const shifts = state.shifts.filter((item) => item.employeeId === emp.id && inMonth(item.date));
  const allSales = state.sales.filter((item) => item.employeeId === emp.id && inMonth(item.date));
  const sales = allSales.filter((item) => !item.voided);
  const payments = state.payments.filter((item) => item.employeeId === emp.id && inMonth(item.date));
  const hours = shifts.reduce((total, item) => total + Number(item.hours), 0);
  const hourPay = roundMoney(hours * Number(emp.hourlyRate || 0));
  const salesTotal = roundMoney(sales.reduce((total, item) => total + Number(item.total), 0));
  const rate = Number(state.settings.commissionRate) || 30;
  const commission = roundMoney(salesTotal * rate / 100);
  const paid = roundMoney(payments.reduce((total, item) => total + Number(item.amount), 0));
  const earned = commission;
  return {
    hours, hourPay, salesTotal, commission, paid, earned,
    owed: roundMoney(earned - paid),
    shifts, sales, allSales, payments,
  };
}

function totalOwed() {
  return state.employees.reduce((total, emp) => total + Math.max(0, sumEmployee(emp, 'all').owed), 0);
}

function owedText(owed) {
  if (owed < -0.004) return `Pagado de más ${money(Math.abs(owed))}`;
  return `Por pagar ${money(Math.max(0, owed))}`;
}

function movementText(item) {
  const who = esc(item.userName || 'Alguien');
  const name = esc(item.productName || 'un producto');
  if (item.type === 'venta') return `${who} vendió ${qty(item.quantity)} de ${name}`;
  if (item.type === 'ajuste') {
    const note = item.note ? ` ${esc(item.note)}` : '';
    return `${who} ajustó ${name}: ${qty(item.previous)} → ${qty(item.next)}.${note}`;
  }
  if (item.type === 'alta') return `${who} agregó ${name}`;
  if (item.type === 'baja') return `${who} quitó ${name} del inventario`;
  if (item.type === 'anulacion') return `${who} anuló una venta de ${name}`;
  return `${who} actualizó ${name}`;
}

function fold(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function categoryName(product) {
  return String(product.category || '').trim() || 'Sin categoría';
}

function compareName(a, b) {
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}

function matchingProducts() {
  const q = fold(state.query.trim());
  return state.products.filter((product) => {
    if (state.filter !== 'todos' && statusOf(product).key !== state.filter) return false;
    if (state.category !== 'todas' && categoryName(product) !== state.category) return false;
    if (!q) return true;
    return fold(`${product.name} ${product.description} ${product.category} ${product.note}`).includes(q);
  });
}

function productGroups(products) {
  if (state.sort === 'nombre') {
    return [{ title: 'De la A a la Z', items: [...products].sort(compareName) }];
  }
  if (state.sort === 'estado') {
    return [
      ['agotado', 'Agotados'],
      ['bajo', 'Queda poco'],
      ['ok', 'Disponibles'],
    ].map(([key, title]) => ({
      title,
      items: products.filter((product) => statusOf(product).key === key).sort(compareName),
    })).filter((group) => group.items.length);
  }
  const titles = [...new Set(products.map(categoryName))].sort((a, b) => {
    if (a === 'Sin categoría') return 1;
    if (b === 'Sin categoría') return -1;
    return a.localeCompare(b, 'es', { sensitivity: 'base' });
  });
  return titles.map((title) => ({
    title,
    items: products.filter((product) => categoryName(product) === title).sort(compareName),
  }));
}

function allowedViews() {
  return state.user.role === 'gerente'
    ? [['inicio', 'Inicio', 'home'], ['inventario', 'Inventario', 'box'], ['ventas', 'Registro de ventas', 'receipt'], ['equipo', 'Equipo y pagos', 'users'], ['cuentas', 'Cuentas', 'card']]
    : [['inventario', 'Inventario', 'box'], ['ventas', 'Registro de ventas', 'receipt'], ['comisiones', 'Mis comisiones', 'coin']];
}

function currentView() {
  const views = allowedViews().map(([id]) => id);
  return views.includes(state.view) ? state.view : views[0];
}

function pageTitle() {
  const found = allowedViews().find(([id]) => id === currentView());
  return found ? found[1] : 'Inventario';
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    const error = new Error('No se pudo conectar. Abre el inventario con iniciar.bat y recarga la página.');
    error.status = 0;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo completar.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function apply(data) {
  state.user = data.user;
  state.settings = data.settings;
  state.products = data.products || [];
  state.employees = data.employees || [];
  state.shifts = data.shifts || [];
  state.sales = data.sales || [];
  state.payments = data.payments || [];
  state.movements = data.movements || [];
  state.catalogDraft = null;
}

function resetSession() {
  state.user = null;
  state.products = [];
  state.employees = [];
  state.shifts = [];
  state.sales = [];
  state.payments = [];
  state.movements = [];
  state.modal = null;
}

async function refresh() {
  apply(await api('/api/bootstrap'));
  state.modal = null;
  render();
}

function showToast(text, kind = 'ok') {
  state.toast = { text, kind };
  document.querySelector('.toast')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="toast ${kind === 'err' ? 'err' : ''}" role="status">${esc(text)}</div>`);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => document.querySelector('.toast')?.remove(), 3400);
}

function handleError(error) {
  if (error.status === 401 && state.user) {
    resetSession();
    render();
  }
  const formError = document.querySelector('[data-form-error]');
  if (formError && state.modal) {
    formError.hidden = false;
    formError.textContent = error.message;
  }
  showToast(error.message || 'Ocurrió un error', 'err');
}

function loginView() {
  return `<section class="login">
    <div class="login-hero">
      <div>
        <span class="logo-plate"><img class="logo logo-hero" src="logo.png" alt="GO Services"></span>
        <p class="kicker">GO Services</p>
        <h1>Inventario claro para la gerencia y el equipo.</h1>
        <p>Tú ves lo que hay, lo que se acabó y la comisión. Tus empleados actualizan las existencias desde su propia entrada.</p>
        <ul class="points">
          <li>Productos con foto, descripción y estado: disponible, queda poco o agotado.</li>
          <li>Una pantalla de gerencia y otra de empleados.</li>
          <li>Cada empleado se lleva el 30% de lo que vendió ese día.</li>
        </ul>
      </div>
    </div>
    <div class="login-panel">
      <form class="login-card" data-action="login">
        <p class="kicker">Entrada</p>
        <h2>Iniciar sesión</h2>
        <p class="muted">La cuenta decide si entras como gerencia o como empleado.</p>
        <label class="field"><span>Usuario</span><input id="username" name="username" autocomplete="username" value="${esc(state.loginUser)}" required></label>
        <label class="field"><span>Contraseña</span>
          <span class="secret"><input id="login-password" name="password" type="password" autocomplete="current-password" required><button class="btn ghost small" type="button" data-action="toggle-password">Ver</button></span>
        </label>
        ${state.loginError ? `<p class="form-error">${esc(state.loginError)}</p>` : ''}
        <button class="btn" type="submit">Entrar</button>
      </form>
    </div>
  </section>`;
}

function shell() {
  const nav = allowedViews().map(([id, label, glyph]) => (
    `<button type="button" class="${currentView() === id ? 'on' : ''}" data-action="go" data-view="${id}">${icon(glyph)}${label}</button>`
  )).join('');
  return `<div class="app">
    <aside class="sidebar">
      <div class="brand"><span class="logo-plate"><img class="logo" src="logo.png" alt="GO Services"></span><span><strong>${esc(state.settings.businessName)}</strong><small>${state.user.role === 'gerente' ? 'Gerencia' : 'Empleado'}</small></span></div>
      <nav class="nav">${nav}</nav>
      <div class="sidefoot">
        <div><strong>${esc(state.user.name)}</strong><small>@${esc(state.user.username)}</small></div>
        <button class="btn ghost small" type="button" data-action="my-account">Mi cuenta</button>
        <button class="btn ghost small" type="button" data-action="logout">Cerrar sesión</button>
      </div>
    </aside>
    <section class="main">
      <header class="topbar">
        <div>
          <p class="kicker">${state.user.role === 'gerente' ? 'Gerencia' : 'Empleado'}</p>
          <h1>${esc(pageTitle())}</h1>
        </div>
        ${currentView() === 'inventario' ? `<input id="search" class="search" placeholder="Buscar por nombre, categoría o nota" value="${esc(state.query)}">` : ''}
      </header>
      <div class="content">${content()}</div>
    </section>
    ${modalHtml()}
  </div>`;
}

function content() {
  const view = currentView();
  if (view === 'inicio') return homeManager();
  if (view === 'inventario') return inventory();
  if (view === 'ventas') return salesRegister();
  if (view === 'equipo') return team();
  if (view === 'cuentas') return accounts();
  return commissionsPage();
}

function demoBanner() {
  if (!state.settings.demo || state.user.role !== 'gerente') return '';
  return `<div class="banner">
    <p><strong>Datos de ejemplo.</strong> Recórrelos para ver cómo queda. Cuando quieras, bórralos y carga tu inventario.</p>
    <div>
      <button class="btn small" type="button" data-action="clear-demo">Borrar ejemplos</button>
      <button class="btn ghost small" type="button" data-action="dismiss-demo">Ocultar aviso</button>
    </div>
  </div>`;
}

function homeManager() {
  const counts = { agotado: 0, bajo: 0, ok: 0 };
  state.products.forEach((product) => { counts[statusOf(product).key] += 1; });
  const alerts = state.products
    .filter((product) => statusOf(product).key !== 'ok')
    .sort((a, b) => statusOf(a).rank - statusOf(b).rank || a.name.localeCompare(b.name, 'es'))
    .slice(0, 6);
  const date = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  const people = state.employees.length
    ? state.employees.map((emp) => {
      const month = sumEmployee(emp, state.month);
      const life = sumEmployee(emp, 'all');
      return `<button class="person" type="button" data-action="open-and-go" data-id="${esc(emp.id)}">
        <span class="avatar" style="background:${tint(emp.name)}">${esc(initials(emp.name))}</span>
        <span><strong>${esc(emp.name)}</strong><small>30% del día · ${money(month.commission)}</small></span>
        <em>${esc(owedText(life.owed))}</em>
      </button>`;
    }).join('')
    : `<div class="empty">Todavía no hay empleados. Crea sus cuentas para ver la comisión y lo que falta por pagar.</div>`;
  return `${demoBanner()}
    <p class="date">${esc(date)}</p>
    <div class="stats">
      <button class="stat accent" type="button" data-action="go" data-view="equipo"><span>Por pagar al equipo</span><strong>${money(totalOwed())}</strong></button>
      <button class="stat" type="button" data-action="go-filter" data-filter="agotado"><span>Agotados</span><strong>${counts.agotado}</strong></button>
      <button class="stat" type="button" data-action="go-filter" data-filter="bajo"><span>Queda poco</span><strong>${counts.bajo}</strong></button>
      <button class="stat" type="button" data-action="go-filter" data-filter="ok"><span>Disponibles</span><strong>${counts.ok}</strong></button>
    </div>
    <div class="section-head"><h2>Hay que reponer</h2><button class="btn ghost small" type="button" data-action="go" data-view="inventario">Ver inventario</button></div>
    ${alerts.length ? `<div class="alerts">${alerts.map(alertRow).join('')}</div>` : '<div class="empty">Nada agotado. El inventario está al día.</div>'}
    <div class="section-head"><h2>Equipo este mes</h2><button class="btn ghost small" type="button" data-action="go" data-view="equipo">Ver pagos</button></div>
    <div class="people">${people}</div>
    <div class="section-head"><h2>Últimos cambios</h2></div>
    ${movementList(state.movements)}`;
}

function alertRow(product) {
  const status = statusOf(product);
  return `<button class="alert" type="button" data-action="go-filter" data-filter="${status.key}">
    ${photo(product, 'sm')}
    <span><strong>${esc(product.name)}</strong><small>${esc(product.note || product.description || 'Sin nota')}</small></span>
    <em class="badge ${status.key}">${status.label} · ${qty(product.stock)}</em>
  </button>`;
}

function movementList(items) {
  if (!items.length) return '<div class="empty">Todavía no hay movimientos.</div>';
  return `<ul class="log">${items.slice(0, 8).map((item) => `<li><span>${movementText(item)}</span><time>${esc(formatWhen(item.createdAt))}</time></li>`).join('')}</ul>`;
}

function inventoryRows(products) {
  const list = [...products];
  if (state.sort === 'nombre') return list.sort(compareName);
  if (state.sort === 'estado') {
    const rank = { agotado: 0, bajo: 1, ok: 2 };
    return list.sort((a, b) => rank[statusOf(a).key] - rank[statusOf(b).key] || compareName(a, b));
  }
  return list.sort((a, b) => categoryName(a).localeCompare(categoryName(b), 'es', { sensitivity: 'base' }) || compareName(a, b));
}

function inventory() {
  const products = inventoryRows(matchingProducts());
  const counts = { todos: state.products.length, ok: 0, bajo: 0, agotado: 0 };
  state.products.forEach((product) => { counts[statusOf(product).key] += 1; });
  const chips = [['todos', 'Todos'], ['ok', 'Disponibles'], ['bajo', 'Queda poco'], ['agotado', 'Agotados']]
    .map(([key, label]) => `<button class="chip ${state.filter === key ? 'on' : ''}" type="button" data-action="filter" data-filter="${key}">${label} <span>${counts[key]}</span></button>`)
    .join('');
  const categories = ['todas', ...[...new Set(state.products.map(categoryName))].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))];
  const categoryChips = categories.map((name) => {
    const count = name === 'todas' ? state.products.length : state.products.filter((product) => categoryName(product) === name).length;
    return `<button class="chip ${state.category === name ? 'on' : ''}" type="button" data-action="category" data-category="${esc(name)}">${esc(name === 'todas' ? 'Todas las categorías' : name)} <span>${count}</span></button>`;
  }).join('');
  const sortOptions = [
    ['categoria', 'Por categoría'],
    ['nombre', 'De la A a la Z'],
    ['estado', 'Primero lo agotado'],
  ].map(([value, label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('');
  const query = state.query.trim();
  const summary = query
    ? `${products.length} resultado${products.length === 1 ? '' : 's'} para “${esc(query)}”.`
    : `${products.length} producto${products.length === 1 ? '' : 's'} en la tabla.`;
  const rows = products.map((product) => {
    const status = statusOf(product);
    return `<tr>
      <td><strong>${esc(product.name)}</strong></td>
      <td>${esc(categoryName(product))}</td>
      <td>${money(product.price)}</td>
      <td>
        <form data-action="save-stock" data-id="${esc(product.id)}">
          <div class="stock-cell">
            <input name="stock" inputmode="decimal" value="${esc(product.stock)}" aria-label="Existencia de ${esc(product.name)}">
            <button class="btn small" type="submit">Guardar</button>
          </div>
          <input type="hidden" name="note" value="${esc(product.note || '')}">
        </form>
      </td>
      <td><span class="badge ${status.key}">${status.label}</span></td>
      <td>${esc(product.note || product.description || '—')}</td>
      <td class="actions">
        <button class="btn ghost small" type="button" data-action="edit-product" data-id="${esc(product.id)}">Editar</button>
        <button class="btn danger small" type="button" data-action="delete-product" data-id="${esc(product.id)}">Quitar</button>
      </td>
    </tr>`;
  }).join('');
  const table = products.length ? `<div class="table-wrap"><table class="sheet">
    <thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Existencia</th><th>Estado</th><th>Nota</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>` : `<div class="empty">${state.products.length ? 'No hay productos con esa búsqueda o ese filtro.' : 'Todavía no hay productos. Agrega el primero.'}</div>`;
  return `${state.user.role === 'gerente' ? '' : employeeStrip()}
    <p class="lead">La tabla es la misma para el empleado y para el gerente: se agregan y se quitan filas desde aquí.</p>
    <div class="toolbar">
      <div class="chips">${chips}</div>
      <label class="sort">Orden<select id="sort" aria-label="Orden">${sortOptions}</select></label>
      <button class="btn" type="button" data-action="new-product">Nuevo producto</button>
      <button class="btn ghost" type="button" data-action="export-inventory">Exportar</button>
    </div>
    <div class="chips categories">${categoryChips}</div>
    <p class="result-count">${summary}</p>
    ${table}`;
}

function employeeStrip() {
  const month = sumEmployee(state.user, state.month);
  const life = sumEmployee(state.user, 'all');
  return `<section class="strip">
    <div><span>Pago de este mes · 30%</span><strong>${money(month.commission)}</strong></div>
    <div><span>Por pagarte</span><strong>${money(Math.max(0, life.owed))}</strong></div>
  </section>`;
}

function productCard(product) {
  const status = statusOf(product);
  const manager = state.user.role === 'gerente';
  const description = product.description || '';
  const long = description.length > 110;
  const open = state.expandedId === product.id;
  const shown = !description ? '' : (open || !long ? description : `${description.slice(0, 110)}…`);
  return `<article class="card ${status.key}">
    <div class="card-id">
      ${photo(product, 'thumb')}
      <div class="card-copy">
        <h3>${esc(product.name)}</h3>
        <p class="price">${money(product.price)} · ${qty(product.stock)} en existencia</p>
        <span class="badge ${status.key}">${status.label}</span>
      </div>
    </div>
    ${shown ? `<p class="desc">${esc(shown)}</p>` : ''}
    ${long ? `<button class="link" type="button" data-action="expand" data-id="${esc(product.id)}">${open ? 'Ver menos' : 'Ver más'}</button>` : ''}
    ${product.note ? `<p class="faltante">${esc(product.note)}</p>` : ''}
    <form data-action="save-stock" data-id="${esc(product.id)}">
      <div class="stockline">
        <button class="step" type="button" data-action="bump" data-id="${esc(product.id)}" data-delta="-1" aria-label="Quitar uno">−</button>
        <input class="stock-input" name="stock" inputmode="decimal" aria-label="Existencias" value="${esc(product.stock)}">
        <button class="step" type="button" data-action="bump" data-id="${esc(product.id)}" data-delta="1" aria-label="Sumar uno">+</button>
        <button class="btn small" type="submit">Guardar</button>
      </div>
      <input name="note" maxlength="200" placeholder="Qué falta o qué llegó" value="${esc(product.note || '')}">
    </form>
    <p class="meta">Aviso si queda en ${qty(product.minStock)} o menos.${product.updatedByName ? ` Actualizó ${esc(product.updatedByName)}.` : ''}</p>
    <div class="card-actions">
      <button class="btn ghost small" type="button" data-action="sale" data-id="${esc(product.id)}">Registrar venta</button>
      <button class="btn ghost small" type="button" data-action="agotado" data-id="${esc(product.id)}">Marcar agotado</button>
      ${manager ? `<button class="btn ghost small" type="button" data-action="edit-product" data-id="${esc(product.id)}">Editar</button><button class="btn danger small" type="button" data-action="delete-product" data-id="${esc(product.id)}">Eliminar</button>` : ''}
    </div>
  </article>`;
}

function monthSelect() {
  const options = monthOptions().map((option) => `<option value="${option.value}" ${option.value === state.month ? 'selected' : ''}>${esc(option.label)}</option>`).join('');
  return `<select id="month" class="month" aria-label="Periodo">${options}</select>`;
}

function team() {
  return `<p class="lead">Ventas y comisión del periodo. El saldo por pagar junta todo lo que falta, también de meses anteriores.</p>
    <div class="section-head"><h2>${esc(monthName(state.month))}</h2>${monthSelect()}</div>
    ${state.employees.length ? state.employees.map(employeeCard).join('') : '<div class="empty">Crea un empleado en Cuentas para llevar su comisión.</div>'}`;
}

function employeeCard(emp) {
  const month = sumEmployee(emp, state.month);
  const life = sumEmployee(emp, 'all');
  const open = state.openEmployee === emp.id;
  return `<article class="team-card">
    <div class="team-head">
      <div>
        <h3>${esc(emp.name)} ${emp.active ? '' : '<span class="badge off">Inactivo</span>'}</h3>
        <p>@${esc(emp.username)} · ${percentLabel(emp.commissionPercent)} de las ventas</p>
      </div>
      <div>
        <span class="muted">Saldo</span>
        <p class="owed">${esc(owedText(life.owed))}</p>
      </div>
    </div>
    <div class="figures">
      <div><span>Ventas</span><strong>${money(month.salesTotal)}</strong></div>
      <div><span>Comisión</span><strong>${money(month.commission)}</strong></div>
      <div><span>Pagado en el periodo</span><strong>${money(month.paid)}</strong></div>
    </div>
    <div class="inline-actions" style="margin-top:12px">
      <button class="btn small" type="button" data-action="pay" data-id="${esc(emp.id)}">Registrar pago</button>
      <button class="btn ghost small" type="button" data-action="toggle-employee" data-id="${esc(emp.id)}">${open ? 'Ocultar detalle' : 'Ver detalle'}</button>
      <button class="btn ghost small" type="button" data-action="edit-employee" data-id="${esc(emp.id)}">Editar porcentaje</button>
    </div>
    ${open ? employeeDetail(emp, month) : ''}
  </article>`;
}

function employeeDetail(emp, month) {
  const sales = [...month.allSales].sort(byDateDesc);
  const payments = [...month.payments].sort(byDateDesc);
  return `<div class="detail">
    <h3>Ventas y comisión</h3>
    ${sales.length ? `<ul class="lines">${sales.map((sale) => `<li class="${sale.voided ? 'void' : ''}"><span>${formatDate(sale.date)} · ${esc(sale.productName)} × ${qty(sale.quantity)} · ${percentLabel(sale.commissionPercent)}</span><span><strong>${money(sale.commissionAmount)}</strong> ${canVoid(sale) ? `<button class="btn ghost small" type="button" data-action="void-sale" data-id="${esc(sale.id)}">Anular</button>` : (sale.voided ? '<small>Anulada</small>' : '')}</span></li>`).join('')}</ul>` : '<p class="muted">Sin ventas en este periodo. Se registran en Registro de ventas.</p>'}
    <h3>Pagos</h3>
    ${payments.length ? `<ul class="lines">${payments.map((payment) => `<li><span>${formatDate(payment.date)} ${payment.notes ? `· ${esc(payment.notes)}` : ''}</span><span><strong>${money(payment.amount)}</strong> <button class="btn ghost small" type="button" data-action="delete-payment" data-id="${esc(payment.id)}">Quitar</button></span></li>`).join('')}</ul>` : '<p class="muted">Sin pagos en este periodo.</p>'}
  </div>`;
}

function byDateDesc(a, b) {
  return String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

function canVoid(sale) {
  if (sale.voided) return false;
  if (state.user.role === 'gerente') return true;
  return sale.employeeId === state.user.id && sale.date === todayISO();
}

function accounts() {
  const rows = state.employees.map((emp) => `<article class="account">
    <div><strong>${esc(emp.name)}</strong><p class="muted">@${esc(emp.username)} · ${percentLabel(emp.commissionPercent)} ${emp.active ? '' : '· inactiva'}</p></div>
    <button class="btn ghost small" type="button" data-action="edit-employee" data-id="${esc(emp.id)}">Editar</button>
  </article>`).join('');
  return `${demoBanner()}
    <form data-action="save-settings">
      <div class="section-head"><h2>Datos del negocio</h2></div>
      <div class="split">
        <label class="field"><span>Nombre</span><input name="businessName" maxlength="60" value="${esc(state.settings.businessName)}"></label>
        <label class="field"><span>Moneda</span><select name="currency">${['COP', 'MXN', 'USD', 'EUR', 'PEN', 'ARS', 'CLP'].map((code) => `<option ${code === state.settings.currency ? 'selected' : ''}>${code}</option>`).join('')}</select></label>
      </div>
      <div class="section-head"><h2>Precios del registro de ventas</h2></div>
      <p class="lead">Cada rim y cada llanta tienen su precio. En una reparación, cada parche extra suma ${money(catalog().patchExtra || 2)} al registrar, además del precio del rim.</p>
      ${catalogPriceEditor()}
      <button class="btn" type="submit">Guardar negocio</button>
    </form>
    <div class="section-head"><h2>Empleados</h2><button class="btn" type="button" data-action="new-employee">Nuevo empleado</button></div>
    ${rows || '<div class="empty">Todavía no hay empleados.</div>'}`;
}

function commissionsPage() {
  const month = sumEmployee(state.user, state.month);
  const life = sumEmployee(state.user, 'all');
  const sales = [...month.allSales].sort(byDateDesc);
  return `<p class="lead">Te corresponde el 30% de lo que registres cada día. El pago lo anota la gerencia.</p>
    <div class="stats">
      <div class="stat accent"><span>Por pagarte</span><strong>${money(Math.max(0, life.owed))}</strong></div>
      <div class="stat"><span>Comisión del periodo</span><strong>${money(month.commission)}</strong></div>
      <div class="stat"><span>Ventas del periodo</span><strong>${money(month.salesTotal)}</strong></div>
      <div class="stat"><span>Pagado en total</span><strong>${money(life.paid)}</strong></div>
    </div>
    <div class="section-head"><h2>Ventas</h2>${monthSelect()}</div>
    ${sales.length ? `<ul class="lines">${sales.map((sale) => `<li class="${sale.voided ? 'void' : ''}"><span>${formatDate(sale.date)} · ${esc(sale.productName)} × ${qty(sale.quantity)}</span><span><strong>${money(sale.commissionAmount)}</strong> ${canVoid(sale) ? `<button class="btn ghost small" type="button" data-action="void-sale" data-id="${esc(sale.id)}">Anular</button>` : (sale.voided ? '<small>Anulada</small>' : '')}</span></li>`).join('')}</ul>` : '<div class="empty">No hay ventas en este periodo. Regístralas desde Inventario.</div>'}`;
}

const METHOD_LABEL = { yape: 'Yape', efectivo: 'Efectivo', transferencia: 'Transferencia' };

function catalog() {
  return state.catalogDraft || state.settings.catalog || { patchExtra: 2, sections: [] };
}

function priceLabel(price) {
  return Number(price) > 0 ? money(price) : 'sin precio';
}

function patchCount(value) {
  const text = String(value ?? '').trim();
  if (text === '') return 0;
  if (!/^\d+$/.test(text)) return null;
  const count = Number(text);
  return count <= 30 ? count : null;
}

function savedCatalog() {
  return state.settings.catalog || { patchExtra: 2, sections: [] };
}

function quoteSelection(draft) {
  const source = savedCatalog();
  const patch = Number(source.patchExtra) || 2;
  if (draft.sectionId === 'otros') return { title: 'Otros', base: 0, extra: 0, total: 0, patches: 0, patch };
  const section = (source.sections || []).find((item) => item.id === draft.sectionId) || null;
  if (!section) return { title: 'Servicio', base: 0, extra: 0, total: 0, patches: 0, patch };
  if (section.kind === 'rims') {
    const extraOption = (section.extras || []).find((item) => item.id === draft.rim);
    if (extraOption) {
      const base = Number(extraOption.price) || 0;
      return { title: `${section.name} · ${extraOption.name}`, base, extra: 0, total: base, patches: 0, patch };
    }
    const base = Number(section.prices?.[draft.rim]) || 0;
    const title = `${section.name} · Rin ${draft.rim}`;
    if (section.id !== 'reparacion') return { title, base, extra: 0, total: base, patches: 0, patch };
    const patches = patchCount(draft.extraPatches);
    const extra = patches === null ? 0 : roundMoney(patches * patch);
    return { title, base, extra, total: patches === null ? base : roundMoney(base + extra), patches, patch };
  }
  if (section.kind === 'single') {
    const base = Number(section.price) || 0;
    return { title: section.name, base, extra: 0, total: base, patches: 0, patch };
  }
  const item = (section.items || []).find((entry) => entry.id === draft.itemId);
  const base = Number(item?.price) || 0;
  return { title: item ? `Venta de llanta · ${item.name}` : section.name, base, extra: 0, total: base, patches: 0, patch };
}

function catalogFromAccountsForm() {
  const form = document.querySelector('form[data-action="save-settings"]');
  if (!form) return catalog();
  const data = Object.fromEntries(new FormData(form));
  const sections = (catalog().sections || []).map((section) => {
    if (section.kind === 'rims') {
      const prices = {};
      (section.rims || []).forEach((rim) => { prices[rim] = data[`rim-${section.id}-${rim}`] || 0; });
      const extras = (section.extras || []).map((extra) => ({
        ...extra,
        price: data[`extra-${section.id}-${extra.id}`] ?? extra.price,
      }));
      return { ...section, prices, extras };
    }
    if (section.kind === 'single') return { ...section, price: data[`single-${section.id}`] || 0 };
    if (section.kind === 'list') {
      const count = Number(data.tireCount) || 0;
      const items = [];
      for (let index = 0; index < count; index += 1) {
        items.push({
          id: data[`tireId${index}`] || `llanta_${index + 1}`,
          name: data[`tireName${index}`] || '',
          price: data[`tirePrice${index}`] || 0,
        });
      }
      return { ...section, items };
    }
    return section;
  });
  return { patchExtra: catalog().patchExtra || 2, sections };
}

function catalogPriceEditor() {
  return (catalog().sections || []).map((section) => {
    let fields = '';
    if (section.kind === 'rims') {
      const rims = (section.rims || []).map((rim) => `<label class="field"><span>Rin ${rim}</span><input name="rim-${section.id}-${rim}" inputmode="decimal" value="${section.prices?.[rim] ? esc(section.prices[rim]) : ''}" placeholder="0"></label>`).join('');
      const extras = (section.extras || []).map((extra) => `<label class="field"><span>${esc(extra.name)}</span><input name="extra-${section.id}-${extra.id}" inputmode="decimal" value="${extra.price ? esc(extra.price) : ''}" placeholder="0"></label>`).join('');
      fields = `<div class="price-grid">${rims}${extras}</div>`;
    } else if (section.kind === 'single') {
      fields = `<label class="field"><span>Precio</span><input name="single-${section.id}" inputmode="decimal" value="${section.price ? esc(section.price) : ''}" placeholder="0"></label>`;
    } else {
      const items = section.items || [];
      const rows = items.map((item, index) => `<div class="tire-row">
        <span>${index + 1}.</span>
        <input type="hidden" name="tireId${index}" value="${esc(item.id)}">
        <input name="tireName${index}" maxlength="80" value="${esc(item.name || '')}" placeholder="Nombre de la llanta">
        <input name="tirePrice${index}" inputmode="decimal" value="${item.price ? esc(item.price) : ''}" placeholder="Precio">
        <button class="btn ghost small" type="button" data-action="remove-tire" data-index="${index}">Quitar</button>
      </div>`).join('');
      fields = `${rows || '<p class="muted">Ninguna todavía. Agrega cada llanta con su precio.</p>'}
        <input type="hidden" name="tireCount" value="${items.length}">
        <button class="btn ghost small" type="button" data-action="add-tire">Agregar llanta</button>`;
    }
    const note = section.id === 'reparacion' ? '<p class="muted">El precio de cada rin es la reparación. La válvula va aparte y cada parche adicional se suma al registrar.</p>' : '';
    return `<div class="sale-section"><h3>${esc(section.name)}</h3>${note}${fields}</div>`;
  }).join('');
}

function optionalPrice(value, label) {
  if (String(value ?? '').trim() === '') return 0;
  return requireQty(value, label);
}

function excelCell(value, type) {
  const kind = type || (typeof value === 'number' ? 'Number' : 'String');
  const text = kind === 'Number' ? String(Number(value) || 0) : esc(value ?? '');
  return `<Cell><Data ss:Type="${kind}">${text}</Data></Cell>`;
}

function downloadExcel(filename, sheetName, headers, rows) {
  const head = `<Row>${headers.map((header) => excelCell(header, 'String')).join('')}</Row>`;
  const body = rows.map((row) => `<Row>${row.map((cell) => excelCell(cell.value, cell.type)).join('')}</Row>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${esc(sheetName)}"><Table>${head}${body}</Table></Worksheet>
</Workbook>`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportInventory() {
  const products = inventoryRows(state.products);
  downloadExcel(`Inventario ${todayISO()}.xls`, 'Inventario', [
    'Producto', 'Categoría', 'Descripción', 'Precio', 'Existencia', 'Mínimo', 'Estado', 'Nota',
  ], products.map((product) => [
    { value: product.name },
    { value: categoryName(product) },
    { value: product.description || '' },
    { value: Number(product.price) || 0, type: 'Number' },
    { value: Number(product.stock) || 0, type: 'Number' },
    { value: Number(product.minStock) || 0, type: 'Number' },
    { value: statusOf(product).label },
    { value: product.note || '' },
  ]));
  showToast('Excel del inventario descargado.');
}

function exportSales() {
  const rate = Number(state.settings.commissionRate) || 30;
  const sales = [...state.sales].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const amountOf = (sale, method) => {
    const payment = (sale.payments || []).find((item) => item.method === method);
    return payment ? Number(payment.amount) || 0 : 0;
  };
  downloadExcel(`Registro de ventas ${todayISO()}.xls`, 'Ventas', [
    'Fecha', 'Empleado', 'Servicio', 'Rin', 'Parches extra', 'Modelo', 'Descripción', 'Pago', 'Yape', 'Efectivo', 'Transferencia', 'Total', 'Pago del 30%', 'Estado',
  ], sales.map((sale) => [
    { value: formatDate(sale.date) },
    { value: sale.employeeName || '' },
    { value: sale.serviceName || sale.productName || '' },
    { value: /^\d+$/.test(String(sale.rim || '')) ? `Rin ${sale.rim}` : (sale.rim === 'valvula' ? 'Válvula' : '') },
    { value: Number(sale.extraPatches) || 0, type: 'Number' },
    { value: sale.carModel || '' },
    { value: sale.description || '' },
    { value: paymentText(sale) === '—' ? '' : paymentText(sale) },
    { value: amountOf(sale, 'yape'), type: 'Number' },
    { value: amountOf(sale, 'efectivo'), type: 'Number' },
    { value: amountOf(sale, 'transferencia'), type: 'Number' },
    { value: Number(sale.total) || 0, type: 'Number' },
    { value: sale.voided ? 0 : roundMoney((Number(sale.total) || 0) * rate / 100), type: 'Number' },
    { value: sale.voided ? 'Anulada' : 'Registrada' },
  ]));
  showToast('Excel del registro de ventas descargado.');
}

function paymentText(sale) {
  if (!Array.isArray(sale.payments) || !sale.payments.length) return '—';
  return sale.payments.map((item) => `${METHOD_LABEL[item.method] || item.method} ${money(item.amount)}`).join(' + ');
}

function salesRegister() {
  const manager = state.user.role === 'gerente';
  const mine = manager ? state.sales : state.sales.filter((sale) => sale.employeeId === state.user.id);
  const rows = [...mine].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const todaySales = mine.filter((sale) => !sale.voided && sale.date === todayISO());
  const byPerson = new Map();
  todaySales.forEach((sale) => {
    const key = sale.employeeId || sale.employeeName;
    const current = byPerson.get(key) || { name: sale.employeeName || 'Empleado', count: 0, total: 0 };
    current.count += 1;
    current.total += Number(sale.total) || 0;
    byPerson.set(key, current);
  });
  const rate = Number(state.settings.commissionRate) || 30;
  const summary = [...byPerson.values()].map((item) => `<div class="stat accent"><span>${esc(item.name)} · ${item.count} hoy</span><strong>${money(roundMoney(item.total * rate / 100))}</strong></div>`).join('');
  const sections = salesSections(manager);
  const table = rows.length ? `<div class="table-wrap"><table class="sheet">
      <thead><tr>
        <th>Fecha</th>${manager ? '<th>Empleado</th>' : ''}
        <th>Servicio</th><th>Modelo</th><th>Descripción</th><th>Pago</th><th>Total</th><th>30%</th><th></th>
      </tr></thead>
      <tbody>${rows.map((sale) => `<tr class="${sale.voided ? 'void' : ''}">
        <td>${esc(formatDate(sale.date))}</td>
        ${manager ? `<td>${esc(sale.employeeName || '')}</td>` : ''}
        <td>${esc(sale.serviceName || sale.productName || '—')}</td>
        <td>${esc(sale.carModel || '—')}</td>
        <td>${esc(sale.description || '—')}</td>
        <td>${paymentText(sale)}</td>
        <td>${money(sale.total)}</td>
        <td>${money(sale.voided ? 0 : roundMoney((Number(sale.total) || 0) * rate / 100))}</td>
        <td>${sale.voided ? '<small>Anulada</small>' : `<button class="btn ghost small" type="button" data-action="delete-sale" data-id="${esc(sale.id)}">Quitar</button>`}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty">Todavía no hay ventas en el registro.</div>';
  return `${manager ? demoBanner() : ''}
    <p class="lead">${manager ? 'Elige la sección y el rin. Lo registrado aparece abajo, con el 30% de ese día.' : 'Elige la sección y el rin. En una reparación, cada parche adicional suma ' + money(catalog().patchExtra || 2) + '.'}</p>
    <div class="toolbar">${manager ? '<button class="btn ghost" type="button" data-action="export-sales">Exportar</button>' : ''}</div>
    ${sections}
    <div class="stats">${summary || `<div class="stat accent"><span>Pago de hoy</span><strong>${money(0)}</strong></div>`}</div>
    ${table}`;
}

function salesSections(manager) {
  const saved = state.settings.catalog;
  const blocks = (saved?.sections || []).map((section) => {
    let body = '';
    if (section.kind === 'rims') {
      const rims = (section.rims || []).map((rim) => {
        const price = Number(section.prices?.[rim]) || 0;
        return `<button class="btn ghost" type="button" data-action="pick-option" data-section="${section.id}" data-rim="${rim}">Rin ${rim} · ${priceLabel(price)}</button>`;
      }).join('');
      const extras = (section.extras || []).map((extra) => {
        const price = Number(extra.price) || 0;
        return `<button class="btn ghost" type="button" data-action="pick-option" data-section="${section.id}" data-rim="${esc(extra.id)}">${esc(extra.name)} · ${priceLabel(price)}</button>`;
      }).join('');
      body = `<div class="rim-grid">${rims}${extras}</div>`;
    } else {
      const items = section.items || [];
      body = items.length
        ? `<div class="rim-grid">${items.map((item, index) => {
          const price = Number(item.price) || 0;
          return `<button class="btn ghost" type="button" data-action="pick-option" data-section="${section.id}" data-item="${esc(item.id)}">${index + 1}. ${esc(item.name)} · ${priceLabel(price)}</button>`;
        }).join('')}</div>`
        : `<p class="muted">${manager ? 'Agrega cada llanta en Cuentas, con su precio.' : 'La gerencia todavía no cargó las llantas.'}</p>`;
    }
    const note = section.id === 'reparacion'
      ? `<p class="muted">Elige el rin. La válvula se cobra aparte. Cada parche adicional suma ${money(saved.patchExtra || 2)}.</p>`
      : (section.id === 'lujo'
        ? '<p class="muted">Rin 14 y 15, y del 16 al 20.</p>'
        : (section.id === 'venta_llanta' ? '<p class="muted">Elige la llanta de la lista.</p>' : '<p class="muted">Elige el rin.</p>'));
    return `<div class="sale-section"><h3>${esc(section.name)}</h3>${note}${body}</div>`;
  }).join('');
  return `${blocks}<div class="sale-section"><h3>Otros</h3><div class="rim-grid"><button class="btn ghost" type="button" data-action="pick-option" data-section="otros">Describir otra venta</button></div></div>`;
}

function captureSaleFields() {
  const draft = state.saleDraft;
  const model = document.getElementById('sale-model');
  const desc = document.getElementById('sale-desc');
  const employee = document.getElementById('sale-employee');
  const patches = document.getElementById('sale-patches');
  if (model) draft.carModel = model.value;
  if (desc) draft.description = desc.value;
  if (patches) draft.extraPatches = patches.value;
  if (employee) draft.employeeId = employee.value;
  ['yape', 'efectivo', 'transferencia'].forEach((method) => {
    const field = document.getElementById(`pay-${method}`);
    if (field) draft.amounts[method] = field.value;
  });
}

function saleFloat() {
  const draft = state.saleDraft;
  const quote = quoteSelection(draft);
  const otros = draft.sectionId === 'otros';
  const repair = draft.sectionId === 'reparacion' && /^\d+$/.test(String(draft.rim || ''));
  const patchesInvalid = repair && patchCount(draft.extraPatches) === null;
  const checks = ['yape', 'efectivo', 'transferencia'].map((method) => `<label><input type="checkbox" data-action="pay-method" data-method="${method}" ${draft.methods.includes(method) ? 'checked' : ''}> ${METHOD_LABEL[method]}</label>`).join('');
  const amounts = draft.methods.map((method) => `<label class="field"><span>Monto en ${METHOD_LABEL[method]}</span><input id="pay-${method}" inputmode="decimal" value="${esc(draft.amounts[method] || '')}" required></label>`).join('');
  const who = state.user.role === 'gerente'
    ? `<label class="field"><span>Empleado</span><select id="sale-employee">${state.employees.filter((emp) => emp.active !== false).map((emp) => `<option value="${esc(emp.id)}" ${emp.id === draft.employeeId ? 'selected' : ''}>${esc(emp.name)}</option>`).join('')}</select></label>`
    : '';
  const priceLine = otros
    ? 'Modelo del carro y método de pago. Si usas Yape, el monto es obligatorio.'
    : `${quote.extra > 0 ? `Rin ${money(quote.base)} + parches ${money(quote.extra)}. ` : `Precio ${money(quote.total)}. `}Los montos tienen que sumar ${money(quote.total)}.`;
  return `<form class="bubble" data-action="save-sale">
    <h2>${esc(quote.title)}</h2>
    <p class="muted">${priceLine}</p>
    ${who}
    ${repair ? `<label class="field"><span>Parches extra</span><input id="sale-patches" inputmode="numeric" value="${esc(draft.extraPatches || '0')}"></label>${patchesInvalid ? '<p class="form-error">Escribe un número entero de 0 a 30.</p>' : `<p class="muted">Cada parche extra suma ${money(quote.patch)}.</p>`}` : ''}
    ${otros ? `<label class="field"><span>Descripción de lo vendido</span><textarea id="sale-desc" maxlength="300" required>${esc(draft.description || '')}</textarea></label>` : ''}
    <label class="field"><span>Modelo del carro</span><input id="sale-model" maxlength="80" value="${esc(draft.carModel || '')}" required></label>
    <div class="field"><span>Método de pago</span><small class="muted">Máximo dos.</small></div>
    <div class="pay-options">${checks}</div>
    <div class="pay-amounts">${amounts}</div>
    <p class="form-error" data-form-error hidden></p>
    <div class="dialog-actions">
      <button class="btn ghost" type="button" data-action="close-modal">Cerrar</button>
      <button class="btn" type="submit">Registrar venta</button>
    </div>
  </form>`;
}

function modalHtml() {
  if (!state.modal) return '';
  if (state.modal.type === 'registro') return `<div class="float-layer">${saleFloat()}</div>`;
  const inner = modalInner();
  return inner ? `<div class="backdrop">${inner}</div>` : '';
}

function modalInner() {
  const type = state.modal.type;
  if (type === 'product') return productModal();
  if (type === 'sale') return saleModal();
  if (type === 'payment') return paymentModal();
  if (type === 'account') return accountModal();
  if (type === 'me') return meModal();
  return '';
}

function productModal() {
  const product = state.products.find((item) => item.id === state.modal.id) || {};
  const name = product.name || '';
  return `<form class="dialog wide" data-action="save-product">
    <h2>${product.id ? 'Editar producto' : 'Nuevo producto'}</h2>
    <p class="muted">La foto, la descripción y el mínimo para avisar cuando quede poco.</p>
    <div class="split">
      <div>
        ${previewBox(name || 'Nuevo')}
        <div class="inline-actions" style="margin:10px 0">
          <label class="btn ghost small file">Poner imagen<input id="product-image" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
          <button class="btn ghost small" type="button" data-action="clear-image">Quitar</button>
        </div>
      </div>
      <div>
        <label class="field"><span>Nombre</span><input id="product-name" name="name" maxlength="80" value="${esc(name)}" required></label>
        <label class="field"><span>Categoría</span><input name="category" maxlength="40" value="${esc(product.category || '')}"></label>
      </div>
    </div>
    <label class="field"><span>Descripción</span><textarea name="description" maxlength="500">${esc(product.description || '')}</textarea></label>
    <div class="split">
      <label class="field"><span>Precio</span><input name="price" inputmode="decimal" value="${esc(product.price ?? '')}" required></label>
      <label class="field"><span>Existencias</span><input name="stock" inputmode="decimal" value="${esc(product.stock ?? '')}" required></label>
    </div>
    <div class="split">
      <label class="field"><span>Avisar cuando quede en</span><input name="minStock" inputmode="decimal" value="${esc(product.minStock ?? 3)}" required></label>
      <label class="field"><span>Nota de lo que falta</span><input name="note" maxlength="200" value="${esc(product.note || '')}"></label>
    </div>
    <p class="form-error" data-form-error hidden></p>
    <div class="dialog-actions">
      <button class="btn ghost" type="button" data-action="close-modal">Cancelar</button>
      <button class="btn" type="submit">Guardar producto</button>
    </div>
  </form>`;
}

function previewBox(name) {
  const src = safeImage(draftImage);
  const style = src ? '' : ` style="background:${tint(name || 'Nuevo')}"`;
  const inner = src ? `<img alt="" src="${src}">` : `<span>${esc(initials(name || 'Nuevo'))}</span>`;
  return `<div id="preview" class="photo preview"${style}>${inner}</div>`;
}

function saleModal() {
  const products = [...state.products].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const options = products.map((product) => `<option value="${esc(product.id)}" ${product.id === state.saleDraft.productId ? 'selected' : ''} ${product.stock <= 0 ? 'disabled' : ''}>${esc(product.name)} · ${qty(product.stock)}</option>`).join('');
  const employees = state.employees.filter((item) => item.active);
  const employeeField = state.user.role === 'gerente'
    ? `<label class="field"><span>Comisión para</span><select id="sale-employee" name="employeeId"><option value="">Sin empleado, no genera comisión</option>${employees.map((emp) => `<option value="${esc(emp.id)}" ${emp.id === state.saleDraft.employeeId ? 'selected' : ''}>${esc(emp.name)} · ${percentLabel(emp.commissionPercent)}</option>`).join('')}</select></label>`
    : `<p>Se aplica tu porcentaje de ${percentLabel(state.user.commissionPercent)}.</p>`;
  return `<form class="dialog" data-action="save-sale">
    <h2>Registrar venta</h2>
    <p class="muted">Descuenta la existencia y guarda la comisión con el porcentaje de hoy.</p>
    <label class="field"><span>Producto</span><select id="sale-product" name="productId" required><option value="">Elige</option>${options}</select></label>
    <label class="field"><span>Cantidad</span><input id="sale-qty" name="quantity" inputmode="decimal" value="${esc(state.saleDraft.quantity)}" required></label>
    ${employeeField}
    <div class="preview-box">${salePreview()}</div>
    <p class="form-error" data-form-error hidden></p>
    <div class="dialog-actions">
      <button class="btn ghost" type="button" data-action="close-modal">Cancelar</button>
      <button class="btn" type="submit">Registrar</button>
    </div>
  </form>`;
}

function salePercent() {
  if (state.user.role === 'empleado') return Number(state.user.commissionPercent) || 0;
  const emp = state.employees.find((item) => item.id === state.saleDraft.employeeId);
  return emp ? Number(emp.commissionPercent) || 0 : 0;
}

function salePreview() {
  const product = state.products.find((item) => item.id === state.saleDraft.productId);
  if (!product) return '<p class="muted">Elige un producto para ver el total.</p>';
  const quantity = parseQty(state.saleDraft.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return '<p class="warn">Escribe una cantidad mayor que cero.</p>';
  if (quantity > Number(product.stock)) return '<p class="warn">No hay suficiente existencia.</p>';
  const total = roundMoney(product.price * quantity);
  const percent = salePercent();
  return `<p>Total de la venta <strong>${money(total)}</strong></p><p>Comisión ${percentLabel(percent)} <strong>${money(roundMoney(total * percent / 100))}</strong></p>`;
}

function paymentModal() {
  const emp = state.employees.find((item) => item.id === state.modal.employeeId);
  if (!emp) return '';
  const life = sumEmployee(emp, 'all');
  return `<form class="dialog" data-action="save-payment">
    <h2>Pago a ${esc(emp.name)}</h2>
    <p class="muted">Saldo actual: ${esc(owedText(life.owed))}.</p>
    <label class="field"><span>Valor</span><input name="amount" inputmode="decimal" required></label>
    <label class="field"><span>Fecha</span><input type="date" name="date" value="${todayISO()}" required></label>
    <label class="field"><span>Nota</span><input name="notes" maxlength="200" placeholder="Pago de la quincena"></label>
    <p class="form-error" data-form-error hidden></p>
    <div class="dialog-actions">
      <button class="btn ghost" type="button" data-action="close-modal">Cancelar</button>
      <button class="btn" type="submit">Guardar pago</button>
    </div>
  </form>`;
}

function accountModal() {
  const emp = state.employees.find((item) => item.id === state.modal.id);
  return `<form class="dialog" data-action="save-employee">
    <h2>${emp ? 'Editar empleado' : 'Nuevo empleado'}</h2>
    <p class="muted">Con este usuario entra a la pantalla de empleados. El porcentaje nuevo vale para las próximas ventas.</p>
    <label class="field"><span>Nombre</span><input name="name" maxlength="60" value="${esc(emp?.name || '')}" required></label>
    <label class="field"><span>Usuario</span><input name="username" maxlength="20" value="${esc(emp?.username || '')}" required></label>
    <label class="field"><span>Contraseña</span><input name="password" type="password" autocomplete="new-password" placeholder="${emp ? 'Déjala en blanco para no cambiarla' : 'Mínimo 4 caracteres'}"></label>
    <label class="field"><span>Comisión %</span><input name="commissionPercent" inputmode="decimal" value="${esc(emp?.commissionPercent ?? 10)}" required></label>
    <label class="check"><input type="checkbox" name="active" ${emp && emp.active === false ? '' : 'checked'}> Puede iniciar sesión</label>
    <p class="form-error" data-form-error hidden></p>
    <div class="dialog-actions">
      <button class="btn ghost" type="button" data-action="close-modal">Cancelar</button>
      <button class="btn" type="submit">Guardar cuenta</button>
    </div>
  </form>`;
}

function meModal() {
  return `<div class="dialog">
    <h2>Mi cuenta</h2>
    <form data-action="save-profile">
      <label class="field"><span>Nombre</span><input name="name" maxlength="60" value="${esc(state.user.name)}" required></label>
      <label class="field"><span>Usuario</span><input name="username" maxlength="20" value="${esc(state.user.username)}" required></label>
      <button class="btn" type="submit">Guardar datos</button>
    </form>
    <form data-action="save-password" style="margin-top:18px">
      <label class="field"><span>Contraseña actual</span><input name="currentPassword" type="password" autocomplete="current-password" required></label>
      <label class="field"><span>Nueva contraseña</span><input name="newPassword" type="password" autocomplete="new-password" required></label>
      <label class="field"><span>Repetir nueva</span><input name="repeat" type="password" autocomplete="new-password" required></label>
      <p class="form-error" data-form-error hidden></p>
      <div class="dialog-actions">
        <button class="btn ghost" type="button" data-action="close-modal">Cerrar</button>
        <button class="btn" type="submit">Cambiar contraseña</button>
      </div>
    </form>
  </div>`;
}

function render() {
  const active = document.activeElement;
  const keepFocus = ['search', 'sale-model', 'sale-desc', 'sale-patches', 'pay-yape', 'pay-efectivo', 'pay-transferencia'];
  const restore = active && keepFocus.includes(active.id)
    ? { id: active.id, start: active.selectionStart, end: active.selectionEnd }
    : null;
  const app = document.getElementById('app');
  if (state.booting) {
    app.innerHTML = '<div class="boot">Abriendo el inventario…</div>';
    return;
  }
  app.innerHTML = state.user ? shell() : loginView();
  document.title = state.user ? `${state.settings.businessName} · Inventario` : 'Inventario';
  if (restore) {
    const field = document.getElementById(restore.id);
    if (field) {
      field.focus();
      if (typeof restore.start === 'number' && field.setSelectionRange) field.setSelectionRange(restore.start, restore.end);
    }
  }
}

function requireQty(value, label) {
  const n = parseQty(value);
  if (!Number.isFinite(n)) {
    const error = new Error(`${label} no es válido.`);
    throw error;
  }
  return n;
}

async function onClick(event) {
  if (event.target.classList?.contains('backdrop') || event.target.classList?.contains('float-layer')) {
    state.modal = null;
    render();
    return;
  }
  const el = event.target.closest('[data-action]');
  if (!el || el.closest('form') && el.type === 'submit') return;
  const action = el.dataset.action;
  try {
    if (action === 'go') {
      state.view = el.dataset.view;
      render();
    } else if (action === 'go-filter') {
      state.filter = el.dataset.filter || 'todos';
      state.view = 'inventario';
      render();
    } else if (action === 'filter') {
      state.filter = el.dataset.filter;
      render();
    } else if (action === 'category') {
      state.category = el.dataset.category || 'todas';
      render();
    } else if (action === 'expand') {
      state.expandedId = state.expandedId === el.dataset.id ? null : el.dataset.id;
      render();
    } else if (action === 'toggle-employee' || action === 'open-and-go') {
      state.openEmployee = state.openEmployee === el.dataset.id && action !== 'open-and-go' ? null : el.dataset.id;
      if (action === 'open-and-go') state.view = 'equipo';
      render();
    } else if (action === 'close-modal') {
      state.modal = null;
      render();
    } else if (action === 'toggle-password') {
      const input = el.parentElement.querySelector('input');
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
        el.textContent = input.type === 'password' ? 'Ver' : 'Ocultar';
      }
    } else if (action === 'my-account') {
      state.modal = { type: 'me' };
      render();
    } else if (action === 'export-inventory') {
      exportInventory();
    } else if (action === 'export-sales') {
      exportSales();
    } else if (action === 'new-product') {
      openProduct(null);
    } else if (action === 'edit-product') {
      openProduct(el.dataset.id);
    } else if (action === 'clear-image') {
      draftImage = '';
      const name = document.querySelector('#product-name')?.value || 'Nuevo';
      document.getElementById('preview')?.replaceWith(document.createRange().createContextualFragment(previewBox(name)).firstChild);
    } else if (action === 'new-employee') {
      state.modal = { type: 'account', id: null };
      render();
    } else if (action === 'edit-employee') {
      state.modal = { type: 'account', id: el.dataset.id };
      render();
    } else if (action === 'sale') {
      openSale(el.dataset.id);
    } else if (action === 'pay') {
      state.modal = { type: 'payment', employeeId: el.dataset.id };
      render();
    } else if (action === 'logout') {
      await api('/api/logout', { method: 'POST', body: {} });
      resetSession();
      render();
    } else if (action === 'delete-product') {
      if (!confirm('¿Eliminar este producto del inventario?')) return;
      await api(`/api/products/${el.dataset.id}`, { method: 'DELETE' });
      await refresh();
      showToast('Producto eliminado.');
    } else if (action === 'bump' || action === 'agotado') {
      const body = action === 'agotado'
        ? { stock: 0, updateNote: false }
        : { delta: Number(el.dataset.delta), updateNote: false };
      await api(`/api/products/${el.dataset.id}/stock`, { method: 'PUT', body });
      await refresh();
      showToast(action === 'agotado' ? 'Marcado como agotado.' : 'Existencia actualizada.');
    } else if (action === 'delete-shift') {
      if (!confirm('¿Quitar estas horas?')) return;
      await api(`/api/shifts/${el.dataset.id}`, { method: 'DELETE' });
      await refresh();
    } else if (action === 'pick-option') {
      const sectionId = el.dataset.section;
      const rim = el.dataset.rim || '';
      const itemId = el.dataset.item || '';
      if (sectionId !== 'otros') {
        const quote = quoteSelection({ sectionId, rim, itemId, extraPatches: '0' });
        if (!(quote.total > 0)) {
          showToast('Esa opción todavía no tiene precio. La gerencia lo anota en Cuentas.', 'err');
          return;
        }
      }
      const first = state.employees.find((item) => item.active !== false);
      state.saleDraft = {
        sectionId,
        rim,
        itemId,
        extraPatches: '0',
        description: '',
        carModel: '',
        methods: [],
        amounts: { yape: '', efectivo: '', transferencia: '' },
        employeeId: state.user.role === 'empleado' ? state.user.id : (first?.id || ''),
      };
      state.modal = { type: 'registro' };
      render();
    } else if (action === 'add-tire') {
      const next = catalogFromAccountsForm();
      const tires = next.sections.find((section) => section.id === 'venta_llanta');
      if (tires) tires.items.push({ id: `llanta_${Date.now().toString(36)}`, name: '', price: '' });
      state.catalogDraft = next;
      render();
    } else if (action === 'remove-tire') {
      const next = catalogFromAccountsForm();
      const tires = next.sections.find((section) => section.id === 'venta_llanta');
      if (tires) tires.items.splice(Number(el.dataset.index), 1);
      state.catalogDraft = next;
      render();
    } else if (action === 'pay-method') {
      captureSaleFields();
      const method = el.dataset.method;
      const draft = state.saleDraft;
      const turningOn = el.checked && !draft.methods.includes(method);
      if (turningOn && draft.methods.length >= 2) {
        el.checked = false;
        showToast('Solo puedes elegir dos métodos de pago.', 'err');
        return;
      }
      draft.methods = el.checked
        ? [...draft.methods, method]
        : draft.methods.filter((item) => item !== method);
      render();
    } else if (action === 'delete-sale') {
      if (!confirm('¿Quitar esta venta del registro?')) return;
      await api(`/api/sales/${el.dataset.id}`, { method: 'DELETE' });
      await refresh();
      showToast('Venta quitada.');
    } else if (action === 'void-sale') {
      if (!confirm('¿Anular esta venta y devolver la existencia?')) return;
      await api(`/api/sales/${el.dataset.id}/void`, { method: 'POST', body: {} });
      await refresh();
      showToast('Venta anulada.');
    } else if (action === 'delete-payment') {
      if (!confirm('¿Quitar este pago?')) return;
      await api(`/api/payments/${el.dataset.id}`, { method: 'DELETE' });
      await refresh();
    } else if (action === 'clear-demo') {
      if (!confirm('¿Borrar los productos, empleados, ventas y pagos de ejemplo? Tu cuenta de gerente se queda.')) return;
      await api('/api/demo/clear', { method: 'POST', body: {} });
      await refresh();
      showToast('Listo. Ya puedes cargar tu inventario.');
    } else if (action === 'dismiss-demo') {
      await api('/api/settings', { method: 'PUT', body: { demo: false } });
      await refresh();
    }
  } catch (error) {
    handleError(error);
  }
}

function openProduct(id) {
  const product = state.products.find((item) => item.id === id);
  draftImage = product?.image || '';
  state.modal = { type: 'product', id: id || null };
  render();
}

function openSale(productId) {
  const first = state.employees.find((item) => item.active);
  state.saleDraft = {
    productId: productId || '',
    quantity: '1',
    employeeId: state.user.role === 'empleado' ? state.user.id : (first?.id || ''),
  };
  state.modal = { type: 'sale' };
  render();
}

async function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.action) return;
  event.preventDefault();
  const action = form.dataset.action;
  const data = Object.fromEntries(new FormData(form));
  const button = form.querySelector('[type="submit"]');
  if (button) button.disabled = true;
  try {
    if (action === 'login') {
      const payload = await api('/api/login', { method: 'POST', body: { username: data.username, password: data.password } });
      apply(payload);
      state.view = payload.user.role === 'gerente' ? 'inicio' : 'inventario';
      state.loginError = '';
      state.month = todayISO().slice(0, 7);
      render();
      return;
    }
    if (action === 'save-stock') {
      const stock = requireQty(data.stock, 'La existencia');
      if (stock < 0) throw new Error('La existencia no puede ser negativa.');
      await api(`/api/products/${form.dataset.id}/stock`, {
        method: 'PUT',
        body: { stock, note: data.note || '', updateNote: true },
      });
      await refresh();
      showToast('Inventario actualizado.');
      return;
    }
    if (action === 'save-product') {
      await api(state.modal.id ? `/api/products/${state.modal.id}` : '/api/products', {
        method: state.modal.id ? 'PUT' : 'POST',
        body: {
          name: data.name,
          description: data.description,
          category: data.category,
          price: requireQty(data.price, 'El precio'),
          stock: requireQty(data.stock, 'La existencia'),
          minStock: requireQty(data.minStock, 'El mínimo'),
          note: data.note || '',
          image: draftImage || '',
        },
      });
      await refresh();
      showToast('Producto guardado.');
      return;
    }
    if (action === 'save-sale') {
      captureSaleFields();
      const draft = state.saleDraft;
      const repair = draft.sectionId === 'reparacion' && /^\d+$/.test(String(draft.rim || ''));
      const patches = repair ? patchCount(draft.extraPatches) : 0;
      if (repair && patches === null) throw new Error('Los parches extra deben ser un número entero de 0 a 30.');
      const quote = quoteSelection({ ...draft, extraPatches: String(patches || 0) });
      if (!String(draft.carModel || '').trim()) throw new Error('Escribe el modelo del carro.');
      if (draft.sectionId === 'otros' && !String(draft.description || '').trim()) throw new Error('Describe lo que se vendió.');
      if (draft.sectionId !== 'otros' && !(quote.total > 0)) throw new Error('Esa opción todavía no tiene precio.');
      if (!draft.methods.length) throw new Error('Elige un método de pago.');
      if (draft.methods.length > 2) throw new Error('Solo puedes elegir dos métodos de pago.');
      const payments = draft.methods.map((method) => {
        const amount = parseQty(draft.amounts[method]);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error(method === 'yape' ? 'Escribe el monto que se pagó en Yape.' : `Escribe el monto en ${METHOD_LABEL[method]}.`);
        }
        return { method, amount };
      });
      const paid = roundMoney(payments.reduce((sum, item) => sum + item.amount, 0));
      if (quote.total > 0 && Math.abs(paid - quote.total) > 0.009) throw new Error('Los montos deben sumar el precio de la opción.');
      await api('/api/sales', {
        method: 'POST',
        body: {
          sectionId: draft.sectionId,
          rim: draft.rim,
          itemId: draft.itemId,
          extraPatches: patches || 0,
          description: draft.description,
          carModel: draft.carModel,
          payments,
          employeeId: state.user.role === 'empleado' ? state.user.id : draft.employeeId,
        },
      });
      await refresh();
      showToast('Venta registrada.');
      return;
    }
    if (action === 'save-shift') {
      await api('/api/shifts', {
        method: 'POST',
        body: {
          employeeId: data.employeeId || undefined,
          date: data.date,
          hours: requireQty(data.hours, 'Las horas'),
          notes: data.notes || '',
        },
      });
      await refresh();
      showToast('Horas guardadas.');
      return;
    }
    if (action === 'save-payment') {
      await api('/api/payments', {
        method: 'POST',
        body: {
          employeeId: state.modal.employeeId,
          amount: requireQty(data.amount, 'El pago'),
          date: data.date,
          notes: data.notes || '',
        },
      });
      await refresh();
      showToast('Pago registrado.');
      return;
    }
    if (action === 'save-employee') {
      const payload = {
        name: data.name,
        username: data.username,
        password: data.password || '',
        commissionPercent: requireQty(data.commissionPercent, 'El porcentaje'),
        hourlyRate: 0,
        active: Boolean(form.elements.active?.checked),
      };
      if (state.modal.id) await api(`/api/employees/${state.modal.id}`, { method: 'PUT', body: payload });
      else await api('/api/employees', { method: 'POST', body: payload });
      await refresh();
      showToast('Cuenta guardada.');
      return;
    }
    if (action === 'save-settings') {
      const draft = catalogFromAccountsForm();
      const sections = draft.sections.map((section) => {
        if (section.kind === 'rims') {
          const prices = {};
          (section.rims || []).forEach((rim) => { prices[rim] = optionalPrice(section.prices[rim], `El precio del rin ${rim}`); });
          const extras = (section.extras || []).map((extra) => ({
            id: extra.id,
            name: extra.name,
            price: optionalPrice(extra.price, `El precio de ${extra.name}`),
          }));
          return { id: section.id, prices, extras };
        }
        if (section.kind === 'single') return { id: section.id, price: optionalPrice(section.price, `El precio de ${section.name}`) };
        return {
          id: section.id,
          items: (section.items || []).map((item) => ({
            id: item.id,
            name: item.name,
            price: optionalPrice(item.price, 'El precio de la llanta'),
          })),
        };
      });
      await api('/api/settings', { method: 'PUT', body: { businessName: data.businessName, currency: data.currency, catalog: { sections } } });
      await refresh();
      showToast('Datos del negocio guardados.');
      return;
    }
    if (action === 'save-profile') {
      await api('/api/me', { method: 'PUT', body: { name: data.name, username: data.username } });
      await refresh();
      showToast('Datos actualizados.');
      return;
    }
    if (action === 'save-password') {
      if (data.newPassword !== data.repeat) throw new Error('La confirmación no coincide.');
      await api('/api/me/password', { method: 'POST', body: { currentPassword: data.currentPassword, newPassword: data.newPassword } });
      state.modal = null;
      render();
      showToast('Contraseña actualizada.');
    }
  } catch (error) {
    if (button) button.disabled = false;
    if (action === 'login') {
      state.loginUser = data.username || '';
      state.loginError = error.message;
      render();
      return;
    }
    handleError(error);
  }
}

function onInput(event) {
  const id = event.target.id;
  if (id === 'search') state.query = event.target.value;
  if (id === 'sale-model') state.saleDraft.carModel = event.target.value;
  if (id === 'sale-desc') state.saleDraft.description = event.target.value;
  if (id === 'sale-patches') state.saleDraft.extraPatches = event.target.value;
  if (id === 'pay-yape' || id === 'pay-efectivo' || id === 'pay-transferencia') {
    state.saleDraft.amounts[id.slice(4)] = event.target.value;
  }
  if (['search', 'sale-model', 'sale-desc', 'sale-patches', 'pay-yape', 'pay-efectivo', 'pay-transferencia'].includes(id)) render();
}

function onChange(event) {
  if (event.target.id === 'month') {
    state.month = event.target.value;
    render();
  }
  if (event.target.id === 'sort') {
    state.sort = event.target.value;
    render();
  }
  if (event.target.id === 'sale-product') {
    state.saleDraft.productId = event.target.value;
    render();
  }
  if (event.target.id === 'sale-employee') {
    state.saleDraft.employeeId = event.target.value;
    render();
  }
  if (event.target.id === 'product-image') readImage(event.target.files[0]);
}

function readImage(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    showToast('Usa una imagen JPG, PNG, WebP o GIF.', 'err');
    return;
  }
  if (file.size > 1500000) {
    showToast('La imagen pesa más de 1.5 MB.', 'err');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    draftImage = String(reader.result || '');
    const name = document.querySelector('#product-name')?.value || 'Nuevo';
    const box = document.getElementById('preview');
    if (!box) return;
    const holder = document.createElement('div');
    holder.innerHTML = previewBox(name);
    box.replaceWith(holder.firstElementChild);
  };
  reader.readAsDataURL(file);
}

document.getElementById('app').addEventListener('click', onClick);
document.getElementById('app').addEventListener('submit', onSubmit);
document.getElementById('app').addEventListener('input', onInput);
document.getElementById('app').addEventListener('change', onChange);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.modal) {
    state.modal = null;
    render();
  }
});

async function init() {
  render();
  try {
    const data = await api('/api/bootstrap');
    apply(data);
    state.view = data.user.role === 'gerente' ? 'inicio' : 'inventario';
  } catch (error) {
    state.user = null;
    if (error.status !== 401) state.loginError = error.message;
  }
  state.booting = false;
  render();
}

init();
