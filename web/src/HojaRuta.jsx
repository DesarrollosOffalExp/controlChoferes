import { useEffect, useState } from 'react';
import { hoyISO } from './utils.js';

const VACIO = {
  fecha: hoyISO(),
  numeroRemito: '',
  choferDni: '',
  patenteTractor: '',
  destino: '',
  semiLleva: '',
  semi: '',
  hielo: '',
  tambor: '',
  pallets: '',
  aguaOxigenada: '',
  tamborHiel: '',
};

// Campos numéricos (cantidades).
const NUMS = [
  ['hielo', 'HIELO'],
  ['tambor', 'TAMBOR'],
  ['pallets', 'PALLETS'],
  ['aguaOxigenada', 'AGUA OXIGENADA'],
  ['tamborHiel', 'TAMBOR DE HIEL'],
];

export default function HojaRuta() {
  const [choferes, setChoferes] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState(null); // { tipo:'ok'|'error', texto }
  const [hojas, setHojas] = useState([]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function cargarHojas() {
    try {
      const r = await fetch('/api/hoja-ruta');
      if (r.ok) setHojas((await r.json()).hojas || []);
    } catch { /* silencioso */ }
  }

  useEffect(() => {
    fetch('/api/choferes')
      .then((r) => (r.ok ? r.json() : { choferes: [] }))
      .then((d) => setChoferes(d.choferes || []))
      .catch(() => setChoferes([]));
    cargarHojas();
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setMsg(null);
    if (!form.fecha || !form.choferDni || !form.patenteTractor) {
      setMsg({ tipo: 'error', texto: 'Fecha, Chofer y Patente del Tractor son obligatorios.' });
      return;
    }
    setGuardando(true);
    try {
      const chofer = choferes.find((c) => c.dni === form.choferDni);
      const body = { ...form, choferNombre: chofer?.nombre || null };
      const r = await fetch('/api/hoja-ruta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      const out = await r.json();
      setMsg({ tipo: 'ok', texto: `Hoja de ruta #${out.id} guardada.` });
      setForm({ ...VACIO, fecha: form.fecha }); // conserva la fecha para carga en tanda
      cargarHojas();
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <section className="card">
        <h2 className="card-titulo">Nueva hoja de ruta</h2>
        <form className="hr-form" onSubmit={guardar}>
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
            <input type="text" value={form.patenteTractor} onChange={set('patenteTractor')}
              placeholder="AB123CD" required />
          </label>
          <label className="hr-ancho">
            <span>Destino</span>
            <input type="text" value={form.destino} onChange={set('destino')} />
          </label>
          <label>
            <span>Semi Lleva</span>
            <input type="text" value={form.semiLleva} onChange={set('semiLleva')} />
          </label>
          <label>
            <span>Semi</span>
            <input type="text" value={form.semi} onChange={set('semi')} />
          </label>
          {NUMS.map(([k, etiqueta]) => (
            <label key={k}>
              <span>{etiqueta}</span>
              <input type="number" min="0" value={form[k]} onChange={set(k)} />
            </label>
          ))}

          <div className="hr-acciones">
            <button className="btn" type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar hoja de ruta'}
            </button>
            {msg && <span className={msg.tipo === 'ok' ? 'hr-ok' : 'error'}>{msg.texto}</span>}
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="card-titulo">Últimas hojas de ruta</h2>
        <div className="tabla-scroll">
          <table className="grilla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Remito</th>
                <th>Chofer</th>
                <th>Patente</th>
                <th>Destino</th>
                <th className="num">Hielo</th>
                <th className="num">Tambor</th>
                <th className="num">Pallets</th>
                <th className="num">Agua Ox.</th>
                <th className="num">T. Hiel</th>
              </tr>
            </thead>
            <tbody>
              {hojas.length === 0 && (
                <tr><td colSpan={10} className="vacio">Sin hojas de ruta cargadas.</td></tr>
              )}
              {hojas.map((h) => (
                <tr key={h.id}>
                  <td className="mono">{h.fecha}</td>
                  <td>{h.numeroRemito ?? '—'}</td>
                  <td>{h.choferNombre ?? h.choferDni}</td>
                  <td className="mono">{h.patenteTractor}</td>
                  <td>{h.destino ?? '—'}</td>
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
