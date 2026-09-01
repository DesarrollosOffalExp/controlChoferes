// Catálogos que reusamos del módulo Lavado de Camiones (mismas tablas en
// controletiquetas, esquema lavados). Solo lectura, para poblar los desplegables
// de la Hoja de Ruta (patentes de tractor/semi/chasis/balancín, frigoríficos=destino).
import { getHojaRuta, sql } from './db.js';

/** Patentes del catálogo de lavados (activas). TipoUnidad es texto libre. */
export async function listarPatentes() {
  const pool = await getHojaRuta();
  const q = `
    SELECT Codigo AS codigo, TipoUnidad AS tipoUnidad, Modelo AS modelo, Marca AS marca
    FROM lavados.Patentes
    WHERE Activo = 1
    ORDER BY Codigo;`;
  const res = await pool.request().query(q);
  return res.recordset;
}

/** Frigoríficos del catálogo de lavados (activos) → opciones de "Destino". */
export async function listarFrigorificos() {
  const pool = await getHojaRuta();
  const res = await pool.request().query(
    `SELECT Nombre AS nombre FROM lavados.Frigorificos WHERE Activo = 1 ORDER BY Nombre;`
  );
  return res.recordset;
}

export { sql };
