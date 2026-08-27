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
