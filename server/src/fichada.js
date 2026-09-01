// Entrada/Salida de la JORNADA por día, usando los molinetes reales de Hikvision
// (Dispositivo = 'Facial Entrada' / 'Facial Salida').
//
// La jornada se imputa al día en que ENTRA (arranca). El turno noche entra a la
// tarde (~18h) y sale al día siguiente a la madrugada, así que la Salida se busca
// DESPUÉS de la entrada (puede caer al día siguiente). No se corta por día calendario
// (eso partía la jornada y mostraba entrada=salida, ej. Lezcano 31/08 = 18:57 y 18:57).

const TZ_OFFSET_MIN = 180; // Argentina = UTC-3
const MAX_JORNADA_MIN = 18 * 60; // tope de una jornada (turno + viajes) para acotar la salida

/** "Ahora" en horario de Argentina: { fecha:'YYYY-MM-DD', min: minutos desde 00:00 }. */
export function ahoraArg() {
  const d = new Date(Date.now() - TZ_OFFSET_MIN * 60000);
  return { fecha: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

const epoch = (ts) => Date.parse(`${ts.replace(' ', 'T')}Z`); // 'YYYY-MM-DD HH:MM:SS' (hora local)

/**
 * @param marks [{ ts:'YYYY-MM-DD HH:MM:SS', dir:'in'|'out' }] — ventana que incluye
 *              el día `fecha` y el siguiente (la salida del turno noche cae al otro día).
 * @param fecha 'YYYY-MM-DD'
 * @returns { entrada:{hora,dia}, salida:{hora,dia,otroDia}|null } | null (no inició jornada ese día)
 */
export function jornadaDia(marks, fecha) {
  if (!marks || marks.length === 0) return null;
  const evs = marks
    .map((m) => ({ t: epoch(m.ts), dir: m.dir, ts: m.ts }))
    .sort((a, b) => a.t - b.t);

  // Entrada = primer ingreso (Facial Entrada) cuyo día calendario es `fecha`.
  const entrada = evs.find((e) => e.dir === 'in' && e.ts.slice(0, 10) === fecha);
  if (!entrada) return null; // no arrancó jornada ese día (p. ej. sólo tiene la salida del turno anterior)

  // Salida = última salida (Facial Salida) posterior a la entrada, dentro del tope de jornada.
  const limite = entrada.t + MAX_JORNADA_MIN * 60000;
  let salida = null;
  for (const e of evs) {
    if (e.dir === 'out' && e.t > entrada.t && e.t <= limite) salida = e;
  }

  const hhmm = (ts) => ts.slice(11, 16);
  return {
    entrada: { hora: hhmm(entrada.ts), dia: entrada.ts.slice(0, 10) },
    salida: salida
      ? { hora: hhmm(salida.ts), dia: salida.ts.slice(0, 10), otroDia: salida.ts.slice(0, 10) !== fecha }
      : null,
  };
}
