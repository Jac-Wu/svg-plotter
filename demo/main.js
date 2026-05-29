const mapbox = require("mapbox-gl");
const bbox = require("@turf/bbox").default;
const FileSaver = require("file-saver");
const {
    convertSVG,
    DragHandler,
    coordToMercator,
    mercatorToCoord,
} = require("../dist");

const i18n = {
    en: {
        title: "SVG Plotter",
        source: "source",
        description: "Convert SVG files to GeoJSON",
        selectFile: "Click to select .svg file",
        center: "Center:",
        latitude: "Latitude",
        longitude: "Longitude",
        width: "Width:",
        widthHint: "Metres",
        bearing: "Bearing:",
        bearingHint: "Angle in degrees to rotate geometry clockwise around its center.",
        subdivide: "Curve Subdivide Threshold:",
        subdivideHint: "Angular threshold for subdividing curves. Smaller values will produce smoother curves.",
        dragControls: "Drag controls:",
        dragHelp1: "Drag the dashed box to move the SVG.",
        dragHelp2: "Drag a corner handle to scale it.",
        dragHelp3: "Drag the round handle to rotate it.",
        convert: "Convert",
        download: "Download",
        convertFail: "Failed to convert SVG. See logs for more detail.",
    },
    zh: {
        title: "SVG 绘图器",
        source: "源码",
        description: "将 SVG 文件转换为 GeoJSON",
        selectFile: "点击选择 .svg 文件",
        center: "中心点:",
        latitude: "纬度",
        longitude: "经度",
        width: "宽度:",
        widthHint: "米",
        bearing: "方位角:",
        bearingHint: "围绕中心点顺时针旋转几何体的角度(度)。",
        subdivide: "曲线细分阈值:",
        subdivideHint: "曲线细分的角度阈值。值越小,曲线越平滑。",
        dragControls: "拖拽控制:",
        dragHelp1: "拖动虚线框来移动 SVG。",
        dragHelp2: "拖动角落手柄来缩放。",
        dragHelp3: "拖动圆形手柄来旋转。",
        convert: "转换",
        download: "下载",
        convertFail: "SVG 转换失败,请查看日志了解详情。",
    },
};

let currentLang = navigator.language.startsWith("zh") ? "zh" : "en";

function applyLanguage(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    const t = i18n[lang];
    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (t[key] !== undefined) {
            el.textContent = t[key];
        }
    });
    const authorEl = document.querySelector("[data-i18n-author]");
    if (authorEl) {
        const link = authorEl.querySelector("a");
        if (link) {
            const linkHref = link.href;
            const linkText = link.textContent;
            authorEl.textContent = t.author;
            const newLink = document.createElement("a");
            newLink.href = linkHref;
            newLink.target = "_blank";
            newLink.textContent = linkText;
            authorEl.appendChild(newLink);
        }
    }
    const toggleBtn = document.getElementById("langToggleButton");
    if (toggleBtn) {
        toggleBtn.textContent = lang === "en" ? "中文" : "EN";
    }
    localStorage.setItem("lang", lang);
}

const svgPreviewImage = document.getElementById("svgPreviewImage");
const convertForm = document.getElementById("convertForm");
const svgFileInput = document.getElementById("svgFileInput");
const convertButton = document.getElementById("convertButton");
const downloadButton = document.getElementById("downloadButton");
const centerLatInput = document.getElementById("centerLatitudeInput");
const centerLonInput = document.getElementById("centerLongitudeInput");
const widthInput = document.getElementById("widthInput");
const bearingInput = document.getElementById("bearingInput");
const langToggleButton = document.getElementById("langToggleButton");

const savedLang = localStorage.getItem("lang");
if (savedLang) {
    currentLang = savedLang;
}
applyLanguage(currentLang);

langToggleButton.addEventListener("click", () => {
    applyLanguage(currentLang === "en" ? "zh" : "en");
});

const EMPTY_FEATURE_COLLECTION = {
    type: "FeatureCollection",
    features: [],
};

let svgInput = null;
let geojsonOutput = null;
let currentOptions = null;
let dragHandler = null;

// Setup map preview
// eslint-disable-next-line max-len
mapbox.accessToken = "pk.eyJ1IjoibGlhbWF0dGNsYXJrZSIsImEiOiJjaXEzN2VidjUwMGFybmptNHVtNHB3cGptIn0.ZSHWqW1AMlyE3A6FlqA0ww";
const map = new mapbox.Map({
    container: "previewMap",
    style: "mapbox://styles/liamattclarke/cjtzbrujx4jya1fqwtdtj9ety",
    center: [-79.411079, 43.761539],
    zoom: 9,
});
map.on("load", () => {
    map.addSource("svg", {
        "type": "geojson",
        "data": EMPTY_FEATURE_COLLECTION,
    });
    map.addLayer({
        "id": "svg-point",
        "source": "svg",
        "type": "symbol",
        "filter": ["==", "$type", "Point"],
    });
    map.addLayer({
        "id": "svg-line",
        "source": "svg",
        "type": "line",
        "paint": {
            "line-color": "#55acee",
            "line-width": 2,
        },
        "filter": ["in", "$type", "LineString", "Polygon"],
    });
    map.addLayer({
        "id": "svg-fill",
        "source": "svg",
        "type": "fill",
        "paint": {
            "fill-color": "#55acee",
            "fill-opacity": 0.25,
        },
        "filter": ["==", "$type", "Polygon"],
    });
});

function getConvertOptions() {
    const formData = new FormData(convertForm);
    return {
        center: {
            latitude: parseFloat(formData.get("centerLatitude")),
            longitude: parseFloat(formData.get("centerLongitude")),
        },
        width: parseFloat(formData.get("width")),
        bearing: parseFloat(formData.get("bearing")),
        subdivideThreshold: parseFloat(formData.get("subdivideThreshold")),
    };
}

function renderGeoJSON(geojson) {
    map.getSource("svg").setData(geojson);
}

function clearGeoJSON() {
    renderGeoJSON(EMPTY_FEATURE_COLLECTION);
}

const mapAdapter = {
    pixelToMercator(pixel) {
        const lngLat = map.unproject([pixel.x, pixel.y]);
        return coordToMercator(lngLat.lng, lngLat.lat);
    },
    mercatorToPixel(mercator) {
        const coord = mercatorToCoord(mercator);
        const point = map.project(coord);
        return { x: point.x, y: point.y };
    },
    renderGeoJSON,
    clearGeoJSON,
    pixelToCoord(pixel) {
        const lngLat = map.unproject([pixel.x, pixel.y]);
        return [lngLat.lng, lngLat.lat];
    },
    coordToPixel(coord) {
        const point = map.project(coord);
        return { x: point.x, y: point.y };
    },
    getContainer() {
        return map.getContainer();
    },
};

function updateFormFromState(state) {
    centerLatInput.value = state.center.latitude.toFixed(6);
    centerLonInput.value = state.center.longitude.toFixed(6);
    widthInput.value = Math.round(state.width);
    bearingInput.value = state.bearing.toFixed(2);
}

function startDragInteraction(geojson, options) {
    if (dragHandler) dragHandler.destroyFully();
    dragHandler = new DragHandler();
    dragHandler.start(geojson, options, mapAdapter, (state) => {
        geojsonOutput = dragHandler.getGeoJSON();
        currentOptions = {
            ...currentOptions,
            center: state.center,
            width: state.width,
            bearing: state.bearing,
        };
        updateFormFromState(state);
    });
}

map.on("move", () => {
    if (dragHandler) dragHandler.refresh();
});

svgFileInput.addEventListener("change", (event) => {
    if (event.target.files.length) {
        const fileReader = new FileReader();
        fileReader.onload = (event) => {
            svgInput = event.target.result;
            const uri = btoa(unescape(encodeURIComponent(event.target.result)));
            svgPreviewImage.src = `data:image/svg+xml;base64,${uri}`;
        };
        fileReader.readAsText(event.target.files[0]);
    }
});

convertButton.addEventListener("click", (event) => {
    event.preventDefault();
    const options = getConvertOptions();
    try {
        const { geojson, errors } = convertSVG(svgInput, options);
        geojsonOutput = geojson;
        currentOptions = options;
        errors.forEach((e) => console.warn(e));
        downloadButton.removeAttribute("disabled");
        renderGeoJSON(geojsonOutput);
        startDragInteraction(geojsonOutput, currentOptions);
        map.fitBounds(bbox(geojsonOutput), {
            padding: 100,
            // Offsetting to righ to accomodate floating control panel
            offset: [100, 0],
        });
    } catch (e) {
        alert(i18n[currentLang].convertFail);
        console.error(e);
    }
});

downloadButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (geojsonOutput) {
        const formData = new FormData(convertForm);
        const blob = new Blob(
            [JSON.stringify(geojsonOutput, null, 2)],
            { type: "application/json" },
        );
        const fileName = formData.get("svgFile").name.replace(".svg", ".geojson");
        FileSaver.saveAs(blob, fileName);
    }
});
