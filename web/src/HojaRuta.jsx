import { useEffect, useMemo, useState } from 'react';
import { hoyISO } from './utils.js';

const VACIA = {
  fecha: hoyISO(),
  numeroRemito: '',
  choferDni: '',
  patenteTractor: '',
  destino: '',
  semiLleva: '',
  semiIran: '',
  hielo: '',
  tambor: '',
  pallets: '',
  aguaOxigenada: '',
  tamborHiel: '',
};

// Campos numéricos (cantidades) del formulario.
const NUMEROS = [
  ['hielo', 'HIELO'],
  ['tambor', 'TAMBOR'],
  ['pallets', 'PALLETS'],
  ['aguaOxigenada', 'AGUA OXIGENADA'],
  ['tamborHiel', 'TAMBOR DE HIEL'],
];

export default function HojaRuta() {
  const [choferes, setChoferes] = useState([]);
  const [form, setForm] = useState(VACIA);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState(null); // { tipo:'ok'|'error', texto }
  const [hojas, setHojas] = useState([]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    fetch('/api/choferes')
      .then((r) => r.json())
      .then((d) => setChoferes(d.choferes || []))
      .catch(() => setChoferes([]));
    cargarHojas();
  }, []);

  function cargarHojas() {
    // Últimos ~10 días.
    const d = new Date();
    d.setDate(d.getDate() - 10);
    const desde = d.toISOString().slice(0, 10);
    fetch(`/api/hoja-ruta?desde=${desde}`)
      .then((r) => r.json())
      .then((d) => setHojas(d.hojas || []))
      .catch(() => setHojas([]));
  }

  async function guardar(e) {
    e.preventDefault();
    setMsg(null);
    if (!form.fecha || !form.choferDni || !form.patenteTractor.trim()) {
      setMsg({ tipo: 'error', texto: 'Fecha, Chofer y Patente del Tractor son obligatorios.' });
      return;
    }
    setGuardando(true);
    try {
      const chofer = choferes.find((c) => c.dni === form.choferDni);
      const payload = { ...form, choferNombre: chofer?.nombre || null };
      const r = await fetch('/api/hoja-ruta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      setMsg({ tipo: 'ok', texto: 'Hoja de ruta guardada ✔' });
      setForm((f) => ({ ...VACIA, fecha: f.fecha })); // conserva la fecha para cargar varias
      cargarHojas();
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message });
    } finally {
      setGuardando(false);
    }
  }

  const totalHielo = useMemo(
    () => hojas.reduce((a, h) => a + (h.hielo || 0), 0),
    [hojas]
  );

  return (
    <>
      <section className="card">
        <h2 className="card-title">Nueva hoja de ruta</h2>
        <form className="form-hoja" onSubmit={guardar}>
          <div className="form-grid">
            <label>
              <span>Fecha *</span>
              <input type="date" value={form.fecha} onChange={set('fecha')} required />
            </label>
            <label>
              <span>Número de Remito</span>
              <input type="text" value={form.numeroRemito} onChange={set('numeroRemito')} />
            </label>
            <label>
              <span>Chofer *</span>
              <select value={form.choferDni} onChange={set('choferDni')} required>
                <option value="">Seleccionar…</option>
                {choferes.map((c) => (
                  <option key={c.dni} value={c.dni}>{c.nombre}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Patente del Tractor *</span>
              <input
                type="text"
                value={form.patenteTractor}
                onChange={set('patenteTractor')}
                placeholder="AC 555 VI"
                required
              />
            </label>
            <label>
              <span>Destino</span>
              <input type="text" value={form.destino} onChange={set('destino')} />
            </label>
            <label>
              <span>Semi Lleva</span>
              <input type="text" value={form.semiLleva} onChange={set('semiLleva')} />
            </label>
            <label>
              <span>Semi Iran</span>
              <input type="text" value={form.semiIran} onChange={set('semiIran')} />
            </label>
            {NUMEROS.map(([k, label]) => (
              <label key={k}>
                <span>{label}</span>
                <input type="number" min="0" value={form[k]} onChange={set(k)} />
              </label>
            ))}
          </div>

          <div className="form-acciones">
            <button className="btn" type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar hoja de ruta'}
            </button>
            {msg && <span className={msg.tipo === 'ok' ? 'msg-ok' : 'error'}>{msg.texto}</span>}
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="card-title">
          Últimas hojas <span className="card-sub">({hojas.length} — HIELO acumulado: {totalHielo})</span>
        </h2>
        <div className="tabla-scroll">
          <table className="grilla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Remito</th>
                <th>Chofer</th>
                <th>Patente</th>
                <th>Destino</th>
                <th>Semi Lleva</th>
                <th>Semi Iran</th>
                <th className="num">Hielo</th>
                <th className="num">Tambor</th>
                <th className="num">Pallets</th>
                <th className="num">Agua Ox.</th>
                <th className="num">T. Hiel</th>
              </tr>
            </thead>
            <tbody>
              {hojas.length === 0 && (
                <tr><td colSpan={12} className="vacio">Sin hojas de ruta cargadas.</td></tr>
              )}
              {hojas.map((h) => (
                <tr key={h.id}>
                  <td className="mono">{h.fecha}</td>
                  <td>{h.numeroRemito ?? '—'}</td>
                  <td>{h.choferNombre ?? h.choferDni}</td>
                  <td className="mono">{h.patenteTractor}</td>
                  <td>{h.destino ?? '—'}</td>
                  <td>{h.semiLleva ?? '—'}</td>
                  <td>{h.semiIran ?? '—'}</td>
                  <td className="num">{h.hielo ?? '—'}</td>
                  <td className="num">{h.tambor ?? '—'}</td>
                  <td className="num">{h.pallets ?? '—'}</td>
                  <td className="num">{h.aguaOxigenada ?? '—'}</td>
                  <td className="num">{h.tamborHiel ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
