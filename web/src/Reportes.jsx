import { useEffect, useState } from 'react';
import { hoyISO, fmtHs, soloHora } from './utils.js';

// Tablero: fichada (presencia) + tiempo en viaje (cruce Hoja de Ruta ↔ LSGPS por patente).
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
  const totalPresente = choferes.reduce((a, c) => a + (c.minutosPresente || 0), 0);
  const conFichada = choferes.filter((c) => c.minutosPresente > 0).length;
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
            <span className="n">{conFichada}</span>
            <span className="l">Con fichada</span>
          </div>
          <div className="stat">
            <span className="n">{conHoja}</span>
            <span className="l">Con hoja de ruta</span>
          </div>
          <div className="stat">
            <span className="n">{fmtHs(totalPresente)}</span>
            <span className="l">Hs presente (total)</span>
          </div>
        </div>
      </section>

      {conHoja === 0 && (
        <div className="aviso">
          <b>Sin hojas de ruta cargadas</b> para esta fecha. El <i>tiempo en viaje</i> se calcula a
          partir de la patente que cargás en la pestaña <b>Hoja de Ruta</b>; sin hoja, solo se
          muestra la fichada.
        </div>
      )}

      {cob && cob.conVehiculo < cob.total && (
        <div className="aviso lsgps">
          <b>⚠ Nota LSGPS:</b> {cob.conVehiculo} de {cob.total} choferes tienen vehículo asignado en
          Navixy. El cruce ahora usa la <b>patente de la hoja de ruta</b> (no hace falta el chofer en
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
                  <th className="num">Hs presente</th>
                  <th className="num">Hs en viaje</th>
                  <th className="num">Hs en Offal sin viaje</th>
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
                    <td className="num">{soloHora(c.entrada)}</td>
                    <td className="num">{soloHora(c.salida)}</td>
                    <td className="num"><b>{fmtHs(c.minutosPresente)}</b></td>
                    <td className={'num' + (c.minutosViaje == null ? ' pend' : '')}>
                      {fmtHs(c.minutosViaje)}
                    </td>
                    <td className={'num' + (c.minutosSinViaje == null ? ' pend' : '')}>
                      {fmtHs(c.minutosSinViaje)}
                    </td>
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
