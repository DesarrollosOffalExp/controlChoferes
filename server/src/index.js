import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { getInweb, sql } from './db.js';
import { CHOFERES } from './choferes.js';
import { employeeList } from './navixy.js';
import { crearHoja, listarHojas, hojasPorFecha, anularHoja } from './hojaruta.js';
import { jornadaDia } from './fichada.js';
import { tiemposHoja, difRollover } from './metricas.js';
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
 * - Hs en viaje / Hs en geozona: de los HORARIOS de la Hoja de Ruta (los 4 tiempos
 *   que cargan Vigilancia/Chofer). Ver metricas.js (tiemposHoja).
 * - Hs en planta: jornada (fichada) − tiempo fuera del viaje (de la hoja).
 *
 * Todo el cruce con la hoja va en try/catch: si falla o no hay hoja, se devuelve
 * la fichada igual (métricas en null).
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

    // Hoja de Ruta del día: patente, destino y HORARIOS por chofer. De los horarios
    // salen Hs en viaje / Hs en geozona (y el tiempo fuera para Hs en planta).
    // Un chofer puede tener más de una hoja: se suman.
    const hoja = {}; // dni -> { patentes:Set, destinos:Set, viaje, geozona, fuera }
    try {
      const hojas = await hojasPorFecha(fecha);
      for (const h of hojas) {
        const dni = String(h.choferDni || '').trim();
        if (!dni) continue;
        const acc = (hoja[dni] ||= { patentes: new Set(), destinos: new Set(), viaje: null, geozona: null, fuera: null });
        if (h.patenteTractor) acc.patentes.add(String(h.patenteTractor).trim());
        if (h.destino) acc.destinos.add(String(h.destino).trim());
        const t = tiemposHoja(h);
        const sumar = (a, b) => (a == null && b == null ? null : (a || 0) + (b || 0));
        acc.viaje = sumar(acc.viaje, t.minViaje);
        acc.geozona = sumar(acc.geozona, t.minGeozona);
        acc.fuera = sumar(acc.fuera, t.minFuera);
      }
    } catch (e) {
      console.error('Cruce con Hoja de Ruta falló (se devuelve solo fichada):', e.message);
    }

    // Siempre los 18 choferes.
    const choferes = CHOFERES.map((c) => {
      const j = jornadaDia(marcasPorDni[c.dni], fecha); // null si no arrancó jornada ese día
      const h = hoja[c.dni];
      // Hs en planta = jornada (fichada) − tiempo fuera (viaje de la hoja).
      const jornadaMin = j?.salida ? difRollover(j.entrada.hora, j.salida.hora) : null;
      const minEnPlanta = jornadaMin != null && h?.fuera != null ? Math.max(0, jornadaMin - h.fuera) : null;
      return {
        dni: c.dni,
        chofer: c.nombre,
        area: 'Chofer',
        patente: h && h.patentes.size ? [...h.patentes].join(', ') : null,
        destino: h && h.destinos.size ? [...h.destinos].join(', ') : null,
        entrada: j?.entrada ?? null, // { hora, dia }
        salida: j?.salida ?? null,   // { hora, dia, otroDia }
        minEnPlanta,
        minViaje: h?.viaje ?? null,
        minGeozona: h?.geozona ?? null,
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
