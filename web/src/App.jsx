import { useEffect, useState } from 'react';
import { iniciales } from './utils.js';
import Reportes from './Reportes.jsx';
import HojaRuta from './HojaRuta.jsx';

// Portal / índice general de Offal (el logo y el botón Inicio llevan ahí).
const PORTAL_URL = 'https://offal-hsb3c0gebjgbfmae.eastus-01.azurewebsites.net';

export default function App() {
  const [vista, setVista] = useState('reportes'); // 'reportes' | 'hojaruta'
  const [user, setUser] = useState(null); // usuario autenticado (Easy Auth)

  useEffect(() => {
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
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <a href={PORTAL_URL} className="brand" title="Ir al inicio de Offal">
          <span className="brand-logo-circle">
            <img src="/favicon.png" alt="Offal" />
          </span>
          <span className="brand-txt">
            <span className="brand-title">Registro de Choferes</span>
            <span className="brand-sub">Logística — planta, viajes y hoja de ruta</span>
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
        {/* Pestañas de vista (fuera de la navbar unificada) */}
        <div className="tabs" role="tablist" aria-label="Vista">
          <button
            className={'tab' + (vista === 'reportes' ? ' activo' : '')}
            role="tab" aria-selected={vista === 'reportes'}
            onClick={() => setVista('reportes')}
          >
            Reportes
          </button>
          <button
            className={'tab' + (vista === 'hojaruta' ? ' activo' : '')}
            role="tab" aria-selected={vista === 'hojaruta'}
            onClick={() => setVista('hojaruta')}
          >
            Hoja de Ruta
          </button>
        </div>

        {vista === 'reportes' ? <Reportes /> : <HojaRuta />}
      </main>
    </div>
  );
}
