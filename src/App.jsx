import React, { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { CITY_COST } from "./data";

// Minimal basemap (no labels). Toggle LABELS if you want names on the basemap.
const CARTO_BASE = "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
const CARTO_LABELS = "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png";
const ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>';

// simple grayscale ramp (light→dark)
function colorForCost(cost, min, max) {
  if (!Number.isFinite(cost)) return "#ccc";
  if (min === max) return "#555";
  const t = (cost - min) / (max - min); // 0..1
  const v = Math.round(255 - t * 180);  // 255 → 75
  return `rgb(${v},${v},${v})`;
}

// Legend control
function Legend({ stops }) {
  const map = useMap();
  useEffect(() => {
    const ctrl = L.control({ position: "bottomright" });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create("div", "leafy-legend");
      const title = `<div style="font-weight:600;margin-bottom:6px">Cost of Living (dark = higher)</div>`;
      const rows = stops
        .map(([from, to, color], i) => {
          const label = i < stops.length - 1 ? `${fmt(from)}–${fmt(to)}` : `${fmt(from)}+`;
          return `<div style="display:flex;align-items:center;margin:2px 0">
            <span style="display:inline-block;width:14px;height:14px;background:${color};
            border:1px solid #0002;margin-right:6px"></span>${label}
          </div>`;
        })
        .join("");
      div.innerHTML = title + rows;
      return div;
    };
    ctrl.addTo(map);
    return () => ctrl.remove();
  }, [map, stops]);
  return null;
}

const fmt = (v) => Number(v).toLocaleString();

// Fit initial viewport to include all cities nicely
function FitToCities({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    const group = L.featureGroup(
      points.map((p) => L.marker([p.lat, p.lng], { opacity: 0 }))
    );
    const b = group.getBounds();
    if (b.isValid()) map.fitBounds(b.pad(0.2));
  }, [map, points]);
  return null;
}

export default function App() {
  const data = CITY_COST.slice();
  const costs = data.map((d) => d.cost).filter(Number.isFinite);
  const min = Math.min(...costs);
  const max = Math.max(...costs);

  // build legend stops (6 bins)
  const steps = 6;
  const stops = Array.from({ length: steps }, (_, i) => {
    const from = min + (i * (max - min)) / steps;
    const to = i === steps - 1 ? null : min + ((i + 1) * (max - min)) / steps;
    const color = colorForCost(from, min, max);
    return [from, to, color];
  });

  return (
    <MapContainer
      center={[37.8716, -122.2727]}
      zoom={12}
      attributionControl={true}
      style={{ height: "100vh", width: "100vw" }}
    >
      <TileLayer url={CARTO_BASE} attribution={ATTRIB} />
      {/* Uncomment to add subtle labels on the basemap */}
      {/* <TileLayer url={CARTO_LABELS} attribution={ATTRIB} /> */}

      <FitToCities points={data} />
      <Legend stops={stops} />

      {data.map((d) => {
        const color = colorForCost(d.cost, min, max);
        const radius = 10 + ((d.cost - min) / (max - min || 1)) * 10; // 10–20 px
        return (
          <CircleMarker
            key={d.name}
            center={[d.lat, d.lng]}
            radius={radius}
            pathOptions={{ color: "#222", weight: 1, fillColor: color, fillOpacity: 0.95 }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={1} permanent>
              <div className="city-label" style={{ color: "#222", fontSize: 13 }}>
                {d.name} • {fmt(d.cost)}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}