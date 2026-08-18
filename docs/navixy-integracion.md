# Integración con LSGPS (Navixy) — para el "tiempo en viaje"

La fichada (presencia) ya está resuelta con `FichadasHik` (INWEB). Falta el **tiempo
del camión fuera de Offal** (viaje), que sale de la API de LSGPS (Navixy).

## API

- **Base:** `https://napi.lsgps.com.ar` (pública). Doc interna: `http://192.168.97.125/viewtopic.php?t=1476`.
- **Auth:** `POST user/auth` con `login` + `password` → `{ hash, success }`. El `hash` va como parámetro en el resto de los llamados. (Login: `sistemas@offal.com.ar`.)
- Credenciales por env: `NAVIXY_BASE`, `NAVIXY_USER`, `NAVIXY_PASS`.

Cliente en [`server/src/navixy.js`](../server/src/navixy.js):
- `employeeList()` → choferes: `driver_license_number` (DNI), `id` (employee_id), `tracker_id` (vehículo).
- `trackerList()` → vehículos: `id`, `label` (patente).
- `zoneEvents(trackerIds, from, to)` → eventos `inzone`/`outzone`; cada uno trae
  `extra.zone_labels` (ej. `"OFFAL EXP"`) y `extra.employee_id` (el chofer).
- (Alternativa) `report/tracker/generate` con `plugin_id 4` (viajes del día) + `report/tracker/retrieve`.

## Cálculo objetivo

`Tiempo en Offal sin viaje` (por chofer, por día) =
**horas fichadas − tiempo del camión fuera de Offal**, atribuyendo cada viaje al chofer
por `employee_id` (o por `tracker_id` del empleado) y mapeando `employee_id → DNI`.

Los eventos `inzone`/`outzone` de la zona **OFFAL EXP** dan los tramos dentro/fuera de Offal.

## Bloqueante actual: completar el setup en Navixy (Logística)

Endpoint de diagnóstico: `GET /api/navixy/cobertura`. Estado a la fecha: **7/18 choferes
cargados, 4/18 con vehículo asignado**. Para que el cálculo funcione, Logística debe en Navixy:

1. **Cargar los 18 choferes** como empleados (con su DNI en `driver_license_number`).
2. **Asignar el vehículo** (tracker) a cada chofer.
3. **Confirmar la regla de geocerca** de OFFAL EXP con eventos `inzone`/`outzone` activos
   (en las pruebas los eventos vinieron vacíos → o el camión no se movió, o falta la regla).

## Pendiente de integración (una vez completo el setup)

- Elegir fuente: `history/tracker/list` (eventos in/out) **o** `report` de viajes (plugin 4).
- Mapear `tracker ↔ chofer`, calcular tiempo fuera de Offal por chofer/día.
- Completar `minutosViaje` y `minutosSinViaje` en `GET /api/presencia`.
