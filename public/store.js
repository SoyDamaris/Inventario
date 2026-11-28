/* En GitHub Pages no hay servidor. Esta capa guarda el inventario en el navegador
   y responde las mismas rutas /api que usa la aplicación local. */
(function () {
  const host = location.hostname;
  if (host !== 'github.io' && !host.endsWith('.github.io')) return;

  const DB_KEY = 'go-services-db';
  const SID_KEY = 'go-services-sid';
  const PATCH_EXTRA = 2;
  const VALVE_EXTRA = 2;
  const SHEET_URL = 'https://script.google.com/macros/s/AKfycbxH0jHhTYSbOi_n6Rqgu4AWC5JpejWLHjY2ieU3s8CBpJne_mwO3uJXQvK_dRyQGF33/exec';
  const CURRENCIES = new Set(['COP', 'MXN', 'USD', 'EUR', 'PEN', 'ARS', 'CLP']);
  const SECTION_DEFS = [
    { id: 'reparacion', name: 'Reparación', kind: 'rims', rims: ['14', '15', '16', '17', '18', '19', '20'], prices: { 14: 5, 15: 5, 16: 6, 17: 7, 18: 8, 19: 9, 20: 10 }, extras: [{ id: 'valvula', name: 'Válvula', price: 5 }] },
    { id: 'balances', name: 'Balances', kind: 'rims', rims: ['14', '15', '16', '17', '18', '20'], prices: { 14: 4, 15: 4, 16: 5, 17: 5, 18: 5, 20: 5 } },
    { id: 'rotacion', name: 'Rotación', kind: 'rims', rims: ['14', '15', '16', '17', '18', '20'], prices: { 14: 3, 15: 3, 16: 4, 17: 4, 18: 4, 20: 4 } },
    { id: 'cambio', name: 'Cambio de llantas', kind: 'rims', rims: ['14', '15', '16', '17', '18', '19', '20'], prices: { 14: 3, 15: 3, 16: 4, 17: 4, 18: 4, 19: 5, 20: 5 } },
    { id: 'lujo', name: 'Rims de lujo', kind: 'rims', rims: ['14', '15', '16', '17', '18', '19', '20'], prices: { 14: 7, 15: 7, 16: 10, 17: 10, 18: 10, 19: 10, 20: 10 } },
    { id: 'venta_llanta', name: 'Venta de llanta', kind: 'list' },
  ];

  let db = null;

  function uid(prefix) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return `${prefix}_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }

  function hex(bytes) {
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function fromHex(value) {
    const out = new Uint8Array(value.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  async function pbkdf2(password, salt) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
    return new Uint8Array(bits);
  }

  async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await pbkdf2(password, salt);
    return `pbkdf2:${hex(salt)}:${hex(hash)}`;
  }

  async function verifyPassword(password, stored) {
    const [kind, saltHex, hashHex] = String(stored || '').split(':');
    if (kind !== 'pbkdf2' || !saltHex || !hashHex) return false;
    const hash = await pbkdf2(password, fromHex(saltHex));
    const left = fromHex(hashHex);
    if (left.length !== hash.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ hash[i];
    return diff === 0;
  }

  function fail(status, message) {
    const error = new Error(message);
    error.status = status;
    throw error;
  }

  function today() {
    const d = new Date();
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  function roundMoney(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function cleanText(value, max) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function cleanNumber(value, { min = 0, max = 1000000000, label }) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) fail(400, `${label} no es válido.`);
    return Math.round(n * 100) / 100;
  }

  function cleanDate(value) {
    const date = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, 'La fecha no es válida.');
    return date;
  }

  function cleanImage(image) {
    if (!image) return '';
    if (typeof image !== 'string' || image.length > 2000000) fail(400, 'La imagen es demasiado grande. Usa una de menos de 1.5 MB.');
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(image)) fail(400, 'Usa una imagen JPG, PNG, WebP o GIF.');
    return image;
  }

  function cleanUsername(value) {
    const username = cleanText(value, 20).toLowerCase();
    if (!/^[a-z0-9._-]{3,20}$/.test(username)) fail(400, 'El usuario debe tener de 3 a 20 letras o números, sin espacios.');
    return username;
  }

  function publicUser(user) {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      payMode: user.payMode === 'salario' ? 'salario' : 'porcentaje',
      dailySalary: user.dailySalary || 0,
      commissionPercent: user.commissionPercent || 0,
      hourlyRate: user.hourlyRate || 0,
      active: user.active !== false,
    };
  }

  function blankCatalog() {
    return {
      patchExtra: PATCH_EXTRA,
      priceList: 2,
      sections: SECTION_DEFS.map((def) => {
        if (def.kind === 'rims') {
          return {
            id: def.id,
            name: def.name,
            kind: 'rims',
            rims: def.rims.slice(),
            prices: Object.fromEntries(def.rims.map((rim) => [rim, def.prices[rim]])),
            extras: (def.extras || []).map((extra) => ({ ...extra })),
          };
        }
        return { id: def.id, name: def.name, kind: 'list', items: [] };
      }),
    };
  }

  function normalizeCatalog(raw) {
    const catalog = blankCatalog();
    const previous = new Map(Array.isArray(raw?.sections) ? raw.sections.map((section) => [section.id, section]) : []);
    catalog.sections = catalog.sections.map((section) => {
      const current = previous.get(section.id);
      if (!current) return section;
      if (section.kind === 'rims') {
        const prices = { ...section.prices };
        section.rims.forEach((rim) => {
          const value = Number(current.prices?.[rim]);
          if (Number.isFinite(value) && value >= 0) prices[rim] = value;
        });
        const extras = section.extras.map((extra) => {
          const saved = (current.extras || []).find((item) => item.id === extra.id);
          const value = Number(saved?.price);
          return { ...extra, price: Number.isFinite(value) && value >= 0 ? value : extra.price };
        });
        return { ...section, prices, extras };
      }
      const items = Array.isArray(current.items) ? current.items : [];
      return {
        ...section,
        items: items.map((item, index) => ({
          id: String(item.id || `llanta_${index + 1}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || `llanta_${index + 1}`,
          name: cleanText(item.name, 80),
          price: Number(item.price) > 0 ? Number(item.price) : 0,
        })).filter((item) => item.name).slice(0, 40),
      };
    });
    return catalog;
  }

  function catalogFromBody(body) {
    const incoming = new Map(Array.isArray(body?.sections) ? body.sections.map((section) => [section.id, section]) : []);
    const seen = new Set();
    return {
      patchExtra: PATCH_EXTRA,
      priceList: 2,
      sections: SECTION_DEFS.map((def) => {
        const current = incoming.get(def.id) || {};
        if (def.kind === 'rims') {
          const prices = {};
          def.rims.forEach((rim) => {
            prices[rim] = cleanNumber(current.prices ? current.prices[rim] : def.prices[rim], { min: 0, label: `El precio del Rim ${rim}` });
          });
          return {
            id: def.id,
            name: def.name,
            kind: 'rims',
            rims: def.rims.slice(),
            prices,
            extras: (def.extras || []).map((extra) => {
              const saved = (current.extras || []).find((item) => item.id === extra.id) || {};
              return { id: extra.id, name: extra.name, price: cleanNumber(saved.price ?? extra.price, { min: 0, label: `El precio de ${extra.name}` }) };
            }),
          };
        }
        const items = Array.isArray(current.items) ? current.items.slice(0, 40) : [];
        return {
          id: def.id,
          name: def.name,
          kind: 'list',
          items: items.map((item, index) => {
            const name = cleanText(item?.name, 80);
            if (!name) return null;
            let id = String(item?.id || '').trim();
            if (!/^[a-z0-9_-]{1,40}$/i.test(id) || seen.has(id)) id = `llanta_${index + 1}_${hex(crypto.getRandomValues(new Uint8Array(3)))}`;
            seen.add(id);
            return { id, name, price: cleanNumber(item?.price || 0, { min: 0, label: `El precio de ${name}` }) };
          }).filter(Boolean),
        };
      }),
    };
  }

  function save() {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  async function seed() {
    const now = new Date().toISOString();
    const gerente = { id: uid('usr'), name: 'Gerente', username: 'gerente', passwordHash: await hashPassword('gerente123'), role: 'gerente', commissionPercent: 0, hourlyRate: 0, active: true, demo: false, createdAt: now };
    const ana = { id: uid('usr'), name: 'Ana Gómez', username: 'ana', passwordHash: await hashPassword('ana123'), role: 'empleado', commissionPercent: 10, hourlyRate: 0, active: true, demo: true, createdAt: now };
    const luis = { id: uid('usr'), name: 'Luis Pérez', username: 'luis', passwordHash: await hashPassword('luis123'), role: 'empleado', commissionPercent: 8, hourlyRate: 0, active: true, demo: true, createdAt: now };
    db = {
      settings: { businessName: 'Mi negocio', currency: 'USD', demo: false, commissionRate: 30, catalog: blankCatalog() },
      users: [gerente, ana, luis],
      products: [],
      shifts: [],
      sales: [],
      payments: [],
      movements: [],
    };
    save();
  }

  async function load() {
    try {
      db = JSON.parse(localStorage.getItem(DB_KEY) || '');
      if (!db || !Array.isArray(db.users)) throw new Error('vacío');
      db.settings ||= {};
      const previousList = db.settings.catalog?.priceList;
      db.settings.catalog = normalizeCatalog(db.settings.catalog);
      if (previousList !== 2) {
        const def = SECTION_DEFS.find((section) => section.id === 'reparacion');
        const repair = db.settings.catalog.sections.find((section) => section.id === 'reparacion');
        if (def && repair) {
          repair.rims = def.rims.slice();
          repair.prices = Object.fromEntries(def.rims.map((rim) => [rim, def.prices[rim]]));
        }
        db.settings.catalog.priceList = 2;
        save();
      }
      db.products ||= [];
      db.shifts ||= [];
      db.sales ||= [];
      db.payments ||= [];
      db.movements ||= [];
    } catch {
      await seed();
    }
  }

  function payloadFor(user) {
    const isManager = user.role === 'gerente';
    const employees = db.users.filter((item) => item.role === 'empleado').map(publicUser);
    return {
      user: publicUser(user),
      settings: {
        businessName: db.settings.businessName || 'Mi negocio',
        currency: db.settings.currency || 'USD',
        demo: Boolean(db.settings.demo),
        commissionRate: 30,
        services: db.settings.services || [],
        catalog: db.settings.catalog,
        sheetUrl: '',
      },
      products: db.products,
      employees: isManager ? employees : employees.filter((item) => item.id === user.id),
      shifts: db.shifts.filter((item) => isManager || item.employeeId === user.id),
      sales: db.sales.filter((item) => isManager || item.employeeId === user.id),
      payments: db.payments.filter((item) => isManager || item.employeeId === user.id),
      movements: db.movements.filter((item) => isManager || item.userId === user.id).slice(-80).reverse(),
    };
  }

  function currentUser() {
    const userId = sessionStorage.getItem(SID_KEY);
    if (!userId) return null;
    const user = db.users.find((item) => item.id === userId);
    if (!user || user.active === false) return null;
    return user;
  }

  function requireUser(role) {
    const user = currentUser();
    if (!user) fail(401, 'Inicia sesión para continuar.');
    if (role && user.role !== role) fail(403, 'No tienes permiso para esto.');
    return user;
  }

  function findEmployee(id) {
    const employee = db.users.find((item) => item.id === id && item.role === 'empleado');
    if (!employee) fail(404, 'No se encontró el empleado.');
    return employee;
  }

  function addMovement(entry) {
    db.movements.push({ id: uid('mov'), createdAt: new Date().toISOString(), ...entry });
    if (db.movements.length > 400) db.movements = db.movements.slice(-400);
  }

  function touchProduct(product, user) {
    product.updatedAt = new Date().toISOString();
    product.updatedByName = user.name;
  }

  function uniqueUsername(username, exceptId) {
    if (db.users.some((item) => item.username === username && item.id !== exceptId)) fail(400, 'Ese usuario ya existe.');
  }

  function productFromBody(body) {
    const name = cleanText(body.name, 80);
    if (!name) fail(400, 'Escribe el nombre del producto.');
    return {
      name,
      description: cleanText(body.description, 500),
      category: cleanText(body.category, 40),
      price: cleanNumber(body.price, { min: 0, label: 'El precio' }),
      stock: cleanNumber(body.stock, { min: 0, max: 1000000, label: 'La existencia' }),
      minStock: cleanNumber(body.minStock, { min: 0, max: 1000000, label: 'El mínimo' }),
      note: cleanText(body.note, 200),
      image: cleanImage(body.image),
    };
  }

  function countExtra(value, label) {
    const raw = String(value ?? '0').trim();
    if (raw === '') return 0;
    if (!/^\d+$/.test(raw)) fail(400, `${label} no son válidos.`);
    const count = Number(raw);
    if (count > 30) fail(400, `${label} no son válidos.`);
    return count;
  }

  async function employeeFromBody(body, { creating, current }) {
    const name = cleanText(body.name, 60);
    if (!name) fail(400, 'Escribe el nombre del empleado.');
    const password = String(body.password || '');
    if (creating && password.length < 4) fail(400, 'La contraseña debe tener al menos 4 caracteres.');
    if (password && (password.length < 4 || password.length > 72)) fail(400, 'La contraseña debe tener al menos 4 caracteres.');
    const payMode = body.payMode === 'salario' ? 'salario' : 'porcentaje';
    const dailySalary = payMode === 'salario'
      ? cleanNumber(body.dailySalary, { min: 0.01, max: 100000000, label: 'El salario del día' })
      : 0;
    const commissionPercent = payMode === 'porcentaje'
      ? cleanNumber(body.commissionPercent, { min: 0, max: 100, label: 'El porcentaje' })
      : 0;
    return {
      name,
      username: cleanUsername(body.username),
      payMode,
      dailySalary,
      commissionPercent,
      hourlyRate: 0,
      active: body.active !== false && body.active !== 'false',
      passwordHash: password ? await hashPassword(password) : current.passwordHash,
    };
  }

  const PAY_LABEL = { yappy: 'Yappy', yape: 'Yappy', efectivo: 'Efectivo', transferencia: 'Transferencia' };

  function payMethod(value) {
    const method = String(value || '');
    return method === 'yape' ? 'yappy' : method;
  }

  function linePrice(catalog, line) {
    const sectionId = String(line?.sectionId || '');
    if (sectionId === 'otros') {
      const description = cleanText(line.description, 300);
      if (!description) fail(400, 'Describe lo que se vendió.');
      const price = String(line.customPrice ?? '').trim() === ''
        ? 0
        : cleanNumber(line.customPrice, { min: 0, label: 'El valor del trabajo' });
      return { sectionId, title: `Otros · ${description}`, price, rim: '', description };
    }
    const section = (catalog.sections || []).find((item) => item.id === sectionId);
    if (!section) fail(400, 'Elige una sección.');
    if (section.kind === 'rims') {
      const rim = String(line.rim || '');
      const extraOption = (section.extras || []).find((item) => item.id === rim);
      if (extraOption) return { sectionId, title: `${section.name} · ${extraOption.name}`, price: Number(extraOption.price) || 0, rim, description: '' };
      if ((section.rims || []).includes(rim)) return { sectionId, title: `${section.name} · Rim ${rim}`, price: Number(section.prices[rim]) || 0, rim, description: '' };
      fail(400, 'Elige el Rim.');
    }
    const item = (section.items || []).find((entry) => entry.id === String(line.itemId || ''));
    if (!item) fail(400, 'Elige la llanta.');
    return { sectionId, title: `Venta de llanta · ${item.name}`, price: Number(item.price) || 0, rim: '', description: '' };
  }

  function sheetRows(sales) {
    return sales.map((sale) => {
      const parts = String(sale.date || '').split('-').map(Number);
      const weekday = parts[0] && parts[1] && parts[2]
        ? ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date(parts[0], parts[1] - 1, parts[2]).getDay()]
        : '';
      return {
        id: sale.id,
        date: sale.date,
        weekday,
        time: sale.createdAt ? new Date(sale.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '',
        employeeName: sale.employeeName || '',
        serviceName: sale.serviceName || '',
        rim: String(sale.rim || '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => (
          /^\d+$/.test(item) ? `Rim ${item}` : (item === 'valvula' ? 'Válvula' : '')
        )).filter(Boolean).join(', '),
        extraPatches: sale.extraPatches || 0,
        extraValves: sale.extraValves || 0,
        carModel: sale.carModel || '',
        description: sale.description || '',
        payment: (sale.payments || []).map((item) => `${PAY_LABEL[item.method] || item.method} ${item.amount}`).join(' + '),
        total: sale.total || 0,
        commissionAmount: sale.commissionAmount || 0,
        voided: Boolean(sale.voided),
        shift: sale.shift === 'noche' ? 'Noche' : (sale.shift === 'dia' ? 'Día' : ''),
        discount: sale.discount || 0,
        tip: sale.tip || 0,
      };
    });
  }

  async function pushSales(sales) {
    if (!sales.length) return true;
    try {
      const response = await fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ sales: sheetRows(sales) }),
      });
      const text = await response.text();
      return response.ok && /"ok"\s*:\s*true/.test(text);
    } catch {
      return false;
    }
  }

  async function archiveOldSales() {
    const pending = db.sales.filter((sale) => !sale.sheetSynced);
    if (pending.length) {
      const ok = await pushSales(pending);
      if (!ok) return;
      pending.forEach((sale) => { sale.sheetSynced = true; });
    }
    const todayStr = today();
    db.sales = db.sales.filter((sale) => !sale.sheetSynced || String(sale.date || '') >= todayStr);
    save();
  }

  async function handle(pathname, method, body) {
    if (method === 'POST' && pathname === '/api/login') {
      const username = cleanText(body.username, 40).toLowerCase();
      const user = db.users.find((item) => item.username === username);
      if (!user || user.active === false || !(await verifyPassword(String(body.password || ''), user.passwordHash))) {
        fail(401, 'Usuario o contraseña incorrectos.');
      }
      sessionStorage.setItem(SID_KEY, user.id);
      return payloadFor(user);
    }

    if (method === 'POST' && pathname === '/api/logout') {
      sessionStorage.removeItem(SID_KEY);
      return { ok: true };
    }

    if (method === 'GET' && pathname === '/api/bootstrap') {
      try { await archiveOldSales(); } catch { /* si Google no responde, las ventas siguen aquí */ }
      return payloadFor(requireUser());
    }

    if (method === 'PUT' && pathname === '/api/me') {
      const user = requireUser();
      const name = cleanText(body.name, 60);
      const username = cleanUsername(body.username);
      if (!name) fail(400, 'Escribe tu nombre.');
      uniqueUsername(username, user.id);
      user.name = name;
      user.username = username;
      save();
      return payloadFor(user);
    }

    if (method === 'POST' && pathname === '/api/me/password') {
      const user = requireUser();
      const next = String(body.newPassword || '');
      if (!(await verifyPassword(String(body.currentPassword || ''), user.passwordHash))) fail(400, 'La contraseña actual no coincide.');
      if (next.length < 4 || next.length > 72) fail(400, 'La nueva contraseña debe tener al menos 4 caracteres.');
      user.passwordHash = await hashPassword(next);
      save();
      return { ok: true };
    }

    if (method === 'PUT' && pathname === '/api/settings') {
      const user = requireUser('gerente');
      if ('businessName' in body) db.settings.businessName = cleanText(body.businessName, 60) || 'Mi negocio';
      if ('currency' in body) {
        if (!CURRENCIES.has(body.currency)) fail(400, 'Esa moneda no está disponible.');
        db.settings.currency = body.currency;
      }
      if ('demo' in body) db.settings.demo = Boolean(body.demo);
      if (body.catalog) db.settings.catalog = catalogFromBody(body.catalog);
      save();
      return payloadFor(user);
    }

    if (method === 'POST' && pathname === '/api/demo/clear') {
      const user = requireUser('gerente');
      db.users = db.users.filter((item) => !item.demo);
      db.products = db.products.filter((item) => !item.demo);
      db.sales = db.sales.filter((item) => !item.demo);
      db.payments = db.payments.filter((item) => !item.demo);
      db.movements = db.movements.filter((item) => !item.demo);
      db.settings.demo = false;
      save();
      return payloadFor(user);
    }

    if (method === 'POST' && pathname === '/api/products') {
      const user = requireUser();
      const product = productFromBody(body);
      product.id = uid('prd');
      product.demo = false;
      touchProduct(product, user);
      db.products.push(product);
      addMovement({ type: 'alta', productId: product.id, productName: product.name, userId: user.id, userName: user.name, previous: 0, next: product.stock, quantity: product.stock, note: product.note || '' });
      save();
      return payloadFor(user);
    }

    const productStock = pathname.match(/^\/api\/products\/([^/]+)\/stock$/);
    if (method === 'PUT' && productStock) {
      const user = requireUser();
      const product = db.products.find((item) => item.id === decodeURIComponent(productStock[1]));
      if (!product) fail(404, 'Ese producto ya no está en el inventario.');
      let stock;
      if (body.delta !== undefined && body.delta !== null && body.delta !== '') {
        const delta = cleanNumber(body.delta, { min: -1000000, max: 1000000, label: 'El cambio' });
        stock = roundMoney(product.stock + delta);
        if (stock < 0) fail(400, 'No hay existencias para quitar.');
      } else {
        stock = cleanNumber(body.stock, { min: 0, max: 1000000, label: 'La existencia' });
      }
      const previous = product.stock;
      product.stock = stock;
      if (body.updateNote) product.note = cleanText(body.note, 200);
      touchProduct(product, user);
      if (previous !== stock || body.updateNote) {
        addMovement({ type: 'ajuste', productId: product.id, productName: product.name, userId: user.id, userName: user.name, previous, next: stock, quantity: stock, note: body.updateNote ? product.note : '' });
      }
      save();
      return payloadFor(user);
    }

    const productId = pathname.match(/^\/api\/products\/([^/]+)$/);
    if (productId && (method === 'PUT' || method === 'DELETE')) {
      const user = requireUser();
      const id = decodeURIComponent(productId[1]);
      const index = db.products.findIndex((item) => item.id === id);
      if (index < 0) fail(404, 'Ese producto ya no está en el inventario.');
      if (method === 'DELETE') {
        const [removed] = db.products.splice(index, 1);
        addMovement({ type: 'baja', productId: removed.id, productName: removed.name, userId: user.id, userName: user.name, previous: removed.stock, next: 0, quantity: 0, note: '' });
      } else {
        const previous = db.products[index];
        const next = productFromBody(body);
        next.id = previous.id;
        next.demo = false;
        touchProduct(next, user);
        db.products[index] = next;
        addMovement({ type: previous.stock !== next.stock ? 'ajuste' : 'edicion', productId: next.id, productName: next.name, userId: user.id, userName: user.name, previous: previous.stock, next: next.stock, quantity: next.stock, note: next.note || '' });
      }
      save();
      return payloadFor(user);
    }

    if (method === 'POST' && pathname === '/api/employees') {
      const user = requireUser('gerente');
      const employee = await employeeFromBody(body, { creating: true });
      uniqueUsername(employee.username);
      employee.id = uid('usr');
      employee.role = 'empleado';
      employee.demo = false;
      employee.createdAt = new Date().toISOString();
      db.users.push(employee);
      save();
      return payloadFor(user);
    }

    const employeeId = pathname.match(/^\/api\/employees\/([^/]+)$/);
    if (method === 'DELETE' && employeeId) {
      const user = requireUser('gerente');
      const employee = findEmployee(decodeURIComponent(employeeId[1]));
      db.users = db.users.filter((item) => item.id !== employee.id);
      save();
      return payloadFor(user);
    }

    if (method === 'PUT' && employeeId) {
      const user = requireUser('gerente');
      const employee = findEmployee(decodeURIComponent(employeeId[1]));
      const next = await employeeFromBody(body, { creating: false, current: employee });
      uniqueUsername(next.username, employee.id);
      Object.assign(employee, {
        name: next.name,
        username: next.username,
        payMode: next.payMode,
        dailySalary: next.dailySalary,
        commissionPercent: next.commissionPercent,
        hourlyRate: next.hourlyRate,
        active: next.active,
        passwordHash: next.passwordHash,
      });
      save();
      return payloadFor(user);
    }

    if (method === 'POST' && pathname === '/api/sales') {
      const user = requireUser();
      const employee = user.role === 'empleado' ? user : findEmployee(body.employeeId);
      if (employee.active === false) fail(400, 'Ese empleado está inactivo.');
      const carModel = cleanText(body.carModel, 80);
      if (!carModel) fail(400, 'Escribe el modelo del carro.');
      const shift = body.shift === 'noche' ? 'noche' : body.shift === 'dia' ? 'dia' : '';
      if (!shift) fail(400, 'Elige el turno del día o de la noche.');
      const incoming = Array.isArray(body.lines) && body.lines.length
        ? body.lines
        : [{ sectionId: body.sectionId, rim: body.rim, itemId: body.itemId, customPrice: body.customPrice, description: body.description }];
      if (incoming.length > 8) fail(400, 'En un mismo carro se pueden anotar hasta 8 servicios.');
      const catalog = normalizeCatalog(db.settings.catalog);
      const resolved = incoming.map((line) => linePrice(catalog, line));
      if (resolved.some((line) => line.sectionId !== 'otros' && !(line.price > 0))) fail(400, 'Esa opción todavía no tiene precio.');
      const extraPatches = countExtra(body.extraPatches, 'Los parches');
      const extraValves = countExtra(body.extraValves, 'Las válvulas');
      const bits = [];
      if (extraPatches > 0) bits.push(`${extraPatches} parche${extraPatches === 1 ? '' : 's'}`);
      if (extraValves > 0) bits.push(`${extraValves} válvula${extraValves === 1 ? '' : 's'}`);
      const subtotal = roundMoney(resolved.reduce((sum, line) => sum + line.price, 0) + extraPatches * PATCH_EXTRA + extraValves * VALVE_EXTRA);
      const discount = String(body.discount ?? '').trim() === '' ? 0 : cleanNumber(body.discount, { min: 0, label: 'El descuento' });
      if (discount - subtotal > 0.009) fail(400, 'El descuento no puede pasar el precio del servicio.');
      const tip = String(body.tip ?? '').trim() === '' ? 0 : cleanNumber(body.tip, { min: 0, label: 'La propina' });
      const charged = roundMoney(subtotal - discount);
      const methods = new Set(['yappy', 'efectivo', 'transferencia']);
      const payments = Array.isArray(body.payments) ? body.payments : [];
      if (charged > 0 && (payments.length < 1 || payments.length > 2)) fail(400, 'Elige uno o dos métodos de pago.');
      if (charged === 0 && payments.length > 2) fail(400, 'Elige uno o dos métodos de pago.');
      const cleanPayments = payments.map((item) => {
        const methodName = payMethod(item.method);
        if (!methods.has(methodName)) fail(400, 'Ese método de pago no está disponible.');
        return { method: methodName, amount: cleanNumber(item.amount, { min: 0.01, label: 'El monto' }) };
      });
      if (new Set(cleanPayments.map((item) => item.method)).size !== cleanPayments.length) fail(400, 'No repitas el mismo método de pago.');
      const paid = roundMoney(cleanPayments.reduce((sum, item) => sum + item.amount, 0));
      if (charged > 0 && Math.abs(paid - charged) > 0.009) fail(400, 'Los montos deben sumar el precio del servicio, ya con el descuento.');
      const total = charged;
      const payMode = employee.payMode === 'salario' ? 'salario' : 'porcentaje';
      const percent = payMode === 'salario' ? 0 : Number(employee.commissionPercent) || 0;
      let serviceName = resolved.map((line) => line.title).join(' + ');
      let description = resolved.map((line) => line.description).filter(Boolean).join('. ');
      if (bits.length) {
        serviceName = `${serviceName} · ${bits.join(' · ')}`;
        description = [description, bits.join(', ')].filter(Boolean).join('. ');
      }
      description = [description, discount ? `Descuento ${discount}` : '', tip ? `Propina ${tip}` : ''].filter(Boolean).join('. ');
      const sale = {
        id: uid('ven'),
        employeeId: employee.id,
        employeeName: employee.name,
        sectionId: resolved[0].sectionId,
        lines: resolved.map((line) => ({ sectionId: line.sectionId, title: line.title, price: line.price, rim: line.rim })),
        serviceName,
        rim: resolved.map((line) => line.rim).filter((item) => /^\d+$/.test(item)).join(', '),
        extraPatches,
        extraValves,
        description,
        carModel,
        shift,
        discount,
        tip,
        payments: cleanPayments,
        productId: null,
        productName: serviceName,
        quantity: 1,
        unitPrice: total,
        total,
        payMode,
        commissionPercent: percent,
        commissionAmount: roundMoney(total * percent / 100),
        date: today(),
        createdAt: new Date().toISOString(),
        voided: false,
        demo: false,
      };
      db.sales.push(sale);
      addMovement({ type: 'venta', productId: '', productName: serviceName, userId: user.id, userName: user.name, previous: 0, next: 0, quantity: 1, note: carModel });
      save();
      const data = payloadFor(user);
      data.sheetSaved = await pushSales([sale]);
      if (data.sheetSaved) {
        sale.sheetSynced = true;
        save();
      }
      return data;
    }

    const deleteSale = pathname.match(/^\/api\/sales\/([^/]+)$/);
    if (method === 'DELETE' && deleteSale) {
      const user = requireUser();
      const sale = db.sales.find((item) => item.id === decodeURIComponent(deleteSale[1]));
      if (!sale) fail(404, 'No se encontró esa venta.');
      if (user.role !== 'gerente' && sale.employeeId !== user.id) fail(403, 'No tienes permiso para esto.');
      db.sales = db.sales.filter((item) => item.id !== sale.id);
      save();
      return payloadFor(user);
    }

    const voidSale = pathname.match(/^\/api\/sales\/([^/]+)\/void$/);
    if (method === 'POST' && voidSale) {
      const user = requireUser();
      const sale = db.sales.find((item) => item.id === decodeURIComponent(voidSale[1]));
      if (!sale || sale.voided) fail(404, 'No se encontró esa venta.');
      if (user.role !== 'gerente' && !(sale.employeeId === user.id && sale.date === today())) fail(403, 'Solo puedes anular una venta tuya del día.');
      sale.voided = true;
      save();
      return payloadFor(user);
    }

    if (method === 'POST' && pathname === '/api/payments') {
      const user = requireUser('gerente');
      const employee = findEmployee(body.employeeId);
      db.payments.push({
        id: uid('pag'),
        employeeId: employee.id,
        amount: cleanNumber(body.amount, { min: 0.01, label: 'El pago' }),
        date: cleanDate(body.date || today()),
        notes: cleanText(body.notes, 200),
        createdAt: new Date().toISOString(),
        demo: false,
      });
      save();
      return payloadFor(user);
    }

    const paymentId = pathname.match(/^\/api\/payments\/([^/]+)$/);
    if (method === 'DELETE' && paymentId) {
      requireUser('gerente');
      const id = decodeURIComponent(paymentId[1]);
      if (!db.payments.some((item) => item.id === id)) fail(404, 'No se encontró ese pago.');
      db.payments = db.payments.filter((item) => item.id !== id);
      save();
      return payloadFor(requireUser('gerente'));
    }

    fail(404, 'No se encontró lo que buscabas.');
  }

  const nativeFetch = window.fetch.bind(window);
  let ready = null;

  window.fetch = function (input, init) {
    const raw = typeof input === 'string' ? input : String(input && input.url || '');
    let pathname = raw;
    try { pathname = new URL(raw, location.origin).pathname; } catch { /* ruta relativa */ }
    if (!pathname.startsWith('/api/')) return nativeFetch(input, init);
    const method = (init && init.method) || 'GET';
    let body = {};
    if (init && init.body) {
      try { body = JSON.parse(init.body); } catch { body = {}; }
    }
    ready ||= load();
    return ready.then(() => handle(pathname, method, body)).then((data) => new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })).catch((error) => new Response(JSON.stringify({ error: error.message || 'No se pudo completar.' }), {
      status: error.status || 500,
      headers: { 'Content-Type': 'application/json' },
    }));
  };
})();
