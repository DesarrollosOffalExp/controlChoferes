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
  const [cob, setCob] = useState(null); // cobertura de choferes en LSGPS (Navixy)

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
    fetch('/api/navixy/cobertura')
      .then((r) => (r.ok ? r.json() : null))
      .then(setCob)
      .catch(() => setCob(null));
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
        <b>Entrada / Salida</b> = jornada del chofer, con los molinetes reales
        (<i>Facial Entrada</i>/<i>Facial Salida</i>). La jornada se imputa al día que <b>entra</b>;
        en el turno noche entra a la tarde y la salida cae al día siguiente (marcada <b>+1d</b>).
        Las horas <i>en planta</i> quedan pendientes hasta validar entrada/salida.
      </div>

      {cob && cob.conVehiculo < cob.total && (
        <div className="aviso lsgps">
          <b>⚠ Nota LSGPS:</b> {cob.conVehiculo} de {cob.total} choferes tienen vehículo asignado en
          Navixy. El cruce usa la <b>patente de la hoja de ruta</b> (no hace falta el chofer en
          Navixy), pero la patente sí debe existir como vehículo en LSGPS.
        </div>
      )}

      <section className="card">
        {error && <p className="error">Error: {error}</p>}
        {!error && (
          <div className="tabla-scroll">
            <table className="grilla">
              <thead>
                <tr>
                  <th>Chofer</th>
                  <th>DNI</th>
                  <th>Patente (hoja)</th>
                  <th className="num">Entrada</th>
                  <th className="num">Salida</th>
                  <th className="num">Hs en viaje (GPS)</th>
                  <th>Destino (hoja)</th>
                  <th>Destino (GPS)</th>
                </tr>
              </thead>
              <tbody>
                {choferes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="vacio">
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
                    <td className={'num' + (c.minutosViaje == null ? ' pend' : '')}>
                      {fmtHs(c.minutosViaje)}
                    </td>
                    <td>{c.destinoHoja ?? '—'}</td>
                    <td className={c.destinoGps == null ? 'pend' : ''}>{c.destinoGps ?? '—'}</td>
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
