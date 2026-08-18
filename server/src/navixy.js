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
