export function hoyISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtHs(min) {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function soloHora(s) {
  // "14/08/2026 06:19:00" -> "06:19"
  if (!s) return '—';
  const m = s.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : s;
}

export function iniciales(nombre) {
  const n = (nombre || '').trim();
  if (!n) return '?';
  const p = n.split(/[\s,._]+/).filter(Boolean);
  return (p.length >= 2 ? p[0][0] + p[1][0] : n.slice(0, 2)).toUpperCase();
}

// Minutos de 'HH:MM' a 'HH:MM' con rollover (b puede caer al día siguiente).
export function difRollover(a, b) {
  const pa = /^(\d{2}):(\d{2})$/.exec(a || '');
  const pb = /^(\d{2}):(\d{2})$/.exec(b || '');
  if (!pa || !pb) return null;
  let d = (+pb[1] * 60 + +pb[2]) - (+pa[1] * 60 + +pa[2]);
  if (d < 0) d += 1440;
  return d;
}

// Tiempos de una hoja (un viaje) a partir de sus 4 horarios.
export function tiemposHoja(h) {
  const ida = difRollover(h.salidaPlanta, h.llegadaDestino);
  const vuelta = difRollover(h.salidaDestino, h.llegadaPlanta);
  const geozona = difRollover(h.llegadaDestino, h.salidaDestino);
  const viaje = ida != null || vuelta != null ? (ida || 0) + (vuelta || 0) : null;
  return { ida, vuelta, viaje, geozona };
}
