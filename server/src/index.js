import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { getPool, sql } from './db.js';
import { CHOFERES_DNI } from './choferes.js';

const app = express();
app.use(cors());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/choferes', (_req, res) => res.json({ dnis: CHOFERES_DNI }));

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
    const pool = await getPool();
    const request = pool.request();
    request.input('fecha', sql.Date, fecha);
    CHOFERES_DNI.forEach((d, i) => request.input('dni' + i, sql.VarChar(20), d));
    const inList = CHOFERES_DNI.map((_, i) => '@dni' + i).join(', ');

    const q = `
      SELECT p.Identificacion AS dni,
             LTRIM(RTRIM(p.Apellido)) + ', ' + LTRIM(RTRIM(p.Nombre)) AS chofer,
             j.emp_Agrupamiento AS area,
             j.emp_MarcEntrada  AS entrada,
             j.emp_MarcSalida   AS salida,
             DATEDIFF(MINUTE,
                      TRY_CONVERT(datetime, j.emp_MarcEntrada, 103),
                      TRY_CONVERT(datetime, j.emp_MarcSalida, 103)) AS minutosPresente
      FROM IntercambioDB062.dbo.DwJornadas j
      INNER JOIN (SELECT DISTINCT Legajo, Identificacion, Apellido, Nombre
                  FROM IntercambioDB062.dbo.DWPresentes) p
        ON p.Legajo = j.emp_Legajo
      WHERE TRY_CONVERT(date, j.emp_Fecha, 103) = @fecha
        AND p.Identificacion IN (${inList})
      ORDER BY chofer;`;

    const result = await request.query(q);
    const clean = (v) => (v && v.trim() !== '' && v.trim() !== '-' ? v.trim() : null);
    const choferes = result.recordset.map((r) => ({
      dni: r.dni,
      chofer: r.chofer,
      area: clean(r.area),
      entrada: clean(r.entrada),
      salida: clean(r.salida),
      minutosPresente: r.minutosPresente > 0 ? r.minutosPresente : 0,
      minutosViaje: null,     // pendiente (definición LSGPS/Twins)
      minutosSinViaje: null,  // = presente - viaje (pendiente)
    }));

    res.json({ fecha, total: choferes.length, choferes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error consultando la base.', detalle: e.message });
  }
});

const port = process.env.PORT || 4610;
app.listen(port, () => console.log(`Registro de Choferes · API en http://localhost:${port}`));
