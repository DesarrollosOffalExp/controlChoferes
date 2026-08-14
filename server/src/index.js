import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { getPool, sql } from './db.js';
import { CHOFERES } from './choferes.js';

const app = express();
app.use(cors());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/choferes', (_req, res) => res.json({ choferes: CHOFERES }));

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
    CHOFERES.forEach((c, i) => request.input('leg' + i, sql.VarChar(30), c.legajo));
    const inList = CHOFERES.map((_, i) => '@leg' + i).join(', ');

    // Fichada del día por legajo: primera entrada -> última salida (agregando las
    // jornadas del día), como la "consulta fichadas" de RRHH.
    const q = `
      SELECT j.emp_Legajo AS legajo,
             MAX(j.emp_Agrupamiento) AS area,
             CONVERT(varchar(19), MIN(TRY_CONVERT(datetime, j.emp_MarcEntrada, 103)), 120) AS entrada,
             CONVERT(varchar(19), MAX(TRY_CONVERT(datetime, j.emp_MarcSalida, 103)), 120)  AS salida,
             DATEDIFF(MINUTE,
                      MIN(TRY_CONVERT(datetime, j.emp_MarcEntrada, 103)),
                      MAX(TRY_CONVERT(datetime, j.emp_MarcSalida, 103))) AS minutosPresente
      FROM IntercambioDB062.dbo.DwJornadas j
      WHERE TRY_CONVERT(date, j.emp_Fecha, 103) = @fecha
        AND j.emp_Legajo IN (${inList})
      GROUP BY j.emp_Legajo;`;

    const result = await request.query(q);
    const clean = (v) => (v && v.trim() !== '' && v.trim() !== '-' ? v.trim() : null);

    // Mapa legajo (normalizado) -> jornada agregada del día.
    const byLegajo = {};
    for (const r of result.recordset) {
      byLegajo[(r.legajo || '').trim().toUpperCase()] = r;
    }

    // Siempre devolvemos los 18 choferes; con fichada donde haya.
    const choferes = CHOFERES.map((c) => {
      const r = byLegajo[c.legajo.trim().toUpperCase()];
      return {
        dni: c.dni,
        chofer: c.nombre,
        area: r ? clean(r.area) : null,
        entrada: r ? clean(r.entrada) : null,
        salida: r ? clean(r.salida) : null,
        minutosPresente: r && r.minutosPresente > 0 ? r.minutosPresente : 0,
        minutosViaje: null,     // pendiente (definición LSGPS/Twins)
        minutosSinViaje: null,  // = presente - viaje (pendiente)
      };
    }).sort((a, b) => a.chofer.localeCompare(b.chofer, 'es'));

    res.json({ fecha, total: choferes.length, choferes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error consultando la base.', detalle: e.message });
  }
});

const port = process.env.PORT || 4610;
app.listen(port, () => console.log(`Registro de Choferes · API en http://localhost:${port}`));
