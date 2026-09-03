// Tiempos del viaje a partir de los 4 horarios de la Hoja de Ruta ('HH:MM').
// El viaje puede cruzar la medianoche: se resuelve por orden cronológico
// (si una hora es menor que la anterior, se asume que sumó un día).

function toMin(hhmm) {
  const m = String(hhmm || '').match(/^(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutos de `a` a `b` (b puede caer al día siguiente). null si falta alguno. */
export function difRollover(a, b) {
  const ma = toMin(a);
  const mb = toMin(b);
  if (ma == null || mb == null) return null;
  let d = mb - ma;
  if (d < 0) d += 1440; // cruzó medianoche
  return d;
}

/**
 * Tiempos de UNA hoja (un viaje) a partir de sus horarios:
 * - minViaje   = ida (salidaPlanta→llegadaDestino) + vuelta (salidaDestino→llegadaPlanta)
 * - minGeozona = llegadaDestino→salidaDestino (tiempo en el destino)
 * - minFuera   = salidaPlanta→llegadaPlanta (viaje completo; se resta de la jornada)
 * Devuelve null en cada uno si faltan los horarios necesarios.
 */
export function tiemposHoja(h) {
  const ida = difRollover(h.salidaPlanta, h.llegadaDestino);
  const vuelta = difRollover(h.salidaDestino, h.llegadaPlanta);
  const geo = difRollover(h.llegadaDestino, h.salidaDestino);
  const fuera = difRollover(h.salidaPlanta, h.llegadaPlanta);
  const viaje = ida != null || vuelta != null ? (ida || 0) + (vuelta || 0) : null;
  return { minViaje: viaje, minGeozona: geo, minFuera: fuera };
}
