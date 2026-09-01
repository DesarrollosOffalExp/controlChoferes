// Hoja de Ruta (Transporte) — reemplazo del MS Form "Hoja de Ruta - Transporte".
// Se guarda en la Azure SQL compartida (controletiquetas), esquema transporte.
import { getHojaRuta, sql } from './db.js';

const TABLA = 'transporte.HojasRuta';

function intOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function txtOrNull(v, max) {
  const s = (v == null ? '' : String(v)).trim();
  return s ? s.slice(0, max) : null;
}

/**
 * Inserta una hoja de ruta. Obligatorios: fecha, chofer (dni) y patente del tractor
 * (la patente es la que después se cruza con LSGPS para el tiempo en planta).
 * @returns { id }
 */
export async function crearHoja(data, creadoPor) {
  const fecha = String(data.fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha inválida (YYYY-MM-DD).');
  const choferDni = txtOrNull(data.choferDni, 20);
  if (!choferDni) throw new Error('Falta el chofer.');
  const patente = txtOrNull(data.patenteTractor, 20);
  if (!patente) throw new Error('Falta la patente del tractor.');

  const pool = await getHojaRuta();
  const r = pool.request();
  r.input('fecha', sql.Date, fecha);
  r.input('remito', sql.VarChar(40), txtOrNull(data.numeroRemito, 40));
  r.input('choferDni', sql.VarChar(20), choferDni);
  r.input('choferNombre', sql.VarChar(120), txtOrNull(data.choferNombre, 120));
  r.input('patente', sql.VarChar(20), patente.toUpperCase());
  r.input('destino', sql.VarChar(160), txtOrNull(data.destino, 160));
  r.input('semiLleva', sql.VarChar(40), txtOrNull(data.semiLleva, 40));
  r.input('semi', sql.VarChar(40), txtOrNull(data.semi, 40));
  r.input('hielo', sql.Int, intOrNull(data.hielo));
  r.input('tambor', sql.Int, intOrNull(data.tambor));
  r.input('pallets', sql.Int, intOrNull(data.pallets));
  r.input('aguaOx', sql.Int, intOrNull(data.aguaOxigenada));
  r.input('tamborHiel', sql.Int, intOrNull(data.tamborHiel));
  r.input('creadoPor', sql.VarChar(160), txtOrNull(creadoPor, 160));

  const q = `
    INSERT INTO ${TABLA}
      (Fecha, NumeroRemito, ChoferDni, ChoferNombre, PatenteTractor, Destino,
       SemiLleva, Semi, Hielo, Tambor, Pallets, AguaOxigenada, TamborHiel, CreadoPor)
    OUTPUT INSERTED.Id
    VALUES
      (@fecha, @remito, @choferDni, @choferNombre, @patente, @destino,
       @semiLleva, @semi, @hielo, @tambor, @pallets, @aguaOx, @tamborHiel, @creadoPor);`;
  const res = await r.query(q);
  return { id: res.recordset[0].Id };
}

/** Lista hojas de ruta (no anuladas) por rango de fechas, más nuevas primero. */
export async function listarHojas({ desde, hasta } = {}) {
  const pool = await getHojaRuta();
  const r = pool.request();
  let where = 'Anulada = 0';
  if (/^\d{4}-\d{2}-\d{2}$/.test(desde || '')) { r.input('desde', sql.Date, desde); where += ' AND Fecha >= @desde'; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) { r.input('hasta', sql.Date, hasta); where += ' AND Fecha <= @hasta'; }
  const q = `
    SELECT Id AS id, CONVERT(varchar(10), Fecha, 23) AS fecha,
           NumeroRemito AS numeroRemito, ChoferDni AS choferDni, ChoferNombre AS choferNombre,
           PatenteTractor AS patenteTractor, Destino AS destino,
           SemiLleva AS semiLleva, Semi AS semi,
           Hielo AS hielo, Tambor AS tambor, Pallets AS pallets,
           AguaOxigenada AS aguaOxigenada, TamborHiel AS tamborHiel,
           CONVERT(varchar(19), CreadoEn, 120) AS creadoEn, CreadoPor AS creadoPor
    FROM ${TABLA}
    WHERE ${where}
    ORDER BY Fecha DESC, Id DESC;`;
  const res = await r.query(q);
  return res.recordset;
}

/** Hojas de una fecha puntual (para el cruce con LSGPS en la reportería). */
export function hojasPorFecha(fecha) {
  return listarHojas({ desde: fecha, hasta: fecha });
}

/** Marca una hoja como anulada (soft-delete). */
export async function anularHoja(id) {
  const pool = await getHojaRuta();
  const r = pool.request();
  r.input('id', sql.Int, Number(id));
  await r.query(`UPDATE ${TABLA} SET Anulada = 1 WHERE Id = @id;`);
  return { id: Number(id) };
}
