import { useEffect, useState } from 'react';
import { hoyISO } from './utils.js';
import HojaRutaImprimible from './HojaRutaImprimible.jsx';

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
  const [patentes, setPatentes] = useState([]);      // catálogo de Lavado de Camiones
  const [frigorificos, setFrigorificos] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState(null); // { tipo:'ok'|'error', texto }
  const [hojas, setHojas] = useState([]);
  const [imprimir, setImprimir] = useState(null); // hoja a mostrar en vista de impresión

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
    fetch('/api/lavados/patentes')
      .then((r) => (r.ok ? r.json() : { patentes: [] }))
      .then((d) => setPatentes(d.patentes || []))
      .catch(() => setPatentes([]));
    fetch('/api/lavados/frigorificos')
      .then((r) => (r.ok ? r.json() : { frigorificos: [] }))
      .then((d) => setFrigorificos(d.frigorificos || []))
      .catch(() => setFrigorificos([]));
    cargarHojas();
  }, []);

  // Filtra el catálogo por tipo de unidad (texto libre). Si el filtro queda vacío
  // (TipoUnidad no cargado), cae a mostrar TODAS las patentes.
  const porTipo = (re) => {
    const f = patentes.filter((p) => re.test(p.tipoUnidad || ''));
    return f.length ? f : patentes;
  };
  const tractores = porTipo(/tractor/i);
  const semis = porTipo(/semi|chasis|balanc|batea/i);

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
            <input type="text" list="dl-tractores" value={form.patenteTractor}
              onChange={set('patenteTractor')} placeholder="AB123CD" required />
          </label>
          <label className="hr-ancho">
            <span>Destino</span>
            <input type="text" list="dl-destinos" value={form.destino} onChange={set('destino')} />
          </label>
          <label>
            <span>Semi Lleva</span>
            <input type="text" list="dl-semis" value={form.semiLleva} onChange={set('semiLleva')} />
          </label>
          <label>
            <span>Semi Trae</span>
            <input type="text" list="dl-semis" value={form.semi} onChange={set('semi')} />
          </label>
          {NUMS.map(([k, etiqueta]) => (
            <label key={k}>
              <span>{etiqueta}</span>
              <input type="number" min="0" value={form[k]} onChange={set(k)} />
            </label>
          ))}

          {/* Los HORARIOS no se cargan acá: se completan a lapicera en la hoja impresa
              (Vigilancia la planta, Chofer el destino) y para el reporte salen de Navixy. */}

          {/* Opciones de los desplegables (reusadas de Lavado de Camiones).
              Son combobox: se elige de la lista o se tipea si no está.
              Se muestra SOLO la patente (sin repetir el tipo de unidad). */}
          <datalist id="dl-tractores">
            {tractores.map((p) => (
              <option key={p.codigo} value={p.codigo} />
            ))}
          </datalist>
          <datalist id="dl-semis">
            {semis.map((p) => (
              <option key={p.codigo} value={p.codigo} />
            ))}
          </datalist>
          <datalist id="dl-destinos">
            {frigorificos.map((f) => (
              <option key={f.nombre} value={f.nombre} />
            ))}
          </datalist>

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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {hojas.length === 0 && (
                <tr><td colSpan={11} className="vacio">Sin hojas de ruta cargadas.</td></tr>
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
                  <td><button className="btn-print" onClick={() => setImprimir(h)}>🖨 Imprimir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {imprimir && <HojaRutaImprimible hoja={imprimir} onClose={() => setImprimir(null)} />}
    </>
  );
}
