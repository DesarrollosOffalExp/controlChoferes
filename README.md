# Registro de Choferes (Offal)

Módulo para **Logística** con dos vistas (slider en la barra superior):

- **Reportes** — tablero: cuánto tiempo están los choferes en la planta **sin viaje** =
  **horas fichadas (presencia) − horas en viaje (LSGPS)**.
- **Hoja de Ruta** — formulario que reemplaza el MS Form *"Hoja de Ruta - Transporte"*.
  Ahí se carga, por viaje, la **patente asignada al chofer** (entre otros datos). Esa patente
  es la que después se cruza con LSGPS para calcular el tiempo en planta.

> **Idea clave:** la Hoja de Ruta aporta el vínculo **chofer ↔ patente ↔ fecha** (cargado a
> mano). Con eso, de LSGPS solo tomamos la **patente** — ya **no** hace falta que Navixy tenga
> los choferes cargados como empleados, solo los vehículos/patentes.

## Stack

- **Backend:** Node + Express + `mssql` (solo lectura de SQL Server). Carpeta `server/`.
- **Frontend:** React + Vite. Carpeta `web/`.
- Identidad visual: paleta del portal Offal (teal + rojo) + Inter.

## Fuentes de datos

| Dato | Fuente | Detalle |
|------|--------|---------|
| **Fichada (presencia)** | `FichadasHik.hik.Fichada` — server INWEB **192.168.1.9** | Marcas faciales (entrada/salida) con `DNI` y `FechaHora`. Es la misma "consulta fichadas" que usa RRHH. |
| **Choferes** | `server/src/choferes.js` | Lista oficial (18) con `dni`, `legajo`, `nombre`. |
| **Hoja de Ruta** | `transporte.HojasRuta` — Azure SQL **controletiquetas** | La cargan en la app (pestaña Hoja de Ruta). Aporta la **patente** por chofer y fecha. Ver `docs/hoja-ruta-sql.sql`. |
| **Viaje / geocercas** | API LSGPS (Navixy) `https://napi.lsgps.com.ar` | Eventos `inzone`/`outzone` de la geocerca **OFFAL EXP**, resueltos por **patente** (tracker). Ver `docs/navixy-integracion.md`. |

---

## Cómo se calcula cada valor

Todo se cruza por **DNI** (la fichada, los choferes y el conductor del GPS usan el mismo DNI).

### Hs presente (fichada)
Por cada chofer y día:
```
Hs presente = última marca facial del día − primera marca facial del día
```
- Fuente: `FichadasHik.hik.Fichada`, filtrando por el `DNI` del chofer y la `Fecha`.
  `entrada = MIN(FechaHora)`, `salida = MAX(FechaHora)`, y la diferencia en minutos.
- Coincide **exacto** con la planilla "consulta fichadas" de RRHH.
- **Endpoint:** `GET /api/presencia?fecha=YYYY-MM-DD`. Consulta:
  ```sql
  SELECT DNI, MIN(FechaHora) AS entrada, MAX(FechaHora) AS salida,
         DATEDIFF(MINUTE, MIN(FechaHora), MAX(FechaHora)) AS minutosPresente
  FROM FichadasHik.hik.Fichada
  WHERE Fecha = @fecha AND DNI IN (<18 DNIs de choferes>)
  GROUP BY DNI;
  ```

> **⚠️ Por qué a veces da 0 o pocos minutos:** si el chofer tiene **una sola marca** ese día
> (o dos muy seguidas), la diferencia da 0 / unos minutos. No es un error de cálculo: los
> **choferes entran y salen en camión** y muchas veces fichan al llegar pero **no fichan la
> salida** (se van por el portón, no por el molinete facial). Por eso la fichada, sola, es
> imprecisa para los choferes — y por eso se cruza con el GPS (el viaje). Ej. real 14/08:
> un chofer con 1 marca → 0 min; con 2+ marcas → 8–17 hs.

### Hs en viaje  *(por patente de la Hoja de Ruta)*
Tiempo que el **camión (patente) estuvo fuera de la geocerca de Offal** ese día:
```
Hs en viaje = Σ (salida de OFFAL EXP → siguiente entrada a OFFAL EXP)
```
- **Patente:** sale de la Hoja de Ruta (`transporte.HojasRuta`) del chofer para esa fecha.
- **Tracker:** `tracker/list` → se busca el vehículo cuyo `label` coincide con la patente
  (comparación normalizada, solo alfanumérico).
- **Eventos:** `history/tracker/list` con `inzone`/`outzone` de la zona "OFFAL EXP" de ESE
  tracker. Una máquina de estados suma los tramos fuera de la geocerca (código en
  `server/src/navixy.js → viajePorPatente`). Si la fecha es hoy, corta en la hora actual.
- Si el chofer **no tiene hoja** ese día, o la **patente no existe** en LSGPS, la columna
  queda vacía (no se inventa un valor).

### Hs en Offal sin viaje
```
Hs en Offal sin viaje = Hs presente (fichada) − Hs en viaje   (nunca negativo)
```
Es el "tiempo muerto": el chofer está fichado en la planta pero no manejando.

### Cobertura LSGPS (aviso del tablero)
Cuántos choferes tienen **vehículo asignado** en Navixy (`employee/list` + `tracker_id`). Con el
modelo por patente ya **no es imprescindible** cargar al chofer en Navixy, pero la **patente sí**
debe existir como vehículo/tracker en LSGPS para poder calcular el viaje.

---

## Estado

- ✅ **Hs presente (fichada)** — funcionando, coincide con RRHH.
- ✅ **Hoja de Ruta** — formulario + tabla `transporte.HojasRuta` (guardar/listar).
- ✅ **Hs en viaje / sin viaje por patente** — mecanismo listo; se calcula donde haya hoja de
  ruta **y** la patente exista como tracker en LSGPS.
- ⚙️ **Setup pendiente:** correr `docs/hoja-ruta-sql.sql` en la base `controletiquetas` y cargar
  las App Settings `HOJARUTA_*`. Que las **patentes** de los tractores estén como vehículos en LSGPS.

## Infraestructura (producción)

- **Deploy:** Azure App Service `logistica` (`https://logistica.offalexpsa.ar`), Node/Linux, por
  GitHub Actions desde `main`. El backend sirve el frontend compilado (`web/dist`) → un solo proceso.
- **Login:** Entra (Easy Auth) a nivel App Service. El portal muestra el tile según
  `acceso.Permisos.App = 'choferes'`.
- **Red interna (Hybrid Connections):** el App Service llega a los SQL on-prem por túnel —
  INWEB (`tchala.offalexp:1433`) y GPS (`srvtwins.offalexp:1433`). ⚠️ `INWEB_SERVER` debe ser el
  **hostname exacto** de la hybrid connection (no la IP `192.168.1.9`), si no Azure no lo enruta.
- **Login SQL:** dedicado de solo lectura **`app_choferes`** con `SELECT` sobre
  `FichadasHik.hik.Fichada` (no se usa `sa`, que está restringido para conexiones remotas).
- **Variables (App Settings):** `INWEB_SERVER/NAME/USER/PASSWORD`, `GPS_*`, `NAVIXY_BASE/USER/PASS`
  y `HOJARUTA_SERVER/NAME/USER/PASSWORD` (+ `HOJARUTA_ENCRYPT=true`).
  ⚠️ Es `INWEB_PASSWORD` (no `INWEB_PASS`, como en el `.dbcred` local).
- **Hoja de Ruta (Azure SQL):** la base `controletiquetas` es **Azure directo** (NO hybrid
  connection). Correr `docs/hoja-ruta-sql.sql` (crea `transporte.HojasRuta` + el usuario
  `app_hojaruta` con permiso SELECT/INSERT/UPDATE en el esquema `transporte`).

## Correr en local

1. Backend:
   ```bash
   cd server
   cp .env.example .env      # completar credenciales SQL + API Navixy
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
- `GET /api/choferes` — lista de choferes configurados.
- `GET /api/presencia?fecha=YYYY-MM-DD` — fichada + tiempo en viaje/sin viaje ese día.
- `GET /api/navixy/cobertura` — qué choferes faltan cargar/asignar en LSGPS.
- `POST /api/hoja-ruta` — guarda una hoja de ruta (body JSON).
- `GET /api/hoja-ruta?desde=&hasta=` — lista hojas de ruta por rango.
- `POST /api/hoja-ruta/:id/anular` — anula (soft-delete) una hoja.
