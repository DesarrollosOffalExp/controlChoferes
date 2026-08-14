# Registro de Choferes (Offal)

Módulo para **Logística**: tablero que muestra cuánto tiempo están los choferes en la
planta **sin viaje** = **horas fichadas (presencia) − horas en viaje (LSGPS)**.

Read-only: el usuario no carga nada, solo consulta.

## Stack

- **Backend:** Node + Express + `mssql` (solo lectura de SQL Server). Carpeta `server/`.
- **Frontend:** React + Vite. Carpeta `web/`.
- Identidad visual: paleta del portal Offal (teal + rojo) + Inter.

## Fuentes de datos (server GPS · 192.168.1.5)

- **Presencia / fichada:** `IntercambioDB062.dbo.DwJornadas` (entrada/salida por legajo y día).
- **Puente Legajo → DNI:** `IntercambioDB062.dbo.DWPresentes` (`Legajo` ↔ `Identificacion`).
- **Viajes (pendiente):** `apiLGPS.tracker.viajes` / `TwinsDBQuatro171_001.expedicion.*` —
  falta definir con LSGPS cómo se atribuye cada viaje a su chofer.

## Estado

- ✅ **Presencia por chofer y día** funcionando (columna *Hs presente*).
- ⏳ **Hs en viaje** y **Hs en Offal sin viaje**: pendientes hasta cerrar el enganche viaje↔chofer.
- La lista de choferes está en `server/src/choferes.js` (sembrada con los de LSGPS;
  reemplazar por la lista oficial de RRHH/Logística cuando llegue).

## Correr en local

1. Backend:
   ```bash
   cd server
   cp .env.example .env      # completar credenciales SQL del 192.168.1.5
   npm install
   npm run dev               # http://localhost:4610
   ```
2. Frontend (en otra terminal):
   ```bash
   cd web
   npm install
   npm run dev               # http://localhost:4611  (proxya /api al backend)
   ```

## Endpoints

- `GET /api/health`
- `GET /api/choferes` — DNIs configurados.
- `GET /api/presencia?fecha=YYYY-MM-DD` — presencia (fichada) de los choferes ese día.

## Pendiente para cerrar el cálculo

Definir con LSGPS/Twins: **¿cómo se sabe qué chofer hizo cada viaje y su duración?**
(¿`tracker.viajes` + algún join, o el modelo de expedición de Twins
`ViajesInterfaz` / `RegistroCamiones_Choferes` / `Persona_ID`? ¿`Persona_ID` → DNI?).
Con eso se completa `minutosViaje` y `minutosSinViaje` en `server/src/index.js`.
