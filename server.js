const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const CURRENCIES = new Set(['COP', 'MXN', 'USD', 'EUR', 'PEN', 'ARS', 'CLP']);

const sessions = new Map();
const attempts = new Map();
let db = null;
let saveQueue = Promise.resolve();

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const verify = crypto.scryptSync(String(password), salt, 32);
  const left = Buffer.from(hash, 'hex');
  if (left.length !== verify.length) return false;
  return crypto.timingSafeEqual(left, verify);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function today() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const z = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function cleanText(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanNumber(value, { min = 0, max = 1000000000, decimals = 2, label }) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw httpError(400, `${label} no es válido.`);
  }
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function cleanDate(value) {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(400, 'La fecha no es válida.');
  return date;
}

function cleanImage(image) {
  if (!image) return '';
  if (typeof image !== 'string' || image.length > 2000000) {
    throw httpError(400, 'La imagen es demasiado grande. Usa una de menos de 1.5 MB.');
  }
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(image)) {
    throw httpError(400, 'Usa una imagen JPG, PNG, WebP o GIF.');
  }
  return image;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    commissionPercent: user.commissionPercent || 0,
    hourlyRate: user.hourlyRate || 0,
    active: user.active !== false,
  };
}

function seed() {
  const now = new Date().toISOString();
  const gerente = {
    id: uid('usr'),
    name: 'Gerente',
    username: 'gerente',
    passwordHash: hashPassword('gerente123'),
    role: 'gerente',
    commissionPercent: 0,
    hourlyRate: 0,
    active: true,
    demo: false,
    createdAt: now,
  };
  const ana = {
    id: uid('usr'),
    name: 'Ana Gómez',
    username: 'ana',
    passwordHash: hashPassword('ana123'),
    role: 'empleado',
    commissionPercent: 10,
    hourlyRate: 0,
    active: true,
    demo: true,
    createdAt: now,
  };
  const luis = {
    id: uid('usr'),
    name: 'Luis Pérez',
    username: 'luis',
    passwordHash: hashPassword('luis123'),
    role: 'empleado',
    commissionPercent: 8,
    hourlyRate: 0,
    active: true,
    demo: true,
    createdAt: now,
  };

  const products = [
    ['Café molido 500 g', 'Bolsa de café para venta al detal.', 'Abarrotes', 18500, 12, 4, ''],
    ['Aceite vegetal 1 L', 'Botella de aceite para cocina.', 'Abarrotes', 14200, 2, 4, 'Quedan dos botellas en el estante.'],
    ['Arroz 1 kg', 'Bolsa de arroz.', 'Abarrotes', 4800, 0, 6, 'Se acabó. Hay que pedir más.'],
    ['Jabón de baño', 'Barra de jabón.', 'Aseo', 3500, 18, 6, ''],
    ['Azúcar 1 kg', 'Bolsa de azúcar.', 'Abarrotes', 4200, 3, 5, 'Queda poco en la bodega.'],
    ['Leche entera 1 L', 'Caja de leche refrigerada.', 'Lácteos', 3900, 9, 6, ''],
  ].map(([name, description, category, price, stock, minStock, note]) => ({
    id: uid('prd'),
    name,
    description,
    category,
    price,
    stock,
    minStock,
    note,
    image: '',
    updatedAt: now,
    updatedByName: 'Ana Gómez',
    demo: true,
  }));

  const byName = Object.fromEntries(products.map((product) => [product.name, product]));

  function sale(employee, product, quantity, days) {
    const total = roundMoney(product.price * quantity);
    const commissionAmount = roundMoney(total * employee.commissionPercent / 100);
    return {
      id: uid('ven'),
      employeeId: employee.id,
      employeeName: employee.name,
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice: product.price,
      total,
      commissionPercent: employee.commissionPercent,
      commissionAmount,
      date: daysAgo(days),
      createdAt: now,
      voided: false,
      demo: true,
    };
  }

  const sales = [
    sale(ana, byName['Café molido 500 g'], 2, 1),
    sale(ana, byName['Leche entera 1 L'], 4, 2),
    sale(ana, byName['Azúcar 1 kg'], 2, 4),
    sale(luis, byName['Jabón de baño'], 3, 1),
    sale(luis, byName['Aceite vegetal 1 L'], 1, 3),
    sale(luis, byName['Café molido 500 g'], 1, 5),
  ];

  const shifts = [
    [ana, 1, 8, 'Turno de la mañana'],
    [ana, 2, 7.5, 'Cerró la tienda'],
    [ana, 4, 8, 'Recibió pedido'],
    [luis, 1, 8, 'Turno de la tarde'],
    [luis, 3, 6, 'Media jornada'],
    [luis, 5, 8, 'Acomodó estantes'],
  ].map(([employee, days, hours, notes]) => ({
    id: uid('tur'),
    employeeId: employee.id,
    date: daysAgo(days),
    hours,
    notes,
    createdAt: now,
    demo: true,
  }));

  const payments = [{
    id: uid('pag'),
    employeeId: ana.id,
    amount: 5000,
    date: daysAgo(1),
    notes: 'Abono de comisión',
    createdAt: now,
    demo: true,
  }];

  const movements = [
    {
      id: uid('mov'),
      type: 'ajuste',
      productId: byName['Arroz 1 kg'].id,
      productName: 'Arroz 1 kg',
      userId: ana.id,
      userName: ana.name,
      previous: 3,
      next: 0,
      quantity: 0,
      note: 'Se acabó. Hay que pedir más.',
      createdAt: now,
      demo: true,
    },
    {
      id: uid('mov'),
      type: 'ajuste',
      productId: byName['Aceite vegetal 1 L'].id,
      productName: 'Aceite vegetal 1 L',
      userId: luis.id,
      userName: luis.name,
      previous: 6,
      next: 2,
      quantity: 0,
      note: 'Quedan dos botellas en el estante.',
      createdAt: now,
      demo: true,
    },
  ];

  return {
    settings: {
      businessName: 'Mi negocio',
      currency: 'COP',
      demo: true,
      commissionRate: 30,
      services: defaultServices(),
    },
    users: [gerente, ana, luis],
    products,
    shifts,
    sales,
    payments,
    movements,
  };
}

function ensure() {
  db.settings ||= { businessName: 'Mi negocio', currency: 'COP', demo: false };
  if (!Array.isArray(db.settings.services) || db.settings.services.length !== 4) {
    db.settings.services = defaultServices();
  }
  db.settings.commissionRate = commissionRate();
  db.users ||= [];
  db.products ||= [];
  db.shifts ||= [];
  db.sales ||= [];
  db.payments ||= [];
  db.movements ||= [];
}

function load() {
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    ensure();
  } catch (error) {
    if (error.code !== 'ENOENT') {
      const backup = `${DB_PATH}.bak`;
      try { fs.copyFileSync(DB_PATH, backup); } catch { /* el archivo original se conserva si no se puede copiar */ }
      console.error('No se pudo leer la base. Se creó una nueva. La anterior quedó junto a data/db.json si se pudo copiar.');
    }
    db = seed();
    persistSync();
  }
}

function persistSync() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  try {
    fs.renameSync(tmp, DB_PATH);
  } catch {
    fs.copyFileSync(tmp, DB_PATH);
    fs.unlinkSync(tmp);
  }
}

function persist() {
  const run = saveQueue.then(() => persistSync());
  saveQueue = run.catch((error) => console.error('No se pudo guardar', error));
  return run;
}

function defaultServices() {
  return [1, 2, 3, 4].map((n) => ({ id: `srv_${n}`, name: '', price: 0 }));
}

function commissionRate() {
  return 30;
}

function payloadFor(user) {
  const isManager = user.role === 'gerente';
  const employees = db.users.filter((item) => item.role === 'empleado').map(publicUser);
  return {
    user: publicUser(user),
    settings: {
      businessName: db.settings.businessName || 'Mi negocio',
      currency: db.settings.currency || 'COP',
      demo: Boolean(db.settings.demo),
      commissionRate: commissionRate(),
      services: db.settings.services,
    },
    products: db.products,
    employees: isManager ? employees : employees.filter((item) => item.id === user.id),
    shifts: db.shifts.filter((item) => isManager || item.employeeId === user.id),
    sales: db.sales.filter((item) => isManager || item.employeeId === user.id),
    payments: db.payments.filter((item) => isManager || item.employeeId === user.id),
    movements: db.movements.filter((item) => isManager || item.userId === user.id).slice(-80).reverse(),
  };
}

function currentUser(req) {
  const cookie = String(req.headers.cookie || '');
  const sid = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('sid='));
  if (!sid) return null;
  const session = sessions.get(decodeURIComponent(sid.slice(4)));
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  if (!user || user.active === false) return null;
  return user;
}

function requireUser(req, role) {
  const user = currentUser(req);
  if (!user) throw httpError(401, 'Inicia sesión para continuar.');
  if (role && user.role !== role) throw httpError(403, 'No tienes permiso para esto.');
  return user;
}

function checkOrigin(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.origin;
  if (!origin) return;
  if (origin !== `http://${req.headers.host}`) throw httpError(403, 'Origen no permitido.');
}

function clientIp(req) {
  return req.socket.remoteAddress || 'local';
}

function tooMany(ip) {
  const row = attempts.get(ip);
  if (!row) return false;
  if (Date.now() > row.until) {
    attempts.delete(ip);
    return false;
  }
  return row.count >= 8;
}

function markFailure(ip) {
  const row = attempts.get(ip) || { count: 0, until: Date.now() + 60000 };
  if (Date.now() > row.until) {
    row.count = 0;
    row.until = Date.now() + 60000;
  }
  row.count += 1;
  attempts.set(ip, row);
}

function findEmployee(id, { required = true } = {}) {
  const employee = db.users.find((item) => item.id === id && item.role === 'empleado');
  if (!employee && required) throw httpError(404, 'No se encontró el empleado.');
  return employee || null;
}

function findProduct(id) {
  const product = db.products.find((item) => item.id === id);
  if (!product) throw httpError(404, 'Ese producto ya no está en el inventario.');
  return product;
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
  const taken = db.users.some((item) => item.username === username && item.id !== exceptId);
  if (taken) throw httpError(400, 'Ese usuario ya existe.');
}

function cleanUsername(value) {
  const username = cleanText(value, 20).toLowerCase();
  if (!/^[a-z0-9._-]{3,20}$/.test(username)) {
    throw httpError(400, 'El usuario debe tener de 3 a 20 letras o números, sin espacios.');
  }
  return username;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 8000000) {
        reject(httpError(413, 'Los datos son demasiado grandes.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(httpError(400, 'No se pudieron leer los datos.'));
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, pathname) {
  checkOrigin(req);
  const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);

  if (req.method === 'POST' && pathname === '/api/login') {
    const ip = clientIp(req);
    if (tooMany(ip)) throw httpError(429, 'Demasiados intentos. Espera un minuto.');
    const username = cleanText(body.username, 40).toLowerCase();
    const password = String(body.password || '');
    const user = db.users.find((item) => item.username === username);
    if (!user || user.active === false || !verifyPassword(password, user.passwordHash)) {
      markFailure(ip);
      throw httpError(401, 'Usuario o contraseña incorrectos.');
    }
    attempts.delete(ip);
    const sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, { userId: user.id });
    return send(res, 200, payloadFor(user), {
      'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600`,
    });
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    const user = currentUser(req);
    const cookie = String(req.headers.cookie || '');
    const sid = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('sid='));
    if (sid) sessions.delete(decodeURIComponent(sid.slice(4)));
    return send(res, 200, { ok: true, user: user ? publicUser(user) : null }, {
      'Set-Cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    });
  }

  if (req.method === 'GET' && pathname === '/api/bootstrap') {
    return send(res, 200, payloadFor(requireUser(req)));
  }

  if (req.method === 'PUT' && pathname === '/api/me') {
    const user = requireUser(req);
    const name = cleanText(body.name, 60);
    const username = cleanUsername(body.username);
    if (!name) throw httpError(400, 'Escribe tu nombre.');
    uniqueUsername(username, user.id);
    user.name = name;
    user.username = username;
    await persist();
    return send(res, 200, payloadFor(user));
  }

  if (req.method === 'POST' && pathname === '/api/me/password') {
    const user = requireUser(req);
    const next = String(body.newPassword || '');
    if (!verifyPassword(String(body.currentPassword || ''), user.passwordHash)) {
      throw httpError(400, 'La contraseña actual no coincide.');
    }
    if (next.length < 4 || next.length > 72) throw httpError(400, 'La nueva contraseña debe tener al menos 4 caracteres.');
    user.passwordHash = hashPassword(next);
    await persist();
    return send(res, 200, { ok: true });
  }

  if (req.method === 'PUT' && pathname === '/api/settings') {
    const user = requireUser(req, 'gerente');
    if ('businessName' in body) {
      db.settings.businessName = cleanText(body.businessName, 60) || 'Mi negocio';
    }
    if ('currency' in body) {
      if (!CURRENCIES.has(body.currency)) throw httpError(400, 'Esa moneda no está disponible.');
      db.settings.currency = body.currency;
    }
    if ('demo' in body) db.settings.demo = Boolean(body.demo);
    if (Array.isArray(body.services)) {
      db.settings.services.forEach((service, index) => {
        const item = body.services[index] || {};
        service.name = cleanText(item.name, 60);
        service.price = cleanNumber(item.price || 0, { min: 0, max: 1000000000, label: 'El precio' });
      });
    }
    await persist();
    return send(res, 200, payloadFor(user));
  }

  if (req.method === 'POST' && pathname === '/api/demo/clear') {
    const user = requireUser(req, 'gerente');
    db.users = db.users.filter((item) => !item.demo);
    db.products = db.products.filter((item) => !item.demo);
    db.shifts = db.shifts.filter((item) => !item.demo);
    db.sales = db.sales.filter((item) => !item.demo);
    db.payments = db.payments.filter((item) => !item.demo);
    db.movements = db.movements.filter((item) => !item.demo);
    db.settings.demo = false;
    await persist();
    return send(res, 200, payloadFor(user));
  }

  if (req.method === 'POST' && pathname === '/api/products') {
    const user = requireUser(req);
    const product = productFromBody(body);
    product.id = uid('prd');
    product.demo = false;
    touchProduct(product, user);
    db.products.push(product);
    addMovement({
      type: 'alta',
      productId: product.id,
      productName: product.name,
      userId: user.id,
      userName: user.name,
      previous: 0,
      next: product.stock,
      quantity: product.stock,
      note: product.note || '',
    });
    await persist();
    return send(res, 200, payloadFor(user));
  }

  const productStock = pathname.match(/^\/api\/products\/([^/]+)\/stock$/);
  if (req.method === 'PUT' && productStock) {
    const user = requireUser(req);
    const product = findProduct(decodeURIComponent(productStock[1]));
    let stock;
    if (body.delta !== undefined && body.delta !== null && body.delta !== '') {
      const delta = cleanNumber(body.delta, { min: -1000000, max: 1000000, label: 'El cambio' });
      stock = roundMoney(product.stock + delta);
      if (stock < 0) throw httpError(400, 'No hay existencias para quitar.');
    } else {
      stock = cleanNumber(body.stock, { min: 0, max: 1000000, label: 'La existencia' });
    }
    const previous = product.stock;
    product.stock = stock;
    if (body.updateNote) product.note = cleanText(body.note, 200);
    touchProduct(product, user);
    if (previous !== stock || body.updateNote) {
      addMovement({
        type: 'ajuste',
        productId: product.id,
        productName: product.name,
        userId: user.id,
        userName: user.name,
        previous,
        next: stock,
        quantity: stock,
        note: body.updateNote ? product.note : '',
      });
    }
    await persist();
    return send(res, 200, payloadFor(user));
  }

  const productId = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productId && (req.method === 'PUT' || req.method === 'DELETE')) {
    const user = requireUser(req);
    const id = decodeURIComponent(productId[1]);
    const index = db.products.findIndex((item) => item.id === id);
    if (index < 0) throw httpError(404, 'Ese producto ya no está en el inventario.');
    if (req.method === 'DELETE') {
      const [removed] = db.products.splice(index, 1);
      addMovement({
        type: 'baja',
        productId: removed.id,
        productName: removed.name,
        userId: user.id,
        userName: user.name,
        previous: removed.stock,
        next: 0,
        quantity: 0,
        note: '',
      });
    } else {
      const previous = db.products[index];
      const next = productFromBody(body);
      next.id = previous.id;
      next.demo = false;
      touchProduct(next, user);
      const changed = ['name', 'description', 'category', 'price', 'stock', 'minStock', 'note', 'image']
        .some((key) => previous[key] !== next[key]);
      db.products[index] = next;
      if (changed) {
        addMovement({
          type: previous.stock !== next.stock ? 'ajuste' : 'edicion',
          productId: next.id,
          productName: next.name,
          userId: user.id,
          userName: user.name,
          previous: previous.stock,
          next: next.stock,
          quantity: next.stock,
          note: next.note || '',
        });
      }
    }
    await persist();
    return send(res, 200, payloadFor(user));
  }

  if (req.method === 'POST' && pathname === '/api/employees') {
    const user = requireUser(req, 'gerente');
    const employee = employeeFromBody(body, { creating: true });
    uniqueUsername(employee.username);
    employee.id = uid('usr');
    employee.role = 'empleado';
    employee.demo = false;
    employee.createdAt = new Date().toISOString();
    db.users.push(employee);
    await persist();
    return send(res, 200, payloadFor(user));
  }

  const employeeId = pathname.match(/^\/api\/employees\/([^/]+)$/);
  if (req.method === 'PUT' && employeeId) {
    const user = requireUser(req, 'gerente');
    const employee = findEmployee(decodeURIComponent(employeeId[1]));
    const next = employeeFromBody(body, { creating: false, current: employee });
    uniqueUsername(next.username, employee.id);
    employee.name = next.name;
    employee.username = next.username;
    employee.commissionPercent = next.commissionPercent;
    employee.hourlyRate = next.hourlyRate;
    employee.active = next.active;
    if (next.passwordHash) employee.passwordHash = next.passwordHash;
    await persist();
    return send(res, 200, payloadFor(user));
  }

  if (req.method === 'POST' && pathname === '/api/shifts') {
    const user = requireUser(req);
    const employee = user.role === 'empleado' ? user : findEmployee(body.employeeId);
    const shift = {
      id: uid('tur'),
      employeeId: employee.id,
      date: cleanDate(body.date || today()),
      hours: cleanNumber(body.hours, { min: 0.25, max: 24, label: 'Las horas' }),
      notes: cleanText(body.notes, 200),
      createdAt: new Date().toISOString(),
      demo: false,
    };
    db.shifts.push(shift);
    await persist();
    return send(res, 200, payloadFor(user));
  }

  const shiftId = pathname.match(/^\/api\/shifts\/([^/]+)$/);
  if (req.method === 'DELETE' && shiftId) {
    const user = requireUser(req);
    const id = decodeURIComponent(shiftId[1]);
    const shift = db.shifts.find((item) => item.id === id);
    if (!shift) throw httpError(404, 'No se encontró esa jornada.');
    if (user.role !== 'gerente' && shift.employeeId !== user.id) throw httpError(403, 'No tienes permiso para esto.');
    db.shifts = db.shifts.filter((item) => item.id !== id);
    await persist();
    return send(res, 200, payloadFor(user));
  }

  if (req.method === 'POST' && pathname === '/api/sales') {
    const user = requireUser(req);
    const employee = user.role === 'empleado' ? user : findEmployee(body.employeeId);
    if (employee.active === false) throw httpError(400, 'Ese empleado está inactivo.');
    const carModel = cleanText(body.carModel, 80);
    if (!carModel) throw httpError(400, 'Escribe el modelo del carro.');
    const serviceId = String(body.serviceId || '');
    let serviceName = 'Otros';
    let catalogPrice = 0;
    let description = '';
    if (serviceId === 'otros') {
      description = cleanText(body.description, 300);
      if (!description) throw httpError(400, 'Describe lo que se vendió.');
    } else {
      const service = db.settings.services.find((item) => item.id === serviceId);
      if (!service) throw httpError(400, 'Elige una de las opciones.');
      serviceName = service.name || 'Opción sin nombre';
      catalogPrice = Number(service.price) || 0;
    }
    const methods = new Set(['yape', 'efectivo', 'transferencia']);
    const payments = Array.isArray(body.payments) ? body.payments : [];
    if (payments.length < 1 || payments.length > 2) throw httpError(400, 'Elige uno o dos métodos de pago.');
    const cleanPayments = payments.map((item) => {
      const method = String(item.method || '');
      if (!methods.has(method)) throw httpError(400, 'Ese método de pago no está disponible.');
      return { method, amount: cleanNumber(item.amount, { min: 0.01, max: 1000000000, label: 'El monto' }) };
    });
    if (new Set(cleanPayments.map((item) => item.method)).size !== cleanPayments.length) {
      throw httpError(400, 'No repitas el mismo método de pago.');
    }
    if (cleanPayments.some((item) => item.method === 'yape' && !(item.amount > 0))) {
      throw httpError(400, 'Escribe el monto que se pagó en Yape.');
    }
    if (cleanPayments.length === 2 && cleanPayments.some((item) => !(item.amount > 0))) {
      throw httpError(400, 'Escribe el monto de cada método de pago.');
    }
    const paid = roundMoney(cleanPayments.reduce((sum, item) => sum + item.amount, 0));
    if (catalogPrice > 0 && Math.abs(paid - catalogPrice) > 0.009) {
      throw httpError(400, 'Los montos deben sumar el precio del servicio.');
    }
    const total = catalogPrice > 0 ? catalogPrice : paid;
    const percent = commissionRate();
    const sale = {
      id: uid('ven'),
      employeeId: employee.id,
      employeeName: employee.name,
      serviceId,
      serviceName,
      description,
      carModel,
      payments: cleanPayments,
      productId: null,
      productName: serviceName,
      quantity: 1,
      unitPrice: total,
      total,
      commissionPercent: percent,
      commissionAmount: roundMoney(total * percent / 100),
      date: today(),
      createdAt: new Date().toISOString(),
      voided: false,
      demo: false,
    };
    db.sales.push(sale);
    addMovement({
      type: 'venta',
      productId: '',
      productName: serviceName,
      userId: user.id,
      userName: user.name,
      previous: 0,
      next: 0,
      quantity: 1,
      note: carModel,
    });
    await persist();
    return send(res, 200, payloadFor(user));
  }

  const deleteSale = pathname.match(/^\/api\/sales\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteSale) {
    const user = requireUser(req);
    const sale = db.sales.find((item) => item.id === decodeURIComponent(deleteSale[1]));
    if (!sale) throw httpError(404, 'No se encontró esa venta.');
    if (user.role !== 'gerente' && sale.employeeId !== user.id) throw httpError(403, 'No tienes permiso para esto.');
    db.sales = db.sales.filter((item) => item.id !== sale.id);
    await persist();
    return send(res, 200, payloadFor(user));
  }

  const voidSale = pathname.match(/^\/api\/sales\/([^/]+)\/void$/);
  if (req.method === 'POST' && voidSale) {
    const user = requireUser(req);
    const sale = db.sales.find((item) => item.id === decodeURIComponent(voidSale[1]));
    if (!sale || sale.voided) throw httpError(404, 'No se encontró esa venta.');
    const ownToday = sale.employeeId === user.id && sale.date === today();
    if (user.role !== 'gerente' && !ownToday) throw httpError(403, 'Solo puedes anular una venta tuya del día.');
    sale.voided = true;
    const product = db.products.find((item) => item.id === sale.productId);
    if (product) {
      const previous = product.stock;
      product.stock = roundMoney(product.stock + sale.quantity);
      touchProduct(product, user);
      addMovement({
        type: 'anulacion',
        productId: product.id,
        productName: product.name,
        userId: user.id,
        userName: user.name,
        previous,
        next: product.stock,
        quantity: sale.quantity,
        note: 'Venta anulada',
      });
    }
    await persist();
    return send(res, 200, payloadFor(user));
  }

  if (req.method === 'POST' && pathname === '/api/payments') {
    const user = requireUser(req, 'gerente');
    const employee = findEmployee(body.employeeId);
    const payment = {
      id: uid('pag'),
      employeeId: employee.id,
      amount: cleanNumber(body.amount, { min: 0.01, max: 1000000000, label: 'El pago' }),
      date: cleanDate(body.date || today()),
      notes: cleanText(body.notes, 200),
      createdAt: new Date().toISOString(),
      demo: false,
    };
    db.payments.push(payment);
    await persist();
    return send(res, 200, payloadFor(user));
  }

  const paymentId = pathname.match(/^\/api\/payments\/([^/]+)$/);
  if (req.method === 'DELETE' && paymentId) {
    const user = requireUser(req, 'gerente');
    const id = decodeURIComponent(paymentId[1]);
    if (!db.payments.some((item) => item.id === id)) throw httpError(404, 'No se encontró ese pago.');
    db.payments = db.payments.filter((item) => item.id !== id);
    await persist();
    return send(res, 200, payloadFor(user));
  }

  throw httpError(404, 'No se encontró lo que buscabas.');
}

function productFromBody(body) {
  const name = cleanText(body.name, 80);
  if (!name) throw httpError(400, 'Escribe el nombre del producto.');
  return {
    name,
    description: cleanText(body.description, 500),
    category: cleanText(body.category, 40),
    price: cleanNumber(body.price, { min: 0, max: 1000000000, label: 'El precio' }),
    stock: cleanNumber(body.stock, { min: 0, max: 1000000, label: 'La existencia' }),
    minStock: cleanNumber(body.minStock, { min: 0, max: 1000000, label: 'El mínimo' }),
    note: cleanText(body.note, 200),
    image: cleanImage(body.image),
  };
}

function employeeFromBody(body, { creating, current }) {
  const name = cleanText(body.name, 60);
  if (!name) throw httpError(400, 'Escribe el nombre del empleado.');
  const password = String(body.password || '');
  if (creating && password.length < 4) throw httpError(400, 'La contraseña debe tener al menos 4 caracteres.');
  if (password && (password.length < 4 || password.length > 72)) {
    throw httpError(400, 'La contraseña debe tener al menos 4 caracteres.');
  }
  return {
    name,
    username: cleanUsername(body.username),
    commissionPercent: cleanNumber(body.commissionPercent, { min: 0, max: 100, label: 'El porcentaje' }),
    hourlyRate: cleanNumber(body.hourlyRate || 0, { min: 0, max: 100000000, label: 'El valor por hora' }),
    active: body.active !== false && body.active !== 'false',
    passwordHash: password ? hashPassword(password) : current ? current.passwordHash : '',
  };
}

function send(res, status, body, extra = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  res.end(data);
}

function sendFile(res, filePath) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
  };
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
      return;
    }
    const root = path.resolve(PUBLIC);
    const requested = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.resolve(root, `.${requested}`);
    if (!filePath.toLowerCase().startsWith(root.toLowerCase())) {
      res.writeHead(403);
      res.end('No permitido');
      return;
    }
    sendFile(res, filePath);
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error(error);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Ocurrió un error.' : error.message });
  }
});

load();
server.listen(PORT, HOST, () => {
  console.log(`Inventario listo en http://localhost:${PORT}`);
  console.log('Deja esta ventana abierta mientras usas el sitio.');
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya está en uso. Cierra la otra ventana del inventario e inténtalo de nuevo.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
