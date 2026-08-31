// Tiempo DENTRO del perímetro (planta) por día calendario, usando los molinetes
// reales de Hikvision (Dispositivo = 'Facial Entrada' / 'Facial Salida').
//
// Por qué así (y no MIN/MAX del día): los choferes SALEN de viaje y VUELVEN, con la
// jornada cruzando la medianoche. Tomar la primera/última marca del día calendario
// invierte entrada/salida (la 1ª marca suele ser una SALIDA y la última una ENTRADA)
// y cuenta el viaje como si fuera tiempo en planta. Con la dirección real del molinete
// reconstruimos los tramos dentro/fuera y medimos las horas DENTRO en [00:00, fin].

const TZ_OFFSET_MIN = 180; // Argentina = UTC-3

/** "Ahora" en horario de Argentina: { fecha:'YYYY-MM-DD', min: minutos desde 00:00 }. */
export function ahoraArg() {
  const d = new Date(Date.now() - TZ_OFFSET_MIN * 60000);
  return { fecha: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

// 'YYYY-MM-DD HH:MM:SS' (hora local) -> minutos respecto de la medianoche de `fecha`
// (negativo si la marca es de un día anterior). Se calcula en UTC para no depender de TZ.
function offMin(ts, fecha) {
  const base = Date.parse(`${fecha}T00:00:00Z`);
  return (Date.parse(`${ts.replace(' ', 'T')}Z`) - base) / 60000;
}

/**
 * @param marks  [{ ts:'YYYY-MM-DD HH:MM:SS', dir:'in'|'out' }] — incluir días previos
 *               para conocer el estado en 00:00 (dentro/fuera).
 * @param fecha  'YYYY-MM-DD'
 * @param finMin minuto del día donde cortar (1440 para días pasados; hora actual si es hoy)
 * @returns { minutosEnPlanta, minutosFuera, ingreso, egreso } | null (sin datos)
 */
export function enPlantaDia(marks, fecha, finMin = 1440) {
  if (!marks || marks.length === 0) return null;
  const evs = marks
    .map((m) => ({ min: offMin(m.ts, fecha), dir: m.dir, ts: m.ts }))
    .sort((a, b) => a.min - b.min);

  // Estado en 00:00: según el último evento ANTERIOR al día.
  let state = null;
  for (const e of evs) {
    if (e.min < 0) state = e.dir === 'in' ? 'inside' : 'outside';
    else break;
  }

  const dayEvs = evs.filter((e) => e.min >= 0 && e.min <= finMin);
  if (state === null && dayEvs.length === 0) return null; // sin info útil para el día

  // Sin contexto previo: inferir del primer evento del día. Si lo primero que hace es
  // SALIR, venía de adentro; si ENTRA, venía de afuera.
  if (state === null) state = dayEvs[0].dir === 'in' ? 'outside' : 'inside';

  let cursor = 0;
  let inside = 0;
  for (const e of dayEvs) {
    if (state === 'inside') inside += e.min - cursor;
    state = e.dir === 'in' ? 'inside' : 'outside';
    cursor = e.min;
  }
  if (state === 'inside') inside += finMin - cursor; // sigue dentro hasta el corte

  inside = Math.max(0, Math.round(inside));
  const fuera = Math.max(0, Math.round(finMin - inside));

  const hhmm = (ts) => ts.slice(11, 16);
  const ins = dayEvs.filter((e) => e.dir === 'in');
  const out = dayEvs.filter((e) => e.dir === 'out');
  return {
    minutosEnPlanta: inside,
    minutosFuera: fuera,
    ingreso: ins.length ? hhmm(ins[0].ts) : null,     // 1er ingreso real del día
    egreso: out.length ? hhmm(out[out.length - 1].ts) : null, // último egreso real del día
  };
}
