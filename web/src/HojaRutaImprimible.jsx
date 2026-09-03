// Hoja de ruta imprimible (A4) con el membrete oficial de Offal (formato REG) + logo.
// Los HORARIOS van en BLANCO: los completan a lapicera Vigilancia (planta) y el
// Chofer (destino). Se muestra como overlay; "Imprimir" usa window.print().

export default function HojaRutaImprimible({ hoja, onClose }) {
  const h = hoja || {};
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
          <div className="hr-band">Horarios del viaje — <span className="hr-band-note">a completar en el momento</span></div>
          <div className="hr-horas">
            <div className="hr-hgroup">
              <div className="hr-hgroup-t">Completa Vigilancia</div>
              <div className="hr-hrow"><span className="hr-hlbl">Salida de Planta</span><span className="hr-hbox"></span></div>
              <div className="hr-hrow"><span className="hr-hlbl">Regreso a Planta</span><span className="hr-hbox"></span></div>
            </div>
            <div className="hr-hgroup">
              <div className="hr-hgroup-t">Completa el Chofer</div>
              <div className="hr-hrow"><span className="hr-hlbl">Llegada al Destino</span><span className="hr-hbox"></span></div>
              <div className="hr-hrow"><span className="hr-hlbl">Salida del Destino</span><span className="hr-hbox"></span></div>
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
