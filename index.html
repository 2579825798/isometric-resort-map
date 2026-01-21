console.log("APP VERSION: 20260122-1");

const IMAGE_WIDTH = 1536;
const IMAGE_HEIGHT = 1024;

const GEOJSON_URLS = [
  "./data/zones.geojson",
  "./data/cabins.geojson",
  // ВАЖНО: у тебя сейчас poi_new
  "./data/poi_new.geojson"
];

const CATALOG_URL = "./data/catalog.json";

let map;
let catalogById = {};

// Sheet elements
const elSheet = document.getElementById("sheet");
const elSheetClose = document.getElementById("sheetClose");
const elTitle = document.getElementById("sheetTitle");
const elSubtitle = document.getElementById("sheetSubtitle");
const elDesc = document.getElementById("sheetDesc");
const elLink = document.getElementById("sheetLink");
const elMeta = document.getElementById("sheetMeta");

async function loadJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to load ${url}`);
  return r.json();
}

// ===== ТРАНСФОРМАЦИЯ КООРДИНАТ (QGIS -> картинка) =====
function getGeoJSONBounds(gj) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function visit(coords) {
    if (typeof coords[0] === "number") {
      const x = coords[0];
      const y = coords[1];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      return;
    }
    coords.forEach(visit);
  }

  (gj.features || []).forEach(f => {
    if (f?.geometry?.coordinates) visit(f.geometry.coordinates);
  });

  return { minX, minY, maxX, maxY };
}

function transformGeoJSON(gj) {
  const cloned = JSON.parse(JSON.stringify(gj));
  const b = getGeoJSONBounds(cloned);

  // 1) x -> [0..W]
  // 2) y -> [0..H] с инверсией оси (в QGIS вверх = больше, в картинке вниз = больше)
  const tr = ([x, y]) => {
    const nx = (x - b.minX) / (b.maxX - b.minX);
    const ny = (y - b.minY) / (b.maxY - b.minY);
    const px = nx * IMAGE_WIDTH;
    const py = (1 - ny) * IMAGE_HEIGHT;
    return [px, py];
  };

  const trGeom = (geom) => {
    if (!geom) return geom;

    switch (geom.type) {
      case "Point":
        geom.coordinates = tr(geom.coordinates);
        break;

      case "MultiPoint":
        geom.coordinates = geom.coordinates.map(tr);
        break;

      case "LineString":
        geom.coordinates = geom.coordinates.map(tr);
        break;

      case "MultiLineString":
        geom.coordinates = geom.coordinates.map(line => line.map(tr));
        break;

      case "Polygon":
        geom.coordinates = geom.coordinates.map(ring => ring.map(tr));
        break;

      case "MultiPolygon":
        geom.coordinates = geom.coordinates.map(poly =>
          poly.map(ring => ring.map(tr))
        );
        break;

      default:
        break;
    }
    return geom;
  };

  cloned.features.forEach(f => {
    f.geometry = trGeom(f.geometry);
  });

  return cloned;
}

// ===== UI: карточка =====
function openSheetByFeature(feature) {
  const props = feature.properties || {};
  const id = props.id || "";
  const label = props.label || id || "Объект";
  const baseType = props.type || "";

  const item = (id && catalogById[id]) ? catalogById[id] : null;

  elTitle.textContent = label;

  // маленькая строка под заголовком
  const hint = baseType ? `Тип: ${baseType}` : "";
  elSubtitle.textContent = hint;

  elDesc.textContent = item?.desc || "Краткая информация появится здесь (catalog.json).";

  // Кнопка "Подробнее" — только если есть url
  const url = item?.url || "";
  if (url) {
    elLink.href = url;
    elLink.classList.remove("hidden");
  } else {
    elLink.classList.add("hidden");
    elLink.href = "#";
  }

  elMeta.textContent = id ? `ID: ${id}` : "";

  elSheet.classList.remove("hidden");
}

function closeSheet() {
  elSheet.classList.add("hidden");
}

function closeMiniAppOrSheet() {
  // 1) если карточка открыта — закрываем её
  if (!elSheet.classList.contains("hidden")) {
    closeSheet();
    return;
  }
  // 2) если карточки нет — закрываем мини-апп (только внутри Telegram)
  const tg = window.Telegram?.WebApp;
  if (tg) tg.close();
}

// ===== СТИЛИ =====
function styleFeature(feature) {
  const t = feature.properties?.type;

  // Невидимые hit-area (но кликабельные!)
  if (t === "zone" || t === "cabin" || t === "service") {
    return {
      color: "transparent",
      fillColor: "#000",
      weight: 0,
      fillOpacity: 0.001
    };
  }

  return {};
}

// POI — видимые
function pointToLayer(feature, latlng) {
  const marker = L.circleMarker(latlng, {
    radius: 6,

    stroke: true,
    color: "#444444",      // обводка
    weight: 1,

    fill: true,
    fillColor: "#ffffff",  // заливка
    fillOpacity: 1
  });

  const label = feature.properties?.label;
  if (label) {
    marker.bindTooltip(label, {
      permanent: true,
      direction: "top",
      offset: [0, -6],
      className: "poi-label"
    });
  }

  return marker;
}

async function init() {
  // Telegram WebApp (если открыто внутри Telegram Mini App)
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand(); // раскрыть на максимум по высоте
    tg.BackButton.show();
    tg.BackButton.onClick(closeMiniAppOrSheet);
  }

  map = L.map("map", {
    crs: L.CRS.Simple,
    zoomControl: true,
    minZoom: -3,
    maxZoom: 3
  });

  const imageBounds = [[0, 0], [IMAGE_HEIGHT, IMAGE_WIDTH]];
  L.imageOverlay("./assets/base.png", imageBounds).addTo(map);
  map.fitBounds(imageBounds);

  elSheetClose.addEventListener("click", closeMiniAppOrSheet);

  // Каталог
  try {
    catalogById = await loadJSON(CATALOG_URL);
  } catch (e) {
    console.warn("catalog.json not loaded:", e);
    catalogById = {};
  }

  // Слои
  const geojsons = await Promise.all(GEOJSON_URLS.map(loadJSON));

  geojsons.forEach(gj => {
    const fixed = transformGeoJSON(gj);

    L.geoJSON(fixed, {
      style: styleFeature,
      pointToLayer,
      onEachFeature: (feature, layer) => {
        layer.on("click", () => {
          openSheetByFeature(feature);
        });
      }
    }).addTo(map);
  });
}

init().catch(err => {
  console.error(err);
  alert("Ошибка загрузки, смотри консоль (F12).");
});
