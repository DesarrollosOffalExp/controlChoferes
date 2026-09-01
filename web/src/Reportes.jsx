import { useEffect, useState } from 'react';
import { hoyISO, fmtHs } from './utils.js';

// Marca de perímetro: hora + badge E (entrada) / S (salida).
function Marca({ m }) {
  if (!m) return '—';
  return (
    <>
      {m.hora} <span className={'ces ' + (m.dir === 'E' ? 'e' : 's')}>{m.dir}</span>
    </>
  );
}

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
  const totalEnPlanta = choferes.reduce((a, c) => a + (c.minutosEnPlanta || 0), 0);
  const conFichada = choferes.filter((c) => c.minutosEnPlanta != null).length;
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
            <span className="n">{fmtHs(totalEnPlanta)}</span>
            <span className="l">Hs en planta (total)</span>
          </div>
        </div>
      </section>

      <div className="aviso">
        <b>Hs en planta</b> = tiempo DENTRO del perímetro, con los molinetes reales
        (<i>Facial Entrada</i>/<i>Facial Salida</i>) y manejo del cruce de medianoche.
        Los choferes salen de viaje y vuelven, por eso <b>no</b> se usa la primera/última marca del
        día (invertía entrada/salida en el turno noche). <b>Hs fuera</b> = fuera del perímetro
        (≈ viaje). <b>Hs en viaje (GPS)</b> valida ese "fuera" con LSGPS (patente de la hoja de ruta).
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
                  <th className="num">1ª marca</th>
                  <th className="num">Última marca</th>
                  <th className="num">Hs en planta</th>
                  <th className="num">Hs fuera</th>
                  <th className="num">Hs en viaje (GPS)</th>
                  <th>Destino (hoja)</th>
                  <th>Destino (GPS)</th>
                </tr>
              </thead>
              <tbody>
                {choferes.length === 0 && (
                  <tr>
                    <td colSpan={10} className="vacio">
                      {loading ? 'Cargando…' : 'Sin datos para esta fecha.'}
                    </td>
                  </tr>
                )}
                {choferes.map((c) => (
                  <tr key={c.dni}>
                    <td>{c.chofer}</td>
                    <td className="mono">{c.dni}</td>
                    <td className="mono">{c.patente ?? '—'}</td>
                    <td className="num"><Marca m={c.primera} /></td>
                    <td className="num"><Marca m={c.ultima} /></td>
                    <td className={'num' + (c.minutosEnPlanta == null ? ' pend' : '')}>
                      <b>{fmtHs(c.minutosEnPlanta)}</b>
                    </td>
                    <td className={'num' + (c.minutosFuera == null ? ' pend' : '')}>
                      {fmtHs(c.minutosFuera)}
                    </td>
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
