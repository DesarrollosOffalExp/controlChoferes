import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { getInweb, sql } from './db.js';
import { CHOFERES } from './choferes.js';
import { employeeList, trackerList, zoneEvents, trackerByPatente, metricasDeEventos } from './navixy.js';
import { crearHoja, listarHojas, hojasPorFecha, anularHoja } from './hojaruta.js';
import { jornadaDia } from './fichada.js';
import { listarPatentes, listarFrigorificos } from './lavados.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

// Usuario autenticado (Easy Auth inyecta este header en producción; en local es null).
const usuarioDe = (req) =>
  req.header('x-ms-client-principal-name') || req.header('x-ms-client-principal-id') || null;

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/choferes', (_req, res) => res.json({ choferes: CHOFERES }));

// ---- Hoja de Ruta (Transporte) --------------------------------------------

/** POST /api/hoja-ruta — guarda una hoja de ruta. */
app.post('/api/hoja-ruta', async (req, res) => {
  try {
    const out = await crearHoja(req.body || {}, usuarioDe(req));
    res.status(201).json(out);
  } catch (e) {
    console.error(e);
    const clienteError = /inválida|Falta/.test(e.message);
    res.status(clienteError ? 400 : 500).json({ error: e.message });
  }
});

/** GET /api/hoja-ruta?desde=&hasta= — lista hojas de ruta. */
app.get('/api/hoja-ruta', async (req, res) => {
  try {
    const hojas = await listarHojas({ desde: req.query.desde, hasta: req.query.hasta });
    res.json({ total: hojas.length, hojas });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error consultando hojas de ruta.', detalle: e.message });
  }
});

/**
 * Catálogos reusados de Lavado de Camiones (para los desplegables de la hoja).
 * GET /api/lavados/patentes  → [{ codigo, tipoUnidad, modelo, marca }]
 * GET /api/lavados/frigorificos → [{ nombre }]
 * Si falla (sin acceso a lavados.*), devuelve lista vacía → el form cae a texto libre.
 */
app.get('/api/lavados/patentes', async (_req, res) => {
  try {
    res.json({ patentes: await listarPatentes() });
  } catch (e) {
    console.error('No se pudo leer lavados.Patentes:', e.message);
    res.json({ patentes: [], error: e.message });
  }
});

app.get('/api/lavados/frigorificos', async (_req, res) => {
  try {
    res.json({ frigorificos: await listarFrigorificos() });
  } catch (e) {
    console.error('No se pudo leer lavados.Frigorificos:', e.message);
    res.json({ frigorificos: [], error: e.message });
  }
});

/** POST /api/hoja-ruta/:id/anular — soft-delete. */
app.post('/api/hoja-ruta/:id/anular', async (req, res) => {
  try {
    res.json(await anularHoja(req.params.id));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error anulando la hoja.', detalle: e.message });
  }
});

/**
 * Cobertura en Navixy (LSGPS): para cada chofer nuestro, si está cargado como
 * empleado y si tiene vehículo asignado. Sirve para que Logística complete el setup
 * (paso necesario para calcular el "tiempo en viaje").
 * GET /api/navixy/cobertura
 */
app.get('/api/navixy/cobertura', async (_req, res) => {
  try {
    const emps = await employeeList();
    const byDni = {};
    for (const e of emps) byDni[String(e.driver_license_number || '').trim()] = e;
    const choferes = CHOFERES.map((c) => {
      const e = byDni[c.dni];
      return {
        dni: c.dni,
        chofer: c.nombre,
        enNavixy: !!e,
        employeeId: e ? e.id : null,
        trackerId: e ? e.tracker_id : null,
      };
    });
    res.json({
      total: choferes.length,
      enNavixy: choferes.filter((x) => x.enNavixy).length,
      conVehiculo: choferes.filter((x) => x.trackerId).length,
      choferes,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error consultando Navixy.', detalle: e.message });
  }
});

/**
 * Presencia + tiempos de los choferes para una fecha.
 * GET /api/presencia?fecha=YYYY-MM-DD
 *
 * - Entrada / Salida: jornada del chofer con los molinetes reales de Hikvision
 *   (Dispositivo 'Facial Entrada'/'Facial Salida'), tratando el cruce de medianoche.
 *   La jornada se imputa al día que ENTRA. Ver fichada.js (jornadaDia).
 * - Hs en planta / en viaje / en geozona: de NAVIXY. La Hoja de Ruta aporta el
 *   vínculo chofer↔patente; con la patente se toman las geocercas del tracker y,
 *   acotado a la jornada, se parte el tiempo en planta (OFFAL) / geozona (destino) /
 *   viaje (ruta). Ver navixy.js (metricasDeEventos).
 *
 * Todo el cruce (hoja + Navixy) va en try/catch: si falla, se devuelve la fichada
 * (métricas en null).
 */
app.get('/api/presencia', async (req, res) => {
  const fecha = String(req.query.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Parámetro "fecha" requerido con formato YYYY-MM-DD.' });
  }
  try {
    // Ventana: la fecha + el día SIGUIENTE (la salida del turno noche cae al otro día).
    const hasta = new Date(Date.parse(`${fecha}T00:00:00Z`) + 1 * 86400000)
      .toISOString().slice(0, 10);

    const pool = await getInweb();
    const request = pool.request();
    request.input('fecha', sql.Date, fecha);
    request.input('hasta', sql.Date, hasta);
    CHOFERES.forEach((c, i) => request.input('dni' + i, sql.VarChar(20), c.dni));
    const inList = CHOFERES.map((_, i) => '@dni' + i).join(', ');

    // Marcas de PERÍMETRO (entrada/salida real) en la ventana, con su dirección.
    const q = `
      SELECT f.DNI AS dni,
             CONVERT(varchar(19), f.FechaHora, 120) AS ts,
             CASE WHEN f.Dispositivo = 'Facial Entrada' THEN 'in'
                  WHEN f.Dispositivo = 'Facial Salida'  THEN 'out' END AS dir
      FROM FichadasHik.hik.Fichada f
      WHERE f.Fecha BETWEEN @fecha AND @hasta
        AND f.Dispositivo IN ('Facial Entrada', 'Facial Salida')
        AND f.DNI IN (${inList})
      ORDER BY f.DNI, f.FechaHora;`;

    const result = await request.query(q);

    // Agrupar marcas por DNI.
    const marcasPorDni = {};
    for (const r of result.recordset) {
      const dni = String(r.dni).trim();
      (marcasPorDni[dni] ||= []).push({ ts: String(r.ts).trim(), dir: r.dir });
    }

    // Jornada (entrada/salida) de cada chofer.
    const jorPorDni = {};
    for (const c of CHOFERES) jorPorDni[c.dni] = jornadaDia(marcasPorDni[c.dni], fecha);

    // Hoja de Ruta del día: patente y destino por chofer (el vínculo chofer↔patente).
    const patPorDni = {};  // dni -> Set(patentes)
    const destPorDni = {}; // dni -> Set(destinos de la hoja)
    try {
      const hojas = await hojasPorFecha(fecha);
      for (const h of hojas) {
        const dni = String(h.choferDni || '').trim();
        if (!dni) continue;
        if (h.patenteTractor) (patPorDni[dni] ||= new Set()).add(String(h.patenteTractor).trim());
        if (h.destino) (destPorDni[dni] ||= new Set()).add(String(h.destino).trim());
      }
    } catch (e) {
      console.error('Hoja de Ruta falló (se devuelve solo fichada):', e.message);
    }

    // Métricas desde NAVIXY (GPS): por la patente de la hoja → geocercas del tracker,
    // acotadas a la jornada del chofer. planta+geozona+viaje = jornada.
    const epochLocal = (ts) => Date.parse(`${ts.replace(' ', 'T')}Z`);
    const metPorDni = {};  // dni -> { minPlanta, minGeozona, minViaje, destinos }
    try {
      const necesarias = new Set();
      for (const c of CHOFERES) {
        if (jorPorDni[c.dni]?.salida && patPorDni[c.dni]) for (const p of patPorDni[c.dni]) necesarias.add(p);
      }
      if (necesarias.size) {
        const trackers = await trackerList();
        const trkPorPat = {};
        for (const p of necesarias) { const tk = await trackerByPatente(p, trackers); if (tk) trkPorPat[p] = tk.id; }
        const trackerIds = [...new Set(Object.values(trkPorPat))];
        if (trackerIds.length) {
          // Ventana amplia (día previo → 2 días después) para el estado inicial y el turno noche.
          const d0 = Date.parse(`${fecha}T00:00:00Z`);
          const desde = new Date(d0 - 86400000).toISOString().slice(0, 10);
          const hasta2 = new Date(d0 + 2 * 86400000).toISOString().slice(0, 10);
          const raw = await zoneEvents(trackerIds, `${desde} 00:00:00`, `${hasta2} 00:00:00`);
          const evPorTracker = {};
          for (const e of raw) (evPorTracker[e.tracker_id] ||= []).push(e);
          for (const c of CHOFERES) {
            const j = jorPorDni[c.dni];
            if (!j?.salida || !patPorDni[c.dni]) continue;
            const desdeMs = epochLocal(`${j.entrada.dia} ${j.entrada.hora}:00`);
            const hastaMs = epochLocal(`${j.salida.dia} ${j.salida.hora}:00`);
            for (const p of patPorDni[c.dni]) {
              const tid = trkPorPat[p];
              if (!tid) continue;
              const m = metricasDeEventos(evPorTracker[tid] || [], desdeMs, hastaMs);
              if (m) { metPorDni[c.dni] = m; break; } // primera patente que resuelve
            }
          }
        }
      }
    } catch (e) {
      console.error('Métricas Navixy fallaron (se devuelve fichada):', e.message);
    }

    // Siempre los 18 choferes.
    const choferes = CHOFERES.map((c) => {
      const j = jorPorDni[c.dni];
      const m = metPorDni[c.dni];
      const destinos = new Set([...(destPorDni[c.dni] || []), ...((m && m.destinos) || [])]);
      return {
        dni: c.dni,
        chofer: c.nombre,
        area: 'Chofer',
        patente: patPorDni[c.dni] ? [...patPorDni[c.dni]].join(', ') : null,
        destino: destinos.size ? [...destinos].join(', ') : null,
        entrada: j?.entrada ?? null, // { hora, dia }
        salida: j?.salida ?? null,   // { hora, dia, otroDia }
        minEnPlanta: m?.minPlanta ?? null,
        minViaje: m?.minViaje ?? null,
        minGeozona: m?.minGeozona ?? null,
      };
    }).sort((a, b) => a.chofer.localeCompare(b.chofer, 'es'));

    res.json({ fecha, total: choferes.length, choferes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error consultando la base.', detalle: e.message });
  }
});

// En producción servimos el frontend compilado (web/dist) desde el mismo Express,
// así queda un solo deployable (un App Service / un proceso).
const webDist = path.resolve(__dirname, '../../web/dist');
app.use(express.static(webDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'No encontrado' });
  res.sendFile(path.join(webDist, 'index.html'));
});

const port = process.env.PORT || 4610;
app.listen(port, () => console.log(`Registro de Choferes · API en http://localhost:${port}`));
