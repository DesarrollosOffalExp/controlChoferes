import { useEffect, useState } from 'react';
import { hoyISO, fmtHs } from './utils.js';

// Hora de entrada/salida de la jornada. Si la salida cae al día siguiente
// (turno noche), se marca con un "+1d".
function Hora({ m }) {
  if (!m) return '—';
  return (
    <>
      {m.hora}
      {m.otroDia && <span className="mas1d" title={`Día siguiente (${m.dia})`}>+1d</span>}
    </>
  );
}

// Tablero: entrada/salida de la jornada (fichada por molinete) + destino/viaje (LSGPS por patente).
export default function Reportes() {
  const [fecha, setFecha] = useState(hoyISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function cargar(f) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/presencia?fecha=${f}`);
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar(fecha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choferes = data?.choferes ?? [];
  const conJornada = choferes.filter((c) => c.entrada).length;
  const conHoja = choferes.filter((c) => c.patente).length;

  return (
    <>
      <section className="card filtros">
        <label>
          <span>Fecha</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <button className="btn" onClick={() => cargar(fecha)} disabled={loading}>
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
        <div className="stats">
          <div className="stat">
            <span className="n">{choferes.length}</span>
            <span className="l">Choferes</span>
          </div>
          <div className="stat">
            <span className="n">{conJornada}</span>
            <span className="l">Con jornada</span>
          </div>
          <div className="stat">
            <span className="n">{conHoja}</span>
            <span className="l">Con hoja de ruta</span>
          </div>
        </div>
      </section>

      <div className="aviso">
        <b>Entrada / Salida</b> salen de la fichada (molinetes reales); la jornada se imputa al día que
        <b> entra</b> (turno noche: sale al día siguiente, marcado <b>+1d</b>). <b>Hs en viaje</b> y
        <b> Hs en geozona</b> se calculan con los <b>horarios</b> cargados en la Hoja de Ruta;
        <b> Hs en planta</b> = jornada − viaje. Donde falta la hoja o los horarios, va "—".
      </div>

      <section className="card">
        {error && <p className="error">Error: {error}</p>}
        {!error && (
          <div className="tabla-scroll">
            <table className="grilla">
              <thead>
                <tr>
                  <th>Chofer</th>
                  <th>DNI</th>
                  <th>Patente</th>
                  <th className="num">Entrada</th>
                  <th className="num">Salida</th>
                  <th className="num">Hs en planta</th>
                  <th className="num">Hs en viaje</th>
                  <th className="num">Hs en geozona</th>
                  <th>Destino</th>
                </tr>
              </thead>
              <tbody>
                {choferes.length === 0 && (
                  <tr>
                    <td colSpan={9} className="vacio">
                      {loading ? 'Cargando…' : 'Sin datos para esta fecha.'}
                    </td>
                  </tr>
                )}
                {choferes.map((c) => (
                  <tr key={c.dni}>
                    <td>{c.chofer}</td>
                    <td className="mono">{c.dni}</td>
                    <td className="mono">{c.patente ?? '—'}</td>
                    <td className={'num' + (c.entrada ? '' : ' pend')}><Hora m={c.entrada} /></td>
                    <td className={'num' + (c.salida ? '' : ' pend')}><Hora m={c.salida} /></td>
                    <td className={'num' + (c.minEnPlanta == null ? ' pend' : '')}><b>{fmtHs(c.minEnPlanta)}</b></td>
                    <td className={'num' + (c.minViaje == null ? ' pend' : '')}>{fmtHs(c.minViaje)}</td>
                    <td className={'num' + (c.minGeozona == null ? ' pend' : '')}>{fmtHs(c.minGeozona)}</td>
                    <td>{c.destino ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
