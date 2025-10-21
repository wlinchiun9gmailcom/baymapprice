import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { PRICES, CITY_LIST } from "./prices";

// --- helpers ---
const fmt = (v) => Number(v).toLocaleString();

function colorFor(value, min, max) {
  if (!Number.isFinite(value)) return "#ccc";
  if (min === max) return "#555";
  const t = (value - min) / (max - min);        // 0..1
  const v = Math.round(255 - t * 180);          // 255 → 75 (light → dark)
  return `rgb(${v},${v},${v})`;
}

function Legend({ min, max, steps = 6 }) {
  const map = useMap();
  useEffect(() => {
    const ctrl = L.control({ position: "bottomright" });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create("div", "legend");
      const step = (max - min) / steps || 1;
      let html = `<div style="font-weight:700;margin-bottom:6px">Price (dark = higher)</div>`;
      for (let i = 0; i < steps; i++) {
        const from = min + i * step;
        const to = i === steps - 1 ? null : min + (i + 1) * step;
        html += `<div style="display:flex;align-items:center;margin:2px 0">
          <span style="display:inline-block;width:14px;height:14px;background:${colorFor(from, min, max)};
          border:1px solid #0002;margin-right:6px"></span>${to ? `${fmt(from)}–${fmt(to)}` : `${fmt(from)}+`}
        </div>`;
      }
      div.innerHTML = html;
      return div;
    };
    ctrl.addTo(map);
    return () => ctrl.remove();
  }, [map, min, max, steps]);
  return null;
}

function labelAtCenter(layer, text) {
  const c = layer.getBounds().getCenter();
  const icon = L.divIcon({ className: "city-label", html: `<span>${text}</span>`, iconSize: [0, 0] });
  return L.marker([c.lat, c.lng], { icon, interactive: false });
}

// --- main ---
export default function App() {
  const [geo, setGeo] = useState(null);
  const [status, setStatus] = useState("Loading data…");

  useEffect(() => {
    // Try filtered file first; fall back to national file
    const tryFiles = async () => {
      for (const path of ["/cities.geojson", "/places_us.json", "/cities_unfiltered.json"]) {
        try {
          const r = await fetch(path, { cache: "no-store" });
          if (r.ok) {
            setStatus(`Loaded ${path}`);
            setGeo(await r.json());
            return;
          }
        } catch {}
      }
      setStatus("Could not load a GeoJSON file from /public");
    };
    tryFiles();
  }, []);

  const filtered = useMemo(() => {
    if (!geo?.features) return null;

    // Detect field names from your file
    // Census Cartographic “Places” fields: NAME, STATEFP, PLACEFP
    const guessNameField = (f) => f.properties.NAME ?? f.properties.name ?? f.properties.Name;
    const isCA = (f) => (f.properties.STATEFP ?? f.properties.statefp) === "06";

    // Keep California + your target cities
    const feats = geo.features.filter((f) => {
      const name = guessNameField(f);
      const inCA = isCA(f) || geo.features.every(g => g.properties.STATEFP === undefined); // skip if state field absent
      const wanted = CITY_LIST.includes(name);
      return inCA && wanted;
    });

    // Build cost prop if missing by joining PRICES
    feats.forEach((f) => {
      const name = guessNameField(f);
      if (f.properties.cost == null && PRICES[name] != null) f.properties.cost = PRICES[name];
      if (f.properties.NAME == null && name) f.properties.NAME = name; // normalize
    });

    return { type: "FeatureCollection", features: feats };
  }, [geo]);

  // Pricing domain
  const [min, max] = useMemo(() => {
    if (!filtered?.features?.length) return [0, 1];
    const vals = filtered.features.map(f => Number(f.properties.cost)).filter(Number.isFinite);
    return [Math.min(...vals), Math.max(...vals)];
  }, [filtered]);

  // Early exit until data arrives
  if (!filtered) return null;

  return (
    <>
      <MapContainer center={[37.8715, -122.2730]} zoom={12} style={{ height: "100vh", width: "100vw" }}>
        {/* Minimal basemap (you can delete this line for pure white background) */}
        <L.TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; OSM & CARTO'
          maxZoom={19}
        />

        {/* Render polygons */}
        <GeoJSON
          data={filtered}
          style={(f) => ({
            color: "#6b7280",
            weight: 1.25,
            fillColor: colorFor(Number(f.properties.cost), min, max),
            fillOpacity: 0.85
          })}
          onEachFeature={(f, layer) => {
            const name = f.properties.NAME || f.properties.name || "Area";
            const price = f.properties.cost;
            layer.bindPopup(`<b>${name}</b><br/>Price: ${fmt(price)}`);
            layer.on("mouseover", () => layer.setStyle({ weight: 2, color: "#374151" }));
            layer.on("mouseout",  () => layer.setStyle({ weight: 1.25, color: "#6b7280" }));
            labelAtCenter(layer, name).addTo(layer._map);  // label
          }}
        />

        {/* Fit bounds */}
        <FitTo data={filtered} />
        <Legend min={min} max={max} />
      </MapContainer>

      <div className="status">{status}</div>
    </>
  );
}

function FitTo({ data }) {
  const map = useMap();
  useEffect(() => {
    if (!data) return;
    const b = L.geoJSON(data).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [28, 28] });
  }, [data, map]);
  return null;
}
