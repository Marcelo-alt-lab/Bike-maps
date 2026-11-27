# BikeMaps Backend

API REST en Node.js (ESM, sin dependencias externas) para calcular la ruta óptima entre dos puntos de Lima Metropolitana priorizando la red de ciclovías existentes de la Municipalidad Metropolitana de Lima (MML).

## Características principales
- **Motor de enrutamiento ciclista (`Dijkstra`)** sobre un grafo densificado de la red de ciclovías de Lima Metropolitana con puentes de conexión e intersecciones.
- **Tres modos de preferencia:**
  - `equilibrada`: prioriza ciclovías manteniendo un desvío razonable.
  - `maxima`: maximiza el porcentaje del recorrido sobre ciclovías.
  - `directa`: prioriza distancia directa con preferencia moderada por ciclovías.
- **Ajuste a red vial (`snapStreets`):** conecta origen/destino y tramos de enlace a calles reales cuando está disponible, con respaldo directo.
- **Geocodificación para Lima Metropolitana:** búsqueda de direcciones, avenidas e intersecciones dentro de los límites de Lima.

## Requisitos
- Node.js 20 o superior.

## Ejecución
```bash
npm start
```
Por defecto escucha en `http://0.0.0.0:4000`. Variables de entorno opcionales:
- `HOST`: dirección de escucha (por defecto `0.0.0.0`).
- `PORT`: puerto HTTP (por defecto `4000`).

## Pruebas
```bash
npm test
```

## Estructura del proyecto
```text
bikemaps-backend/
├── data/
│   ├── CICLOVIAS EXISTENTES.csv
│   ├── ciclovias.json
│   └── geometries.json
├── scripts/
├── src/
│   ├── geocoder.js
│   ├── routing-engine.js
│   └── server.js
├── test/
│   └── routing.test.mjs
├── LICENSE
├── package.json
└── README.md
```

## Endpoints
- `GET /api/health` — Estado del servicio y métricas del grafo de ciclovías.
- `GET /api/ciclovias?distrito=&tipoVia=&q=` — Tramos oficiales MML, metadatos, diccionario de datos y centroides distritales.
- `GET /api/geometries` — Polilíneas trazadas (`routesById`) y grafo de cruces (`graph`).
- `GET /api/corridors` — Corredores multi-tramo consolidados (`C-01`..`C-34`).
- `POST /api/route` (`{ origin: { lat, lng, label? }, destination: { lat, lng, label? }, preference?: "equilibrada"|"maxima"|"directa", snapStreets?: true|false }`) — Calcula la ruta óptima priorizando ciclovías.
- `GET /api/route?originLat=&originLng=&destLat=&destLng=&preference=` — Variante GET del calculador de ruta.
- `GET /api/geocode?q=` — Geocodificación de lugares e intersecciones en Lima Metropolitana.

## Datos abiertos y atribución
Los datos de ciclovías existentes provienen del dataset público **Ciclovías Existentes en Lima Metropolitana** de la **Municipalidad Metropolitana de Lima (MML)** (`datosabiertos.gob.pe`), publicados bajo **Open Data Commons Attribution License**.

## Licencia
El código fuente de este repositorio se distribuye bajo la [Licencia MIT](LICENSE).
