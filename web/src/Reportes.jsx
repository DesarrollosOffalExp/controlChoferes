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

      <details className="explica">
        <summary>ℹ️ ¿Cómo se calcula cada columna? (leer)</summary>
        <div className="explica-body">
          <p className="fuentes"><b>Fuentes:</b> <span>Fichada</span> (molinetes faciales, INWEB) ·
            <span>GPS</span> (geocercas de Navixy, por patente) ·
            <span>Hoja de Ruta</span> (vínculo chofer ↔ patente ↔ destino).</p>
          <ul>
            <li><b>Entrada / Salida</b> — primera <i>Facial Entrada</i> y última <i>Facial Salida</i> del molinete.
              La jornada se imputa al día que <b>entra</b>; en turno noche la salida cae al día siguiente (<b>+1d</b>).</li>
            <li><b>Jornada total</b> — Facial Salida − Facial Entrada (el turno completo, de la fichada).</li>
            <li><b>Hs en planta</b> — tiempo del camión <b>dentro de la geocerca OFFAL</b> (GPS), dentro de la jornada.</li>
            <li><b>Hs en viaje</b> — tiempo en <b>ruta</b> (fuera de toda geocerca), solo de los viajes con hoja.</li>
            <li><b>Hs en geozona</b> — tiempo dentro de <b>cualquier</b> geocerca de destino (GPS), de los viajes con hoja.</li>
            <li><b>Hs en destino</b> — de lo anterior, cuánto fue en la geocerca que <b>coincide por nombre</b> con el
              destino de la hoja (ej. hoja «GANADERA SAN ROQUE S.A.» ↔ GPS «GANADERA SAN ROQUE»). Si el nombre no
              coincide, va 0 aunque el GPS marque geozona (el camión fue a otra).</li>
            <li><b>Destino</b> — el cargado en la hoja de ruta (no el nombre del GPS).</li>
          </ul>
          <p><b>Viajes ↔ hojas:</b> los viajes del GPS se asignan a las hojas <b>por orden de hora</b>
            (viaje 1 → hoja 1…). Un viaje del GPS <b>sin hoja</b> se <b>excluye</b> de las horas y se marca con
            <span className="bang"> (!)</span> (con fecha y horario). Por eso, con viajes excluidos,
            planta + viaje + geozona <b>no</b> suma la Jornada total. Si un chofer tiene varias hojas, cada viaje
            se desglosa en un renglón. Todo se cuenta <b>solo dentro del rango Entrada–Salida</b>.</p>
        </div>
      </details>

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
                  <th className="num">Hs en destino</th>
                  <th>Destino</th>
                  <th style={{ textAlign: 'center' }}>(!)</th>
                </tr>
              </thead>
              <tbody>
                {choferes.length === 0 && (
                  <tr><td colSpan={12} className="vacio">{loading ? 'Cargando…' : 'Sin datos para esta fecha.'}</td></tr>
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
                        <td className={'num' + (c.minDestino == null ? ' pend' : '')}>{fmtHs(c.minDestino)}</td>
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
                          <td className="num">{fmtHs(v.destinoMin)}</td>
                          <td>
                            {v.destino ?? '—'}
                            {v.geozonaMin > 0 && v.destinoMin === 0 && v.gpsZonas?.length
                              ? <span className="gpsnote"> · GPS: {v.gpsZonas.join(', ')}</span> : null}
                          </td>
                          <td></td>
                        </tr>
                      ))}

                      {c.sinHoja?.length > 0 && (
                        <tr className="warnrow">
                          <td colSpan={12}>
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
