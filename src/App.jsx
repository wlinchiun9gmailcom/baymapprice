import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

/* ---------------- Helpers ---------------- */
const fmt = (v) => Number.isFinite(v) ? Number(v).toLocaleString() : String(v);

/** Area-weighted centroid of Polygon/MultiPolygon (good for labels) */
function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (!a) return ring[0];
  a *= 0.5; return [cx / (6 * a), cy / (6 * a)];
}
function polygonCentroid(coords) { return ringCentroid(coords[0]); }
function multipolygonCentroid(coords) {
  let best = null, bestA = -Infinity;
  for (const poly of coords) {
    const ring = poly[0];
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1,y1]=ring[i],[x2,y2]=ring[i+1];
      a += x1*y2 - x2*y1;
    }
    a = Math.abs(a*0.5);
    if (a > bestA) { bestA = a; best = polygonCentroid(poly); }
  }
  return best ?? polygonCentroid(coords[0]);
}
function featureCentroid(f) {
  const g=f.geometry; if(!g) return null;
  if (g.type==="Polygon") return polygonCentroid(g.coordinates);
  if (g.type==="MultiPolygon") return multipolygonCentroid(g.coordinates);
  return null;
}

/** Build 3 buckets (Low / Med / High) using quantiles or manual thresholds */
function classify(values, thresholds) {
  const vals = values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
  let t1, t2, method="quantiles";
  if (thresholds && thresholds.length===2 && thresholds.every(Number.isFinite)) {
    [t1, t2] = thresholds; method="custom";
  } else {
    const q = (p) => {
      const idx=(vals.length-1)*p, lo=Math.floor(idx), hi=Math.ceil(idx);
      if (lo===hi) return vals[lo];
      const w=idx-lo; return vals[lo]*(1-w)+vals[hi]*w;
    };
    t1 = q(1/3); t2 = q(2/3);
  }
  return { t1, t2, method };
}

/* ---------------- Fit + Labels Controls ---------------- */
function FitTo({ data }) {
  const map = useMap();
  useEffect(() => {
    if (!data) return;
    const b = L.geoJSON(data).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [28, 28] });
  }, [data, map]);
  return null;
}
function CityLabels({ data }) {
  const map = useMap();
  useEffect(() => {
    if (!data) return;
    const layer = L.layerGroup().addTo(map);

    const render = () => {
      layer.clearLayers();
      const z = map.getZoom();
      const size = Math.max(11, Math.min(22, 12 + (z - 11) * 1.2));
      for (const f of data.features) {
        const name = f.properties?.name ?? "";
        if (!name) continue;
        const c = featureCentroid(f);
        if (!c) continue;
        const icon = L.divIcon({
          className: "city-label",
          html: `<span style="font-size:${size}px">${name}</span>`,
          iconSize: [0,0], iconAnchor: [0,0]
        });
        L.marker([c[1], c[0]], { icon, interactive:false }).addTo(layer);
      }
    };
    render(); map.on("zoomend", render);
    return () => { map.off("zoomend", render); map.removeLayer(layer); };
  }, [data, map]);
  return null;
}

/* ---------------- Legend ---------------- */
function Legend({ t1, t2, colors, unitLabel="Cost index" }) {
  const map = useMap();
  useEffect(() => {
    const ctrl = L.control({ position: "bottomright" });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create("div", "leafy-legend");
      div.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px">Cost of living</div>
        <div style="display:flex;align-items:center;margin:2px 0">
          <span style="display:inline-block;width:12px;height:12px;background:${colors.low};
            border:1px solid #0002;border-radius:50%;margin-right:6px"></span>
          Low (≤ ${fmt(t1)}) ${unitLabel ? `<span style="opacity:.6">– ${unitLabel}</span>` : ""}
        </div>
        <div style="display:flex;align-items:center;margin:2px 0">
          <span style="display:inline-block;width:12px;height:12px;background:${colors.med};
            border:1px solid #0002;border-radius:50%;margin-right:6px"></span>
          Medium (${fmt(t1)}–${fmt(t2)})
        </div>
        <div style="display:flex;align-items:center;margin:2px 0">
          <span style="display:inline-block;width:12px;height:12px;background:${colors.high};
            border:1px solid #0002;border-radius:50%;margin-right:6px"></span>
          High (≥ ${fmt(t2)})
        </div>`;
      return div;
    };
    ctrl.addTo(map);
    return () => ctrl.remove();
  }, [map, t1, t2, colors, unitLabel]);
  return null;
}

/* ---------------- App ---------------- */
export default function App() {
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    // Replace with your real file; keep properties: { name, cost }
    fetch("/cities.json")
      .then(r => r.json())
      .then(setGeo)
      .catch(e => console.error("Failed to load /cities.json", e));
  }, []);

  // palette like your mock: green (low), orange (med), red (high)
  const colors = { low: "#34a853", med: "#f29900", high: "#e15759" };

  const thresholds = useMemo(() => {
    if (!geo?.features?.length) return null;
    const values = geo.features.map(f => Number(f.properties?.cost));
    return classify(values); // or classify(values, [110, 120]) for custom cutoffs
  }, [geo]);

  const style = (feature) => {
    const v = Number(feature.properties?.cost);
    const { t1, t2 } = thresholds || { t1: 0, t2: 1 };
    let fill = colors.low;
    if (v > t2) fill = colors.high;
    else if (v > t1) fill = colors.med;
    return {
      color: "#6b7280",       // subtle gray stroke so shapes read on soft bg
      weight: 1.25,
      fillColor: fill,
      fillOpacity: 0.85,
    };
  };

  const onEach = (feature, layer) => {
    const name = feature.properties?.name ?? "Area";
    const cost = feature.properties?.cost;
    layer.bindPopup(`<b>${name}</b><br/>Cost: ${fmt(cost)}`);
    layer.on("mouseover", () => layer.setStyle({ weight: 2, color: "#374151" }));
    layer.on("mouseout",  () => layer.setStyle({ weight: 1.25, color: "#6b7280" }));
  };

  return (
    <MapContainer
      center={[37.8716, -122.2727]}  // fallback in case file fails to load
      zoom={12}
      style={{ height: "100vh", width: "100vw" }}
      attributionControl={false}
    >
      {/* No basemap: clean graphic style */}
      {geo && <GeoJSON data={geo} style={style} onEachFeature={onEach} />}
      {geo && <FitTo data={geo} />}
      {geo && <CityLabels data={geo} />}
      {thresholds && <Legend t1={thresholds.t1} t2={thresholds.t2} colors={colors} unitLabel="index" />}
    </MapContainer>
  );
}
