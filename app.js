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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

// Полигоны невидимы, но кликабельны
function styleFeature(feature) {
  const t = feature.properties?.type;

  if (t === "zone" || t === "cabin" || t === "service") {
    return {
      color: "transparent",
      fillColor: "transparent",
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
    color: "#444444",      // обводка — чёрная
    weight: 1,

    fill: true,
    fillColor: "#ffffff",  // 🔥 БЕЛАЯ ТОЧКА
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



/**
 * Перевод координат QGIS (без CRS) -> Leaflet CRS.Simple
 * y_leaflet = IMAGE_HEIGHT + y_qgis
 */
function qgisToLeafletCoord(c) {
  return [c[0], IMAGE_HEIGHT + c[1]];
}

function transformGeoJSON(geojson) {
  const cloned = structuredClone(geojson);

  const tr = (coord) => qgisToLeafletCoord(coord);

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

async function init() {
  map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomControl: true
  });

  // Подложка
  const bounds = [[0, 0], [IMAGE_HEIGHT, IMAGE_WIDTH]];
  L.imageOverlay("./assets/base.png", bounds).addTo(map);
  map.fitBounds(bounds);

  // UI
  elSheetClose.addEventListener("click", closeSheet);

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
          console.log(
            "CLICK",
            feature?.properties?.id,
            feature?.properties?.label,
            feature?.properties?.type
          );
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
