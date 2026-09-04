import 'dotenv/config';

// Cliente de la API de LSGPS (Navixy). Base y credenciales por env.
// Doc interna: http://192.168.97.125/viewtopic.php?t=1476
const BASE = (process.env.NAVIXY_BASE || 'https://napi.lsgps.com.ar').replace(/\/$/, '');

async function call(path, params) {
  const body = new URLSearchParams(params);
  const r = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return r.json();
}

// El hash de sesión se reutiliza unos minutos para no re-autenticar en cada request.
let cached = { hash: null, ts: 0 };
export async function getHash() {
  if (cached.hash && Date.now() - cached.ts < 5 * 60 * 1000) return cached.hash;
  const d = await call('user/auth', {
    login: process.env.NAVIXY_USER,
    password: process.env.NAVIXY_PASS,
  });
  if (!d.success || !d.hash) {
    throw new Error('Navixy auth falló: ' + JSON.stringify(d.status || d));
  }
  cached = { hash: d.hash, ts: Date.now() };
  return d.hash;
}

/** Lista de empleados (choferes): { id, driver_license_number (DNI), tracker_id, first_name, ... } */
export async function employeeList() {
  const d = await call('employee/list', { hash: await getHash() });
  return d.list || [];
}

/** Lista de trackers (vehículos): { id, label, ... } */
export async function trackerList() {
  const d = await call('tracker/list', { hash: await getHash() });
  return d.list || [];
}

/**
 * Eventos de entrada/salida de geocercas (inzone/outzone) para una lista de trackers.
 * Cada evento trae extra.zone_labels (ej. "OFFAL EXP") y extra.employee_id (el chofer).
 * Formato de fecha: 'YYYY-MM-DD HH:mm:ss'.
 */
export async function zoneEvents(trackerIds, from, to) {
  const d = await call('history/tracker/list', {
    hash: await getHash(),
    trackers: JSON.stringify(trackerIds),
    from,
    to,
    events: JSON.stringify(['inzone', 'outzone']),
  });
  return d.list || [];
}

// ---- Cruce por PATENTE (la que sale de la Hoja de Ruta) --------------------
// El nuevo modelo NO depende de que Navixy tenga cargados los choferes: solo
// necesita la patente. La Hoja de Ruta aporta chofer↔patente; acá tomamos la
// patente → tracker → tiempo fuera de la geocerca OFFAL EXP = tiempo en viaje.

/** Normaliza patente/label a solo alfanumérico en mayúscula (para comparar). */
function normPat(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Tracker (vehículo) cuyo label coincide con la patente, o null. */
export async function trackerByPatente(patente, trackers) {
  const objetivo = normPat(patente);
  if (!objetivo) return null;
  const list = trackers || (await trackerList());
  return (
    list.find((t) => normPat(t.label) === objetivo) ||
    list.find((t) => normPat(t.label).includes(objetivo)) ||
    null
  );
}

/** Etiqueta(s) de geozona de un evento (tolera string o array). */
function zoneLabelDe(ev) {
  const z = ev?.extra?.zone_labels ?? ev?.zone_labels ?? ev?.address ?? '';
  return (Array.isArray(z) ? z.join(', ') : String(z || '')).trim();
}

/** '¿este evento es de la geocerca OFFAL EXP?' */
function esOffal(ev) {
  return /offal/i.test(zoneLabelDe(ev));
}

// ---- Emparejar el destino de la HOJA con el nombre de la geocerca del GPS -------
// Los nombres difieren (hoja: "GANADERA SAN ROQUE S.A." · GPS: "GANADERA SAN ROQUE").
// Se comparan por palabras significativas en común (ignorando "FRIGORÍFICO", "S.A.", etc.).
const STOP = new Set(['FRIGORIFICO', 'FRIGORIFICOS', 'FRIG', 'MAT', 'SA', 'SAIC', 'SAICIF', 'SACIF',
  'SRL', 'SACI', 'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'SAN', 'SANTA', 'EXP', 'CIA', 'COMPANIA']);
function palabras(s) {
  return String(s || '')
    .toUpperCase().normalize('NFD')
    .replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}
/** ¿El destino de la hoja coincide (por alguna palabra) con el nombre de la geocerca? */
export function nombreCoincide(destinoHoja, zonaGps) {
  const a = new Set(palabras(destinoHoja));
  return palabras(zonaGps).some((t) => a.has(t));
}

const epoch = (ts) => Date.parse(`${String(ts || '').replace(' ', 'T')}Z`);
// ms -> hora/fecha local (los ts vienen como hora local y se parsean con 'Z', así que
// toISOString devuelve la misma hora de pared).
const fmtMs = (ms) => { const d = new Date(ms).toISOString(); return { fecha: d.slice(0, 10), hora: d.slice(11, 16) }; };

// Umbral: se ignoran entradas/salidas de geocerca de menos de estos minutos
// (deriva del GPS en el portón de planta + paradas de paso). Ver UPDATE 4 del proyecto.
const UMBRAL_MS = 5 * 60000;

/**
 * Analiza la actividad de UN tracker dentro de la ventana [desdeMs, hastaMs] (la jornada).
 * Estados por geocerca: OFFAL = planta · destino = geozona · fuera de todo = viaje (ruta).
 * Aplica el UMBRAL: los tramos de menos de 5 min se absorben en el anterior (limpia el
 * "temblequeo" del GPS y las paradas de paso).
 * @returns { outMin, geozonaMin, visitas:[{ zona, min, iniFecha, iniHora, finHora }] } | null
 *   outMin = tiempo FUERA de OFFAL (viaje + geozona). visitas = estadías en destinos.
 */
export function viajesDeEventos(events, desdeMs, hastaMs, umbralMs = UMBRAL_MS) {
  if (!(hastaMs > desdeMs)) return null;
  const evs = (events || [])
    .map((e) => ({ ms: epoch(e.time || e.date), dir: e.event || e.type, offal: esOffal(e), zona: zoneLabelDe(e) }))
    .filter((e) => !Number.isNaN(e.ms) && (e.dir === 'inzone' || e.dir === 'outzone'))
    .sort((a, b) => a.ms - b.ms);

  let estado = null; // 'planta' | 'geozona' | 'viaje'
  let zona = null;
  const aplicar = (e) => {
    if (e.dir === 'inzone') { estado = e.offal ? 'planta' : 'geozona'; zona = e.offal ? null : e.zona; }
    else { estado = 'viaje'; zona = null; }
  };
  for (const e of evs) { if (e.ms < desdeMs) aplicar(e); else break; }
  const enVentana = evs.filter((e) => e.ms > desdeMs && e.ms < hastaMs);
  if (estado === null) {
    if (enVentana.length === 0) return null;
    estado = 'planta'; zona = null; // sin contexto: arranca en planta
  }

  // Segmentos crudos.
  const segs = [];
  let cursor = desdeMs;
  for (const e of enVentana) { segs.push({ estado, zona, ini: cursor, fin: e.ms }); aplicar(e); cursor = e.ms; }
  segs.push({ estado, zona, ini: cursor, fin: hastaMs });

  // Umbral: absorber tramos < umbral en el anterior; luego coalescer iguales (2 pasadas).
  const paso1 = [];
  for (const s of segs) {
    if (paso1.length && (s.fin - s.ini) < umbralMs) { paso1[paso1.length - 1].fin = s.fin; continue; }
    if (paso1.length && paso1[paso1.length - 1].estado === s.estado && paso1[paso1.length - 1].zona === s.zona) { paso1[paso1.length - 1].fin = s.fin; continue; }
    paso1.push({ ...s });
  }
  const fin = [];
  for (const s of paso1) {
    if (fin.length && fin[fin.length - 1].estado === s.estado && fin[fin.length - 1].zona === s.zona) { fin[fin.length - 1].fin = s.fin; continue; }
    fin.push({ ...s });
  }

  let offalMs = 0, geoMs = 0;
  const visitas = [];
  for (const s of fin) {
    const d = s.fin - s.ini;
    if (s.estado === 'planta') offalMs += d;
    else if (s.estado === 'geozona') { geoMs += d; const f = fmtMs(s.ini); visitas.push({ zona: s.zona, min: Math.round(d / 60000), iniFecha: f.fecha, iniHora: f.hora, finHora: fmtMs(s.fin).hora }); }
  }
  const toMin = (ms) => Math.round(ms / 60000);
  return { outMin: toMin((hastaMs - desdeMs) - offalMs), geozonaMin: toMin(geoMs), visitas };
}
