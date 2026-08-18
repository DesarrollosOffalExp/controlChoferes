import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { getInweb, sql } from './db.js';
import { CHOFERES } from './choferes.js';
import { employeeList } from './navixy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/choferes', (_req, res) => res.json({ choferes: CHOFERES }));

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
 * Presencia (fichada) de los choferes para una fecha.
 * GET /api/presencia?fecha=YYYY-MM-DD
 *
 * Fuente: IntercambioDB062.dbo.DwJornadas (entrada/salida por legajo y día),
 * cruzada con DWPresentes (Legajo -> Identificacion = DNI) para filtrar choferes.
 *
 * NOTA: "minutosViaje" y "minutosSinViaje" quedan pendientes hasta definir
 * con LSGPS/Twins cómo se atribuye un viaje (con su duración) a un chofer.
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

    // Siempre los 18 choferes; con fichada donde haya.
    const choferes = CHOFERES.map((c) => {
      const r = byDni[c.dni];
      return {
        dni: c.dni,
        chofer: c.nombre,
        area: 'Chofer',
        entrada: r ? clean(r.entrada) : null,
        salida: r ? clean(r.salida) : null,
        minutosPresente: r && r.minutosPresente > 0 ? r.minutosPresente : 0,
        minutosViaje: null,     // pendiente: geocercas (camión en Offal) del GPS
        minutosSinViaje: null,  // = presente - viaje (pendiente)
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
