import { Fragment, useEffect, useState } from 'react';
import { hoyISO, fmtHs } from './utils.js';

// Hora de entrada/salida de la jornada. "+1d" si la salida cae al día siguiente.
function Hora({ m }) {
  if (!m) return '—';
  return (
    <>
      {m.hora}
      {m.otroDia && <span className="mas1d" title={`Día siguiente (${m.dia})`}>+1d</span>}
    </>
  );
}

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
          <div className="stat"><span className="n">{choferes.length}</span><span className="l">Choferes</span></div>
          <div className="stat"><span className="n">{conJornada}</span><span className="l">Con jornada</span></div>
          <div className="stat"><span className="n">{conHoja}</span><span className="l">Con hoja de ruta</span></div>
        </div>
      </section>

      <div className="aviso">
        <b>Jornada total</b> = Facial Entrada → Facial Salida (fichada). <b>Hs en planta / viaje / geozona</b>
        se calculan del GPS (Navixy) por la patente de la hoja, dentro de la jornada. Los viajes se asignan a
        las hojas por orden de hora; un <b>viaje sin hoja</b> se <b>excluye</b> de las horas y se marca con
        <span className="bang"> (!)</span>. Si el chofer tiene varias hojas, se desglosa cada viaje en un renglón.
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
                  <th className="num">Jornada total</th>
                  <th className="num">Hs en planta</th>
                  <th className="num">Hs en viaje</th>
                  <th className="num">Hs en geozona</th>
                  <th>Destino</th>
                  <th style={{ textAlign: 'center' }}>(!)</th>
                </tr>
              </thead>
              <tbody>
                {choferes.length === 0 && (
                  <tr><td colSpan={11} className="vacio">{loading ? 'Cargando…' : 'Sin datos para esta fecha.'}</td></tr>
                )}
                {choferes.map((c) => {
                  const varias = (c.viajes?.length ?? 0) > 1;
                  return (
                    <Fragment key={c.dni}>
                      <tr>
                        <td>{c.chofer}</td>
                        <td className="mono">{c.dni}</td>
                        <td className="mono">{c.patente ?? '—'}</td>
                        <td className={'num' + (c.entrada ? '' : ' pend')}><Hora m={c.entrada} /></td>
                        <td className={'num' + (c.salida ? '' : ' pend')}><Hora m={c.salida} /></td>
                        <td className={'num jt' + (c.jornadaMin == null ? ' pend' : '')}>{fmtHs(c.jornadaMin)}</td>
                        <td className={'num' + (c.minEnPlanta == null ? ' pend' : '')}><b>{fmtHs(c.minEnPlanta)}</b></td>
                        <td className={'num' + (c.minViaje == null ? ' pend' : '')}>{fmtHs(c.minViaje)}</td>
                        <td className={'num' + (c.minGeozona == null ? ' pend' : '')}>{fmtHs(c.minGeozona)}</td>
                        <td>{varias ? <span className="muted">{c.viajes.length} viajes ↓</span> : (c.destino ?? '—')}</td>
                        <td style={{ textAlign: 'center' }}>{c.sinHoja?.length ? <span className="bang">(!)</span> : ''}</td>
                      </tr>

                      {varias && c.viajes.map((v, i) => (
                        <tr className="subrow" key={c.dni + '-v' + i}>
                          <td className="ind">Viaje {i + 1}</td>
                          <td></td><td className="mono">{c.patente ?? ''}</td>
                          <td className="num"></td><td className="num"></td><td className="num"></td>
                          <td className="num"></td>
                          <td className="num">{fmtHs(v.viajeMin)}</td>
                          <td className="num">{fmtHs(v.geozonaMin)}</td>
                          <td>{v.destino ?? '—'}</td><td></td>
                        </tr>
                      ))}

                      {c.sinHoja?.length > 0 && (
                        <tr className="warnrow">
                          <td colSpan={11}>
                            ⚠ <b>Viaje(s) sin hoja de ruta — excluidos de las horas</b> (GPS):
                            {c.sinHoja.map((s, i) => (
                              <span className="zonachip" key={i}>
                                {s.fecha?.slice(8, 10)}/{s.fecha?.slice(5, 7)} · {s.destinos?.join(', ') || 'geozona'} · {s.horaIni}–{s.horaFin}
                              </span>
                            ))}
                            — revisar / cargar la hoja faltante.
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
