import { useEffect, useState } from 'react';

function hoyISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtHs(min) {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function soloHora(s) {
  // "14/08/2026 06:19:00" -> "06:19"
  if (!s) return '—';
  const m = s.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : s;
}

export default function App() {
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo">O</span>
          <div>
            <div className="brand-title">Offal · Registro de Choferes</div>
            <div className="brand-sub">Logística — tiempo en planta vs. viaje</div>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="card filtros">
          <label>
            <span>Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
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
              <span className="n">{fmtHs(totalPresente)}</span>
              <span className="l">Hs presente (total)</span>
            </div>
          </div>
        </section>

        <div className="aviso">
          <b>En construcción:</b> por ahora se muestra la <b>fichada (presencia)</b> de cada chofer.
          Las columnas <i>Hs en viaje</i> y <i>Hs en Offal sin viaje</i> quedan pendientes hasta
          completar el setup en LSGPS (ver aviso).
        </div>

        {cob && (cob.conVehiculo < cob.total) && (
          <div className="aviso lsgps">
            <b>⚠ Falta completar en LSGPS:</b> {cob.conVehiculo} de {cob.total} choferes con setup
            completo (empleado + vehículo asignado). Faltan <b>{cob.total - cob.conVehiculo}</b> para
            poder calcular el <i>tiempo en viaje</i>.
            <details>
              <summary>Ver qué falta ({cob.total - cob.conVehiculo})</summary>
              <ul className="lsgps-lista">
                {cob.choferes
                  .filter((c) => !c.enNavixy || !c.trackerId)
                  .map((c) => (
                    <li key={c.dni}>
                      <b>{c.chofer}</b> ({c.dni}) —{' '}
                      {!c.enNavixy ? 'no está cargado en LSGPS' : 'sin vehículo asignado'}
                    </li>
                  ))}
              </ul>
            </details>
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
                    <th>Área</th>
                    <th className="num">Entrada</th>
                    <th className="num">Salida</th>
                    <th className="num">Hs presente</th>
                    <th className="num pend">Hs en viaje</th>
                    <th className="num pend">Hs en Offal sin viaje</th>
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
                      <td>{c.area ?? '—'}</td>
                      <td className="num">{soloHora(c.entrada)}</td>
                      <td className="num">{soloHora(c.salida)}</td>
                      <td className="num"><b>{fmtHs(c.minutosPresente)}</b></td>
                      <td className="num pend">{fmtHs(c.minutosViaje)}</td>
                      <td className="num pend">{fmtHs(c.minutosSinViaje)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
