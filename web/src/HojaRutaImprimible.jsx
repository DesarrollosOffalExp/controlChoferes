import { fmtHs, tiemposHoja } from './utils.js';

// Hoja de ruta imprimible (A4) con el membrete oficial de Offal (formato REG) + logo.
// Se muestra como overlay; "Imprimir" usa window.print() y el @media print aísla la hoja.

const toMin = (s) => { const m = /^(\d{2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };

function Hora({ t, base }) {
  if (!t) return <>—</>;
  const otroDia = base && toMin(t) != null && toMin(base) != null && toMin(t) < toMin(base);
  return <>{t}{otroDia && <span className="nd">+1d</span>}</>;
}

export default function HojaRutaImprimible({ hoja, onClose }) {
  const h = hoja || {};
  const { viaje, geozona, ida, vuelta } = tiemposHoja(h);
  const fuera = (() => {
    const a = toMin(h.salidaPlanta), b = toMin(h.llegadaPlanta);
    if (a == null || b == null) return null;
    let d = b - a; if (d < 0) d += 1440; return d;
  })();
  const dash = (x) => (x == null || x === '' ? '—' : x);

  return (
    <div className="hr-print-overlay" role="dialog" aria-label="Hoja de ruta imprimible">
      <div className="hr-print-toolbar">
        <span>Vista de impresión — Hoja de Ruta</span>
        <div className="hr-print-actions">
          <button className="hr-btn ghost" onClick={onClose}>Cerrar</button>
          <button className="hr-btn" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
        </div>
      </div>

      <div className="hr-sheet">
        <div className="hr-membrete">
          <div className="hr-mb-cell hr-mb-left">
            <img className="hr-mb-logo" src="/favicon.png" alt="Offal Exp S.A." />
            <div className="hr-mb-emp"><b>OFFAL EXP S.A.</b><span>Establecimiento N.º Oficial 4407</span></div>
          </div>
          <div className="hr-mb-cell hr-mb-center">
            <div className="hr-mb-sis">Sistema de Gestión de Calidad e Inocuidad</div>
            <div className="hr-mb-tit">Hoja de Ruta — Transporte</div>
          </div>
          <div className="hr-mb-cell hr-mb-right">
            <div><span className="hr-k">Fecha HR:</span> <b>{dash(h.fecha)}</b></div>
            <div><span className="hr-k">N.º Remito:</span> {dash(h.numeroRemito)}</div>
            <div><span className="hr-k">Página:</span> 1 de 1</div>
          </div>
        </div>

        <div className="hr-sec">
          <div className="hr-band">Datos del viaje</div>
          <div className="hr-grid c2">
            <div className="hr-field"><div className="hr-k">Chofer</div><div className="hr-v big">{dash(h.choferNombre || h.choferDni)}</div></div>
            <div className="hr-field"><div className="hr-k">Patente Tractor</div><div className="hr-v big">{dash(h.patenteTractor)}</div></div>
            <div className="hr-field"><div className="hr-k">Destino</div><div className="hr-v big">{dash(h.destino)}</div></div>
            <div className="hr-field"><div className="hr-k">&nbsp;</div><div className="hr-v">&nbsp;</div></div>
            <div className="hr-field"><div className="hr-k">Semi Lleva</div><div className="hr-v">{dash(h.semiLleva)}</div></div>
            <div className="hr-field"><div className="hr-k">Semi Trae</div><div className="hr-v">{dash(h.semi)}</div></div>
          </div>
        </div>

        <div className="hr-sec">
          <div className="hr-band">Detalle de carga</div>
          <div className="hr-grid c5">
            <div className="hr-field"><div className="hr-k">Hielo</div><div className="hr-v">{dash(h.hielo)}</div></div>
            <div className="hr-field"><div className="hr-k">Tambor</div><div className="hr-v">{dash(h.tambor)}</div></div>
            <div className="hr-field"><div className="hr-k">Pallets</div><div className="hr-v">{dash(h.pallets)}</div></div>
            <div className="hr-field"><div className="hr-k">Agua Oxigenada</div><div className="hr-v">{dash(h.aguaOxigenada)}</div></div>
            <div className="hr-field"><div className="hr-k">Tambor Hiel</div><div className="hr-v">{dash(h.tamborHiel)}</div></div>
          </div>
        </div>

        <div className="hr-sec">
          <div className="hr-band">Horarios del viaje</div>
          <div className="hr-horarios">
            <div className="hr-timeline">
              <div className="hr-stop"><div className="hr-dot"></div><div className="hr-lbl">Salida Planta<br/>(Vigilancia)</div><div className="hr-time"><Hora t={h.salidaPlanta} /></div></div>
              <div className="hr-leg viaje"><div className="hr-bar"></div><div className="hr-leg-lbl">Viaje ida</div><div className="hr-leg-dur">{fmtHs(ida)}</div></div>
              <div className="hr-stop"><div className="hr-dot"></div><div className="hr-lbl">Llegada Destino<br/>(Chofer)</div><div className="hr-time"><Hora t={h.llegadaDestino} base={h.salidaPlanta} /></div></div>
              <div className="hr-leg zona"><div className="hr-bar"></div><div className="hr-leg-lbl">En geozona</div><div className="hr-leg-dur">{fmtHs(geozona)}</div></div>
              <div className="hr-stop"><div className="hr-dot"></div><div className="hr-lbl">Salida Destino<br/>(Chofer)</div><div className="hr-time"><Hora t={h.salidaDestino} base={h.salidaPlanta} /></div></div>
              <div className="hr-leg viaje"><div className="hr-bar"></div><div className="hr-leg-lbl">Viaje vuelta</div><div className="hr-leg-dur">{fmtHs(vuelta)}</div></div>
              <div className="hr-stop"><div className="hr-dot"></div><div className="hr-lbl">Llegada Planta<br/>(Vigilancia)</div><div className="hr-time"><Hora t={h.llegadaPlanta} base={h.salidaPlanta} /></div></div>
            </div>
            <div className="hr-metrics">
              <div className="hr-metric"><div className="hr-m-lbl">Hs en viaje</div><div className="hr-m-val">{fmtHs(viaje)}</div><div className="hr-m-src">ida + vuelta</div></div>
              <div className="hr-metric zona"><div className="hr-m-lbl">Hs en geozona</div><div className="hr-m-val">{fmtHs(geozona)}</div><div className="hr-m-src">en el destino</div></div>
              <div className="hr-metric"><div className="hr-m-lbl">Fuera de planta</div><div className="hr-m-val">{fmtHs(fuera)}</div><div className="hr-m-src">viaje completo</div></div>
            </div>
          </div>
        </div>

        <div className="hr-firmas">
          <div className="hr-firma"><div className="hr-line"></div><div className="hr-rol">Supervisor Logística</div></div>
          <div className="hr-firma"><div className="hr-line"></div><div className="hr-rol">Responsable Taller</div></div>
        </div>
      </div>
    </div>
  );
}
