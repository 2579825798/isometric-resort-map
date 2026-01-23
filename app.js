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
const elPhoto = document.getElementById("sheetPhoto");
const elChips = document.getElementById("sheetChips");
const elBtnDetails = document.getElementById("sheetBtnDetails");
const elBtnCall = document.getElementById("sheetBtnCall");
const elDim = document.getElementById("mapDim");
elDim.classList.remove("hidden");


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

function transformGeoJSON(gj, bounds) {
  const cloned = JSON.parse(JSON.stringify(gj));
  const b = bounds; // <-- общий bbox для всех слоёв

  const tr = ([x, y]) => {
    const nx = (x - b.minX) / (b.maxX - b.minX);
    const ny = (y - b.minY) / (b.maxY - b.minY);

    const px = nx * IMAGE_WIDTH;
    const py = ny * IMAGE_HEIGHT; // <-- без инверсии, как ты уже сделал

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
  const label = props.label || "Объект";

  const item = (id && catalogById[id]) ? catalogById[id] : null;

  // Заголовок
  elTitle.textContent = item?.title || label;

  // Subtitle (если есть) — иначе пусто
  elSubtitle.textContent = item?.subtitle || "";

  // Описание
  elDesc.textContent = item?.desc || "Описание появится здесь (catalog.json).";

  // Фото
  const photo = item?.photo || "";
  if (photo) {
    elPhoto.src = photo;
    elPhoto.alt = item?.title || label;
    elPhoto.classList.remove("hidden");
  } else {
    elPhoto.classList.add("hidden");
    elPhoto.removeAttribute("src");
  }

  // Chips
  elChips.innerHTML = "";
  const chips = Array.isArray(item?.chips) ? item.chips : [];
  chips.slice(0, 6).forEach(text => {
    const div = document.createElement("div");
    div.className = "chip";
    div.textContent = text;
    elChips.appendChild(div);
  });

  // Кнопка "Подробнее"
  const details = item?.actions?.details || item?.url || "";
  if (details) {
    elBtnDetails.href = details;
    elBtnDetails.classList.remove("hidden");
  } else {
    elBtnDetails.classList.add("hidden");
    elBtnDetails.href = "#";
  }

  // Кнопка "Позвонить"
  const phone = item?.actions?.phone || "";
  if (phone) {
    elBtnCall.href = `tel:${phone.replace(/\s+/g, "")}`;
    elBtnCall.classList.remove("hidden");
    elBtnCall.classList.add("secondary");
  } else {
    elBtnCall.classList.add("hidden");
    elBtnCall.href = "#";
  }

  // Убираем тех.мету полностью
  elMeta.textContent = "";

  // 👉 Центрируем карту на объекте (чуть выше центра, чтобы не перекрывалось карточкой)
  try {
    const geom = feature.geometry;
    let latlng = null;

    if (geom.type === "Point") {
      latlng = geom.coordinates.slice().reverse(); // [y, x]
    } else if (geom.type === "Polygon") {
      const ring = geom.coordinates[0];
      const mid = ring[Math.floor(ring.length / 2)];
      latlng = mid.slice().reverse();
    }

    if (latlng) {
      map.panTo(
        [latlng[0] - IMAGE_HEIGHT * 0.15 / IMAGE_HEIGHT, latlng[1]],
        { animate: true, duration: 0.4 }
      );
    }
  } catch (e) {
    console.warn("center failed", e);
  }

  elSheet.classList.remove("hidden");
}


function closeSheet() {
  elSheet.classList.add("hidden");
  elDim.classList.add("hidden");
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

  let suppressNextMapClick = false;


  map.on("click", () => {
    if (suppressNextMapClick) {
      suppressNextMapClick = false;
      return;
    }
    if (!elSheet.classList.contains("hidden")) {
     closeSheet();
    }
  });



  elSheetClose.addEventListener("click", closeMiniAppOrSheet);

  // клик по затемнению — закрываем карточку
  if (elDim) {
    elDim.addEventListener("click", closeSheet);
  }


  // Каталог
  try {
    catalogById = await loadJSON(CATALOG_URL);
  } catch (e) {
    console.warn("catalog.json not loaded:", e);
    catalogById = {};
  }

  // Слои
  const geojsons = await Promise.all(GEOJSON_URLS.map(loadJSON));

  // 1) общий bbox по всем слоям
  let global = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  geojsons.forEach(gj => {
    const b = getGeoJSONBounds(gj);
    global.minX = Math.min(global.minX, b.minX);
    global.minY = Math.min(global.minY, b.minY);
    global.maxX = Math.max(global.maxX, b.maxX);
    global.maxY = Math.max(global.maxY, b.maxY);
  });

  // 2) трансформируем каждый слой по одному bbox
  geojsons.forEach(gj => {
    const fixed = transformGeoJSON(gj, global);

    L.geoJSON(fixed, {
      style: styleFeature,
      pointToLayer,
      onEachFeature: (feature, layer) => {
        layer.on("click", (e) => {
          suppressNextMapClick = true;
          if (e?.originalEvent) {
            e.originalEvent.stopPropagation?.();
            e.originalEvent.preventDefault?.();
          }
          openSheetByFeature(feature);
        });
      }

    }).addTo(map);
  });
} // <-- ВОТ ЭТОЙ СКОБКИ НЕ ХВАТАЛО (закрываем init)

init().catch(err => {
  console.error(err);
  alert("Ошибка загрузки, смотри консоль (F12).");
});

// ⬇️ Свайп вниз по карточке — закрытие
let startY = null;

elSheet.addEventListener("touchstart", e => {
  startY = e.touches[0].clientY;
});

elSheet.addEventListener("touchmove", e => {
  if (startY === null) return;
  const dy = e.touches[0].clientY - startY;

  if (dy > 80) { // порог
    closeSheet();
    startY = null;
  }
});

elSheet.addEventListener("touchend", () => {
  startY = null;
});
