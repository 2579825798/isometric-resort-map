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
let poiCenterById = {}; // id -> [lat, lng] (в CRS.Simple это [y, x])
let map;
let catalogById = {};
let HOME_CENTER = null; // [lat, lng] в CRS.Simple
let HOME_ZOOM = null;


// Sheet elements
const elSheet = document.getElementById("sheet");
const elSheetClose = document.getElementById("sheetClose");
const elTitle = document.getElementById("sheetTitle");
const elSubtitle = document.getElementById("sheetSubtitle");
const elDesc = document.getElementById("sheetDesc");
const elLink = document.getElementById("sheetLink");
const elMeta = document.getElementById("sheetMeta");
const elPhoto = document.getElementById("sheetPhoto");
const elNoPhoto = document.getElementById("sheetNoPhoto");
const elChips = document.getElementById("sheetChips");
const elBtnDetails = document.getElementById("sheetBtnDetails");
const elBtnCall = document.getElementById("sheetBtnCall");
const elDim = document.getElementById("mapDim");



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


  // Фото (fallback, если не загрузилось)
  const photo = (item?.photo || "").trim();

  if (elPhoto) {
    elPhoto.alt = item?.title || label;

    if (photo) {
      // сбрасываем обработчики
      elPhoto.onload = null;
      elPhoto.onerror = null;

      elPhoto.onerror = () => {
        elPhoto.classList.add("hidden");
        elPhoto.removeAttribute("src");

        if (elNoPhoto) {
          elNoPhoto.textContent = "Фото скоро появится";
          elNoPhoto.classList.remove("hidden");
        }
      };

      elPhoto.onload = () => {
        if (elNoPhoto) elNoPhoto.classList.add("hidden");
        elPhoto.classList.remove("hidden");
      };

      // сначала показываем фото, заглушку прячем
      if (elNoPhoto) elNoPhoto.classList.add("hidden");
      elPhoto.classList.remove("hidden");

      elPhoto.src = photo;
    } else {
      // нет фото в каталоге
      elPhoto.classList.add("hidden");
      elPhoto.removeAttribute("src");

      if (elNoPhoto) {
        elNoPhoto.textContent = "Фото скоро появится";
        elNoPhoto.classList.remove("hidden");
      }
    }
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
  const phone = (item?.actions?.phone || "").trim();
  if (phone) {
    elBtnCall.href = `tel:${phone.replace(/\s+/g, "")}`;
    elBtnCall.classList.remove("hidden");
    elBtnCall.classList.add("secondary");
  } else {
    elBtnCall.classList.add("hidden");
    elBtnCall.href = "#";
  }

  // Убираем тех.мету полностью
  const meta = (item && item.meta && typeof item.meta === "object") ? item.meta : {};
  const metaParts = [];

  if (meta.capacity) metaParts.push(`👤 ${meta.capacity}`);
  if (meta.beds) metaParts.push(`🛏 ${meta.beds}`);
  if (meta.hours) metaParts.push(`🕒 ${meta.hours}`);

  // покажем максимум 3 пункта в одну строку
  const metaLine = metaParts.slice(0, 3).join("  •  ");
  elMeta.textContent = metaLine;
  elMeta.style.display = metaLine ? "block" : "none";



  // 👉 Центрируем: для zone — по POI с тем же id, иначе по геометрии
  try {
    const props = feature.properties || {};
    const id = props.id || "";
    const t = props.type || "";

    let targetLatLng = null;

    // 1) ZONE -> по POI с таким же id
    if (t === "zone" && id && poiCenterById[id]) {
      targetLatLng = poiCenterById[id];
    } else {
      // 2) иначе — по своей геометрии
      const geom = feature.geometry;

      if (geom?.type === "Point") {
        const [x, y] = geom.coordinates;
        targetLatLng = [y, x];
      } else if (geom?.type === "Polygon") {
        const ring = geom.coordinates?.[0];
        if (ring && ring.length) {
          const mid = ring[Math.floor(ring.length / 2)];
          const [x, y] = mid;
          targetLatLng = [y, x];
        }
      }
    }

    if (targetLatLng) {
      // сдвигаем чуть вверх, чтобы карточка не перекрывала
      map.panTo([targetLatLng[0] - 80, targetLatLng[1]], { animate: true, duration: 0.4 });
    }
  } catch (e) {
    console.warn("center failed", e);
  }

  if (elDim) elDim.classList.remove("hidden");

  elSheet.classList.remove("hidden");
  // прячем кнопку "Общий вид", чтобы не мешала
  const btnHome = document.getElementById("btnHome");
  if (btnHome) btnHome.style.display = "none";

}

function closeSheet() {
  elSheet.classList.add("hidden");
  if (elDim) elDim.classList.add("hidden");

  // возвращаем кнопку "Общий вид"
  const btnHome = document.getElementById("btnHome");
  if (btnHome) btnHome.style.display = "block";
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
  try {
    // Telegram WebApp (если открыто внутри Telegram Mini App)
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();

      // BackButton бывает недоступен в некоторых версиях/контекстах
      try {
        if (tg.BackButton && typeof tg.BackButton.show === "function") {
          tg.BackButton.show();
          tg.BackButton.onClick(closeMiniAppOrSheet);
        }
      } catch (e) {
        console.warn("BackButton not available:", e);
      }
    }

    const imageBounds = [[0, 0], [IMAGE_HEIGHT, IMAGE_WIDTH]];

    map = L.map("map", {
      crs: L.CRS.Simple,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
      inertia: true,
      maxBounds: imageBounds,
      maxBoundsViscosity: 1.0
    });

    L.imageOverlay("./assets/base.png", imageBounds).addTo(map);

    // 1) zoom, при котором картинка полностью помещается
    const fitZoom = map.getBoundsZoom(imageBounds, true);

    // 2) стартовый зум (ты можешь менять эту строку сам)
    const startZoom = fitZoom - 1;

    // 3) стартовая позиция
    map.setView([IMAGE_HEIGHT / 2, IMAGE_WIDTH / 2], startZoom, { animate: false });

    // === HOME VIEW (кнопка "Общий вид") ===
    HOME_CENTER = [IMAGE_HEIGHT / 2, IMAGE_WIDTH / 2];
    HOME_ZOOM = startZoom;

    // создаём кнопку один раз
    if (!document.getElementById("btnHome")) {
      const btn = document.createElement("button");
      btn.id = "btnHome";
      btn.type = "button";
      btn.textContent = "Общий вид";

      // минимальные встроенные стили (чтобы не править CSS)
      btn.style.position = "fixed";
      btn.style.top = "12px";
      btn.style.right = "12px";
      btn.style.zIndex = "1100";
      btn.style.padding = "10px 12px";
      btn.style.borderRadius = "12px";
      btn.style.border = "0";
      btn.style.cursor = "pointer";
      btn.style.fontWeight = "800";
      btn.style.background = "rgba(22, 22, 22, 0.88)";
      btn.style.color = "#fff";
      btn.style.backdropFilter = "blur(8px)";
      btn.style.boxShadow = "0 8px 18px rgba(0,0,0,0.25)";

      btn.addEventListener("click", () => {
        // если карточка открыта — закрываем, чтобы не мешала
        if (!elSheet.classList.contains("hidden")) closeSheet();

        // возвращаем на стартовый вид
        map.setView(HOME_CENTER, HOME_ZOOM, { animate: true, duration: 0.35 });
      });

      document.body.appendChild(btn);
    }

    // 4) ограничения зума
    map.setMinZoom(fitZoom - 1); // можно немного отдалить
    map.setMaxZoom(fitZoom + 4); // можно приближать

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

    // Каталог (универсально: поддерживает и объект-словарь, и массив)
    try {
      const catalog = await loadJSON(CATALOG_URL);

      if (Array.isArray(catalog)) {
        catalogById = {};
        catalog.forEach(it => {
          if (it?.id) catalogById[it.id] = it;
        });
      } else if (catalog && typeof catalog === "object") {
        if (Array.isArray(catalog.items)) {
          catalogById = {};
          catalog.items.forEach(it => {
            if (it?.id) catalogById[it.id] = it;
          });
        } else {
          catalogById = catalog;
        }
      } else {
        catalogById = {};
      }

      console.log("CATALOG loaded keys:", Object.keys(catalogById).slice(0, 10));
    } catch (e) {
      console.warn("catalog.json not loaded:", e);
      catalogById = {};
    }

    // Слои
    const geojsons = await Promise.all(GEOJSON_URLS.map(loadJSON));

    // 1) общий bbox по всем слоям (в исходных координатах QGIS)
    let global = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    geojsons.forEach(gj => {
      const b = getGeoJSONBounds(gj);
      global.minX = Math.min(global.minX, b.minX);
      global.minY = Math.min(global.minY, b.minY);
      global.maxX = Math.max(global.maxX, b.maxX);
      global.maxY = Math.max(global.maxY, b.maxY);
    });

    // ⬇️ Свайп вниз по карточке — закрытие
    let startY = null;

    elSheet.addEventListener("touchstart", e => {
      startY = e.touches[0].clientY;
    });

    elSheet.addEventListener("touchmove", e => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;

      if (dy > 80) {
        closeSheet();
        startY = null;
      }
    });

    elSheet.addEventListener("touchend", () => {
      startY = null;
    });

    // 2) трансформируем каждый слой по одному bbox
    geojsons.forEach(gj => {
      const fixed = transformGeoJSON(gj, global);

      const layerName = (fixed?.name || "").toLowerCase();
      if (layerName.includes("poi")) {
        (fixed.features || []).forEach(f => {
          const id = f?.properties?.id;
          if (!id) return;
          if (f?.geometry?.type === "Point") {
            const [x, y] = f.geometry.coordinates;
            poiCenterById[id] = [y, x];
          }
        });
      }

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

  } finally {
    // ✅ LOADER OFF (скрываем всегда — даже если была ошибка)
    const elLoader = document.getElementById("loader");
    if (elLoader) elLoader.style.display = "none";
  }
}

init().catch(err => {
  console.error(err);

  // показываем понятную ошибку поверх карты
  const elErr = document.getElementById("loadError");
  if (elErr) elErr.style.display = "block";

  alert("Ошибка загрузки. Открой F12 → Console и пришли первую красную строку ошибки.");
});


