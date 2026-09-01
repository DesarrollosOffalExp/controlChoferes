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

/** 'YYYY-MM-DD HH:mm:ss' -> minutos desde la medianoche de esa fecha. */
function minDelDia(s) {
  const m = String(s || '').match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60;
}

/**
 * Minutos que el camión (patente) estuvo FUERA de la geocerca OFFAL EXP en la fecha
 * = tiempo en viaje. Basado en eventos inzone/outzone del día (máquina de estados).
 * Devuelve null si no se puede determinar (sin tracker o sin eventos).
 *
 * @param patente  patente del tractor (de la Hoja de Ruta)
 * @param fecha    'YYYY-MM-DD'
 * @param finMin   minuto del día donde cortar (hoy: hora actual; días pasados: 1440)
 * @param trackers lista de trackers ya cacheada (opcional)
 */
export async function viajePorPatente(patente, fecha, finMin = 1440, trackers) {
  const tk = await trackerByPatente(patente, trackers);
  if (!tk) return { minutosViaje: null, trackerId: null, destinos: [], motivo: 'patente sin tracker en LSGPS' };

  const raw = await zoneEvents([tk.id], `${fecha} 00:00:00`, `${fecha} 23:59:59`);

  // Destinos: geozonas (que NO son OFFAL) donde el camión ENTRÓ ese día.
  const destinos = [...new Set(
    raw
      .filter((e) => (e.type || e.event) === 'inzone' && !esOffal(e))
      .map(zoneLabelDe)
      .filter(Boolean)
  )];

  const evs = raw
    .filter(esOffal)
    .map((e) => ({ tipo: e.type || e.event, min: minDelDia(e.time || e.date) }))
    .filter((e) => e.min != null && (e.tipo === 'inzone' || e.tipo === 'outzone'))
    .sort((a, b) => a.min - b.min);

  if (evs.length === 0) return { minutosViaje: null, trackerId: tk.id, destinos, motivo: 'sin eventos de geocerca ese día' };

  // Estado inicial (00:00): si el primer evento es "inzone" (llegó a Offal),
  // antes venía de viaje (afuera). Si es "outzone", empezó adentro.
  let afuera = evs[0].tipo === 'inzone';
  let cursor = 0;
  let viaje = 0;
  for (const e of evs) {
    if (e.tipo === 'inzone') {
      if (afuera) viaje += e.min - cursor; // cierra tramo de viaje
      afuera = false;
    } else {
      afuera = true; // sale de Offal -> abre tramo de viaje
    }
    cursor = e.min;
  }
  if (afuera) viaje += Math.max(0, finMin - cursor); // quedó afuera al cierre del día

  return { minutosViaje: Math.round(viaje), trackerId: tk.id, destinos, motivo: null };
}
