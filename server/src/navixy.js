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

const epoch = (ts) => Date.parse(`${String(ts || '').replace(' ', 'T')}Z`);
// ms -> hora/fecha local (los ts vienen como hora local y se parsean con 'Z', así que
// toISOString devuelve la misma hora de pared).
const fmtMs = (ms) => { const d = new Date(ms).toISOString(); return { fecha: d.slice(0, 10), hora: d.slice(11, 16) }; };

/**
 * Segmenta la actividad de UN tracker (por sus geocercas) dentro de la ventana
 * [desdeMs, hastaMs] (la jornada del chofer). Estados: dentro de OFFAL = planta,
 * dentro de un destino = geozona, fuera de todo = viaje (ruta). Agrupa en VIAJES:
 * cada viaje = salir de la planta hasta volver (con su tiempo de ruta y de destino).
 * @returns { plantaMin, trips:[{ viajeMin, geozonaMin, destinos:[], iniFecha, iniHora, finHora }] } | null
 */
export function viajesDeEventos(events, desdeMs, hastaMs) {
  if (!(hastaMs > desdeMs)) return null;
  const evs = (events || [])
    .map((e) => ({ ms: epoch(e.time || e.date), dir: e.event || e.type, offal: esOffal(e), zona: zoneLabelDe(e) }))
    .filter((e) => !Number.isNaN(e.ms) && (e.dir === 'inzone' || e.dir === 'outzone'))
    .sort((a, b) => a.ms - b.ms);

  // Estado (y zona destino) al inicio de la ventana, según el último evento anterior.
  let estado = null; // 'planta' | 'geozona' | 'viaje'
  let zona = null;
  const aplicar = (e) => {
    if (e.dir === 'inzone') { estado = e.offal ? 'planta' : 'geozona'; zona = e.offal ? null : e.zona; }
    else { estado = 'viaje'; zona = null; }
  };
  for (const e of evs) { if (e.ms < desdeMs) aplicar(e); else break; }
  const enVentana = evs.filter((e) => e.ms > desdeMs && e.ms < hastaMs);
  if (estado === null) {
    if (enVentana.length === 0) return null; // sin datos de GPS en la ventana
    estado = 'planta'; zona = null; // sin contexto: arranca en planta
  }

  // Segmentos con estado, acotados a la ventana.
  const segs = [];
  let cursor = desdeMs;
  for (const e of enVentana) {
    segs.push({ estado, zona, ini: cursor, fin: e.ms });
    aplicar(e);
    cursor = e.ms;
  }
  segs.push({ estado, zona, ini: cursor, fin: hastaMs });

  // Planta = tiempo en OFFAL. Viajes = corridas fuera de la planta (salida→regreso).
  let plantaMs = 0;
  const trips = [];
  let cur = null;
  for (const s of segs) {
    const dur = s.fin - s.ini;
    if (s.estado === 'planta') { plantaMs += dur; if (cur) { trips.push(cur); cur = null; } continue; }
    if (!cur) cur = { iniMs: s.ini, finMs: s.fin, viajeMs: 0, geozonaMs: 0, destinos: new Set() };
    cur.finMs = s.fin;
    if (s.estado === 'viaje') cur.viajeMs += dur;
    else { cur.geozonaMs += dur; if (s.zona) cur.destinos.add(s.zona); }
  }
  if (cur) trips.push(cur);

  const toMin = (ms) => Math.round(ms / 60000);
  return {
    plantaMin: toMin(plantaMs),
    trips: trips.map((t) => {
      const ini = fmtMs(t.iniMs);
      return {
        viajeMin: toMin(t.viajeMs),
        geozonaMin: toMin(t.geozonaMs),
        destinos: [...t.destinos],
        iniFecha: ini.fecha,
        iniHora: ini.hora,
        finHora: fmtMs(t.finMs).hora,
      };
    }),
  };
}
