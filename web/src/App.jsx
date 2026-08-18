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

// Portal / índice general de Offal (el logo y el botón Inicio llevan ahí).
const PORTAL_URL = 'https://offal-hsb3c0gebjgbfmae.eastus-01.azurewebsites.net';

function iniciales(nombre) {
  const n = (nombre || '').trim();
  if (!n) return '?';
  const p = n.split(/[\s,._]+/).filter(Boolean);
  return (p.length >= 2 ? p[0][0] + p[1][0] : n.slice(0, 2)).toUpperCase();
}

export default function App() {
  const [fecha, setFecha] = useState(hoyISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cob, setCob] = useState(null); // cobertura de choferes en LSGPS (Navixy)
  const [user, setUser] = useState(null); // usuario autenticado (Easy Auth)

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
    // Usuario autenticado (Easy Auth / Entra). En local no existe → se ignora.
    fetch('/.auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const claims = d?.[0]?.user_claims || [];
        const name =
          claims.find((c) => c.typ === 'name')?.val ||
          claims.find((c) => c.typ?.endsWith('/givenname'))?.val ||
          d?.[0]?.user_id ||
          null;
        setUser(name);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choferes = data?.choferes ?? [];
  const totalPresente = choferes.reduce((a, c) => a + (c.minutosPresente || 0), 0);
  const conFichada = choferes.filter((c) => c.minutosPresente > 0).length;

  return (
    <div className="app">
      <header className="topbar">
        <a href={PORTAL_URL} className="brand" title="Ir al inicio de Offal">
          <span className="brand-logo-circle">
            <img src="/favicon.png" alt="Offal" />
          </span>
          <span className="brand-txt">
            <span className="brand-title">Registro de Choferes</span>
            <span className="brand-sub">Logística — tiempo en planta vs. viaje</span>
          </span>
        </a>
        <div className="userbox">
          <a href={PORTAL_URL} className="navlink navlink-ico" title="Ir al inicio de Offal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>Inicio</span>
          </a>
          {user && (
            <>
              <span className="userchip">
                <span className="avatar">{iniciales(user)}</span>
                <span className="user-nombre">{user}</span>
              </span>
              <a className="btn-logout" href="/.auth/logout?post_logout_redirect_uri=/" title="Cerrar sesión">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </a>
            </>
          )}
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
