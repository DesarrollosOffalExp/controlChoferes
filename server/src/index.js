import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { getInweb, sql } from './db.js';
import { CHOFERES } from './choferes.js';
import { employeeList, trackerList, viajePorPatente } from './navixy.js';
import { crearHoja, listarHojas, hojasPorFecha, anularHoja } from './hojaruta.js';
import { enPlantaDia, ahoraArg } from './fichada.js';
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
 * Presencia + tiempo en planta de los choferes para una fecha.
 * GET /api/presencia?fecha=YYYY-MM-DD
 *
 * - Hs EN PLANTA: se reconstruye con los molinetes reales de Hikvision
 *   (Dispositivo 'Facial Entrada' / 'Facial Salida') tratando el cruce de medianoche.
 *   NO se usa MIN/MAX del día: los choferes salen de viaje y vuelven, así que la
 *   primera/última marca del día calendario invierte entrada/salida. Ver fichada.js.
 * - Hs FUERA (molinete): resto del día fuera del perímetro (≈ viaje según fichada).
 * - Hs EN VIAJE (GPS): Hoja de Ruta (patente del chofer ese día) → LSGPS (geocerca
 *   OFFAL EXP de ESA patente). Sirve para validar/contrastar con la fichada.
 *
 * El cruce con LSGPS es best-effort: si falta la hoja o la patente no está en LSGPS,
 * minutosViaje queda en null (la fichada se devuelve igual).
 */
app.get('/api/presencia', async (req, res) => {
  const fecha = String(req.query.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Parámetro "fecha" requerido con formato YYYY-MM-DD.' });
  }
  try {
    // Ventana: la fecha + 3 días previos, para conocer el estado (dentro/fuera) en 00:00.
    const desde = new Date(Date.parse(`${fecha}T00:00:00Z`) - 3 * 86400000)
      .toISOString().slice(0, 10);
    const arg = ahoraArg();
    const finMin = fecha === arg.fecha ? arg.min : 1440; // si es hoy, cortar en la hora actual

    const pool = await getInweb();
    const request = pool.request();
    request.input('desde', sql.Date, desde);
    request.input('fecha', sql.Date, fecha);
    CHOFERES.forEach((c, i) => request.input('dni' + i, sql.VarChar(20), c.dni));
    const inList = CHOFERES.map((_, i) => '@dni' + i).join(', ');

    // Marcas de PERÍMETRO (entrada/salida real) en la ventana, con su dirección.
    const q = `
      SELECT f.DNI AS dni,
             CONVERT(varchar(19), f.FechaHora, 120) AS ts,
             CASE WHEN f.Dispositivo = 'Facial Entrada' THEN 'in'
                  WHEN f.Dispositivo = 'Facial Salida'  THEN 'out' END AS dir
      FROM FichadasHik.hik.Fichada f
      WHERE f.Fecha BETWEEN @desde AND @fecha
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

    // Hoja de Ruta del día: patente asignada a cada chofer → LSGPS (tiempo en viaje).
    // Todo en try/catch: si falla (tabla/LSGPS), la fichada se devuelve igual.
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

    // Siempre los 18 choferes.
    const choferes = CHOFERES.map((c) => {
      const planta = enPlantaDia(marcasPorDni[c.dni], fecha, finMin); // null si sin datos
      const patentes = patentesPorDni[c.dni] ? [...patentesPorDni[c.dni]] : [];
      return {
        dni: c.dni,
        chofer: c.nombre,
        area: 'Chofer',
        patente: patentes.join(', ') || null,
        primera: planta?.primera ?? null,   // 1ª marca del día { hora, dir:'E'|'S' }
        ultima: planta?.ultima ?? null,     // última marca del día { hora, dir:'E'|'S' }
        minutosEnPlanta: planta?.minutosEnPlanta ?? null, // dentro del perímetro
        minutosFuera: planta?.minutosFuera ?? null,       // fuera del perímetro (≈ viaje)
        minutosViaje: viajePorDni[c.dni] ?? null,         // viaje según GPS (validación)
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
