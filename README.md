# Registro de Choferes (Offal)

Módulo para **Logística**: tablero que muestra cuánto tiempo están los choferes en la
planta **sin viaje** = **horas fichadas (presencia) − horas en viaje (LSGPS)**.

Read-only: el usuario no carga nada, solo consulta.

## Stack

- **Backend:** Node + Express + `mssql` (solo lectura de SQL Server). Carpeta `server/`.
- **Frontend:** React + Vite. Carpeta `web/`.
- Identidad visual: paleta del portal Offal (teal + rojo) + Inter.

## Fuentes de datos

| Dato | Fuente | Detalle |
|------|--------|---------|
| **Fichada (presencia)** | `FichadasHik.hik.Fichada` — server INWEB **192.168.1.9** | Marcas faciales (entrada/salida) con `DNI` y `FechaHora`. Es la misma "consulta fichadas" que usa RRHH. |
| **Choferes** | `server/src/choferes.js` | Lista oficial (18) con `dni`, `legajo`, `nombre`. |
| **Viaje / geocercas** | API LSGPS (Navixy) `https://napi.lsgps.com.ar` | Eventos `inzone`/`outzone` de la geocerca **OFFAL EXP** por chofer. Ver `docs/navixy-integracion.md`. |

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

### Hs en viaje  *(pendiente de completar setup en LSGPS)*
Tiempo que el **camión del chofer estuvo fuera de la geocerca de Offal**:
```
Hs en viaje = Σ (salida de OFFAL EXP → siguiente entrada a OFFAL EXP)
```
- Fuente: API Navixy, `history/tracker/list` con eventos `inzone`/`outzone` de la zona
  "OFFAL EXP". Cada evento trae el `employee_id` (chofer) → se mapea a DNI.
- El camión de cada chofer sale de `employee.tracker_id` (asignación en Navixy).

### Hs en Offal sin viaje
```
Hs en Offal sin viaje = Hs presente (fichada) − Hs en viaje
```
Es el "tiempo muerto": el chofer está fichado en la planta pero no manejando.

### Cobertura LSGPS (aviso del tablero)
Para cada chofer, si está cargado como **empleado** en Navixy (`employee/list`, cruzando por
`driver_license_number = DNI`) y si tiene **vehículo asignado** (`tracker_id`). Sirve para que
Logística complete el setup — sin eso no se puede calcular el tiempo en viaje.

---

## Estado

- ✅ **Hs presente (fichada)** — funcionando, coincide con RRHH.
- ✅ **Cliente Navixy + aviso de cobertura** — funcionando (`/api/navixy/cobertura`).
- ⏳ **Hs en viaje** y **Hs en Offal sin viaje** — el mecanismo está listo; falta que Logística
  complete en Navixy los 18 choferes + vehículos + la regla de geocerca de OFFAL EXP.
- ⏳ **Deploy** — lee de la LAN interna (192.168.1.5/.9) → Azure App Service común no llega;
  usar Azure + Hybrid Connections u hosting on-prem.

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
- **Variables (App Settings):** `INWEB_SERVER/NAME/USER/PASSWORD`, `GPS_*`, `NAVIXY_BASE/USER/PASS`.
  ⚠️ Es `INWEB_PASSWORD` (no `INWEB_PASS`, como en el `.dbcred` local).

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
- `GET /api/presencia?fecha=YYYY-MM-DD` — fichada de los choferes ese día.
- `GET /api/navixy/cobertura` — qué choferes faltan cargar/asignar en LSGPS.
