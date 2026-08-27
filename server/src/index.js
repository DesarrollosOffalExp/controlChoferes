import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { getInweb, sql } from './db.js';
import { CHOFERES } from './choferes.js';
import { employeeList, trackerList, viajePorPatente } from './navixy.js';
import { crearHoja, listarHojas, hojasPorFecha, anularHoja } from './hojaruta.js';

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
 * Presencia + tiempo en planta de los choferes para una fecha.
 * GET /api/presencia?fecha=YYYY-MM-DD
 *
 * - Fichada (presencia): FichadasHik.hik.Fichada (primera→última marca facial por DNI).
 * - Tiempo en viaje: Hoja de Ruta (patente asignada al chofer ese día) → LSGPS
 *   (eventos de geocerca OFFAL EXP de ESA patente) → minutos fuera de la planta.
 * - Tiempo en Offal sin viaje = presente − viaje.
 *
 * El cruce con la Hoja de Ruta + LSGPS es best-effort: si falta la hoja o la
 * patente no está en LSGPS, minutosViaje/minutosSinViaje quedan en null.
 */
app.get('/api/presencia', async (req, res) => {
  const fecha = String(req.query.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Parámetro "fecha" requerido con formato YYYY-MM-DD.' });
  }
  try {
    const pool = await getInweb();
    const request = pool.request();
    request.input('fecha', sql.Date, fecha);
    CHOFERES.forEach((c, i) => request.input('dni' + i, sql.VarChar(20), c.dni));
    const inList = CHOFERES.map((_, i) => '@dni' + i).join(', ');

    // Fichada del día por DNI: primera marca (entrada) -> última marca (salida).
    // Fuente: FichadasHik.hik.Fichada (marcas faciales), = la "consulta fichadas" de RRHH.
    const q = `
      SELECT f.DNI AS dni,
             CONVERT(varchar(19), MIN(f.FechaHora), 120) AS entrada,
             CONVERT(varchar(19), MAX(f.FechaHora), 120) AS salida,
             DATEDIFF(MINUTE, MIN(f.FechaHora), MAX(f.FechaHora)) AS minutosPresente
      FROM FichadasHik.hik.Fichada f
      WHERE f.Fecha = @fecha AND f.DNI IN (${inList})
      GROUP BY f.DNI;`;

    const result = await request.query(q);
    const clean = (v) => (v && String(v).trim() !== '' ? String(v).trim() : null);

    const byDni = {};
    for (const r of result.recordset) byDni[String(r.dni).trim()] = r;

    // Hoja de Ruta del día: aporta la patente asignada a cada chofer.
    // Con esa patente cruzamos LSGPS para el tiempo en viaje (sin depender de
    // que Navixy tenga los choferes cargados). Todo el enriquecimiento va en un
    // try/catch: si falla (tabla/LSGPS), la fichada se devuelve igual.
    const patentesPorDni = {}; // dni -> Set(patentes)
    const viajePorDni = {};    // dni -> minutos en viaje (o null)
    try {
      const hojas = await hojasPorFecha(fecha);
      for (const h of hojas) {
        const dni = String(h.choferDni || '').trim();
        if (!dni || !h.patenteTractor) continue;
        (patentesPorDni[dni] ||= new Set()).add(String(h.patenteTractor).trim());
      }
      if (Object.keys(patentesPorDni).length) {
        // Si la fecha es hoy, cortamos el cálculo en la hora actual; si no, fin del día.
        const ahora = new Date();
        const esHoy = fecha === ahora.toISOString().slice(0, 10);
        const finMin = esHoy ? ahora.getHours() * 60 + ahora.getMinutes() : 1440;

        const trackers = await trackerList(); // cache una vez para todas las patentes
        const cachePat = {}; // patente -> minutosViaje
        for (const [dni, pats] of Object.entries(patentesPorDni)) {
          let suma = 0;
          let algunoResuelto = false;
          for (const pat of pats) {
            if (cachePat[pat] === undefined) {
              const v = await viajePorPatente(pat, fecha, finMin, trackers);
              cachePat[pat] = v.minutosViaje; // number o null
            }
            if (cachePat[pat] != null) { suma += cachePat[pat]; algunoResuelto = true; }
          }
          viajePorDni[dni] = algunoResuelto ? suma : null;
        }
      }
    } catch (e) {
      console.error('Enriquecimiento LSGPS/hoja de ruta falló (se devuelve solo fichada):', e.message);
    }

    // Siempre los 18 choferes; con fichada donde haya, y viaje donde la hoja + LSGPS lo permitan.
    const choferes = CHOFERES.map((c) => {
      const r = byDni[c.dni];
      const presente = r && r.minutosPresente > 0 ? r.minutosPresente : 0;
      const patentes = patentesPorDni[c.dni] ? [...patentesPorDni[c.dni]] : [];
      const minutosViaje = viajePorDni[c.dni] ?? null;
      return {
        dni: c.dni,
        chofer: c.nombre,
        area: 'Chofer',
        patente: patentes.join(', ') || null,
        entrada: r ? clean(r.entrada) : null,
        salida: r ? clean(r.salida) : null,
        minutosPresente: presente,
        minutosViaje,
        // Tiempo en planta sin manejar = presente − viaje (nunca negativo).
        minutosSinViaje: minutosViaje == null ? null : Math.max(0, presente - minutosViaje),
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
