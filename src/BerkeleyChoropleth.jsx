// import React, { useEffect, useMemo, useRef, useState } from "react";
// import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
// import L from "leaflet";

// /* ---------- helpers ---------- */
// const palettes = {
//   reds:   ["#fee5d9", "#fcbba1", "#fc9272", "#fb6a4a", "#de2d26", "#a50f15"],
//   greens: ["#e5f5e0", "#c7e9c0", "#a1d99b", "#74c476", "#31a354", "#006d2c"],
//   viridis:["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725", "#ffffe0"]
// };

// const fmt = (x) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(x);
// const by  = (k) => (a, b) => (a[k] > b[k]) - (a[k] < b[k]);

// function parseInput(text) {
//   return text
//     .split(/\n+/)
//     .map(s => s.trim())
//     .filter(Boolean)
//     .map(line => {
//       const m = line.match(/^(.*?)[=:]\s*(.*?)\s*$/);
//       if (!m) return null;
//       const name = m[1].trim();
//       const value = Number(m[2].replace(/[$,\s]/g, ""));
//       return (name && Number.isFinite(value)) ? { name, value } : null;
//     })
//     .filter(Boolean);
// }

// function quantiles(values, k = 6) {
//   const v = [...values].sort((a, b) => a - b), q = [];
//   for (let i = 1; i < k; i++) {
//     const p = i / k, idx = p * (v.length - 1), lo = Math.floor(idx), hi = Math.ceil(idx);
//     q.push(lo === hi ? v[lo] : v[lo] * (hi - idx) + v[hi] * (idx - lo));
//   }
//   return q;
// }

// function equalBreaks(min, max, k = 6) {
//   const step = (max - min) / k;
//   return Array.from({ length: k - 1 }, (_, i) => min + step * (i + 1));
// }

// function makeColorer(values, scheme = "reds", invert = false, mode = "quantile") {
//   const pal = [...palettes[scheme]];
//   if (invert) pal.reverse();
//   const k = pal.length;
//   const min = Math.min(...values), max = Math.max(...values);
//   const cuts = (mode === "equal") ? equalBreaks(min, max, k) : quantiles(values, k);
//   const color = (v) => {
//     if (!Number.isFinite(v) || max === min) return "#6b7280";
//     let idx = cuts.findIndex(c => v <= c);
//     if (idx < 0) idx = k - 1;
//     return pal[idx];
//   };
//   return { color, cuts, min, max, pal };
// }

// /* ---------- geometry fetch with admin boundary preference ---------- */
// const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// const VIEWBOX = [-122.45, 37.60, -122.05, 37.98]; // minLon, minLat, maxLon, maxLat
// const cacheKey = "react-leaflet-city-geom-v2";

// const readCache = () => {
//   try { return new Map(Object.entries(JSON.parse(localStorage.getItem(cacheKey) || "{}"))); }
//   catch { return new Map(); }
// };
// const writeCache = (m) => localStorage.setItem(cacheKey, JSON.stringify(Object.fromEntries(m.entries())));
// const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// async function fetchCityGeom(name, cache) {
//   const key = name.toLowerCase();
//   if (cache.has(key)) return cache.get(key);

//   const params = new URLSearchParams({
//     city: name,
//     county: "Alameda County",
//     state: "California",
//     country: "USA",
//     format: "json",
//     polygon_geojson: "1",
//     limit: "5",
//     addressdetails: "1",
//     namedetails: "1",
//     extratags: "1",
//     dedupe: "1",
//     viewbox: VIEWBOX.join(","),
//     bounded: "1"
//   });

//   const r = await fetch(`${NOMINATIM}?${params.toString()}`);
//   if (!r.ok) throw new Error(`Nominatim error for ${name}`);
//   const results = await r.json();
//   if (!Array.isArray(results) || !results.length) throw new Error(`No boundary for ${name}`);

//   const isNameMatch = (o) => {
//     const n = name.toLowerCase();
//     const a = o.address || {};
//     const named = (o.namedetails?.name || o.display_name || "")
//       .toLowerCase()
//       .split(",")[0]
//       .trim();
//     return (
//       (a.city && a.city.toLowerCase() === n) ||
//       (a.town && a.town.toLowerCase() === n) ||
//       (a.municipality && a.municipality.toLowerCase() === n) ||
//       named === n
//     );
//   };

//   const adminPreferred = results.filter(o =>
//     o.class === "boundary" &&
//     o.type === "administrative" &&
//     (o.extratags?.admin_level === "7" || o.extratags?.admin_level === "8") &&
//     isNameMatch(o)
//   );

//   const placeFallback = results.filter(o =>
//     o.class === "place" &&
//     ["city", "town", "village", "suburb"].includes(o.type) &&
//     isNameMatch(o)
//   );

//   const best = adminPreferred[0] || placeFallback[0] || results[0];

//   const feat = { type: "Feature", properties: { name, display_name: best.display_name }, geometry: best.geojson };
//   cache.set(key, feat);
//   writeCache(cache);
//   return feat;
// }

// /* ---------- legend control ---------- */
// function Legend({ scale }) {
//   const map = useMap();
//   const ref = useRef(null);

//   useEffect(() => {
//     if (!scale) return;
//     const { cuts, min, max, pal } = scale;

//     const ctrl = L.control({ position: "bottomright" });
//     ctrl.onAdd = function () {
//       const div = L.DomUtil.create("div");
//       Object.assign(div.style, {
//         background: "rgba(17,19,23,0.92)",
//         color: "#fff",
//         padding: "10px 12px",
//         border: "1px solid #2d3748",
//         borderRadius: "10px",
//         fontSize: "12px",
//         boxShadow: "0 2px 10px rgba(0,0,0,.25)"
//       });
//       div.innerHTML = "<b>Value (classes)</b>";
//       const edges = [min, ...cuts, max];
//       for (let i = 0; i < pal.length; i++) {
//         const row = L.DomUtil.create("div", "", div);
//         Object.assign(row.style, {
//           display: "grid",
//           gridTemplateColumns: "14px auto",
//           gap: "8px",
//           alignItems: "center",
//           margin: "4px 0"
//         });
//         const sw = L.DomUtil.create("div", "", row);
//         Object.assign(sw.style, {
//           width: "14px",
//           height: "14px",
//           borderRadius: "3px",
//           border: "1px solid rgba(255,255,255,.12)",
//           background: pal[i]
//         });
//         const lbl = L.DomUtil.create("div", "", row);
//         lbl.textContent = `${fmt(edges[i])} - ${fmt(edges[i + 1])}`;
//       }
//       return div;
//     };
//     ctrl.addTo(map);
//     ref.current = ctrl;
//     return () => { ctrl.remove(); };
//   }, [map, scale]);

//   return null;
// }

// /* ---------- fit to features ---------- */
// function FitToFeatures({ features }) {
//   const map = useMap();
//   useEffect(() => {
//     if (!features.length) return;
//     const b = L.latLngBounds([]);
//     features.forEach(({ feature }) => {
//       try { b.extend(L.geoJSON(feature).getBounds()); } catch (e) {}
//     });
//     if (b.isValid()) map.fitBounds(b.pad(0.08));
//   }, [features, map]);
//   return null;
// }

// /* ---------- main component ---------- */
// export default function BerkeleyChoropleth() {
//   const defaultText =
// `Berkeley=2000
// Alameda=1500
// Oakland=1200
// Emeryville=1600
// Albany=1400`;

//   const [text, setText] = useState(defaultText);
//   const [scheme, setScheme] = useState("reds");
//   const [invert, setInvert] = useState(false);
//   const [mode, setMode] = useState("quantile");
//   const [features, setFeatures] = useState([]);
//   const [failed, setFailed] = useState([]);

//   const entries = useMemo(() => parseInput(text).sort(by("name")), [text]);
//   const values  = useMemo(() => entries.map(e => e.value), [entries]);
//   const scale   = useMemo(() => values.length ? makeColorer(values, scheme, invert, mode) : null,
//                           [values, scheme, invert, mode]);

//   useEffect(() => {
//     let cancelled = false;
//     const cache = readCache();
//     (async () => {
//       const out = [], misses = [];
//       for (let i = 0; i < entries.length; i++) {
//         const { name, value } = entries[i];
//         try {
//           const feat = await fetchCityGeom(name, cache);
//           out.push({ feature: feat, value, name });
//         } catch (e) {
//           misses.push(name);
//         }
//         const next = entries[i + 1];
//         if (next && !cache.has(next.name.toLowerCase())) await sleep(1100);
//       }
//       if (!cancelled) { setFeatures(out); setFailed(misses); }
//     })();
//     return () => { cancelled = true; };
//   }, [entries]);

//   return (
//     <div style={{ height: "100vh", width: "100%", position: "relative" }}>
//       {/* control panel */}
//       <div
//         style={{
//           position: "absolute",
//           zIndex: 1000,
//           top: 12,
//           left: 12,
//           maxWidth: 360,
//           background: "rgba(255,255,255,0.95)",
//           border: "1px solid #e5e7eb",
//           borderRadius: 12,
//           padding: 12,
//           boxShadow: "0 4px 12px rgba(0,0,0,.15)",
//           color: "#111"
//         }}
//       >
//         <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>Berkeley Area Choropleth</h1>
//         <p style={{ margin: "0 0 8px", fontSize: 12, color: "#4b5563" }}>
//           Paste <b>City=Value</b> lines. Values can be rent, COL, etc.
//         </p>

//         <div style={{ marginBottom: 8 }}>
//           <label style={{ fontSize: 12, color: "#6b7280" }}>Data (one per line)</label>
//           <textarea
//             value={text}
//             onChange={(e) => setText(e.target.value)}
//             spellCheck={false}
//             style={{
//               width: "100%",
//               height: 90,
//               fontFamily: "ui-monospace, Menlo, Consolas, Courier New, monospace",
//               border: "1px solid #e5e7eb",
//               borderRadius: 10,
//               padding: 8
//             }}
//             placeholder={"Berkeley=2000\nAlameda=1500\nOakland=1200"}
//           />
//           <div style={{ fontSize: 12, color: "#6b7280" }}>Tip: "$" and commas are OK.</div>
//         </div>

//         <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
//           <select value={scheme} onChange={(e) => setScheme(e.target.value)}>
//             <option value="reds">Reds (higher = darker)</option>
//             <option value="greens">Greens (higher = darker)</option>
//             <option value="viridis">Viridis</option>
//           </select>
//           <select value={mode} onChange={(e) => setMode(e.target.value)}>
//             <option value="quantile">Quantiles (6)</option>
//             <option value="equal">Equal intervals (6)</option>
//           </select>
//           <label style={{ fontSize: 12 }}>
//             <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> invert
//           </label>
//         </div>

//         {failed.length > 0 && (
//           <div
//             style={{
//               fontSize: 12,
//               color: "#92400e",
//               background: "#fef3c7",
//               border: "1px solid #f59e0b",
//               padding: "6px 8px",
//               borderRadius: 8
//             }}
//           >
//             No boundary found for: {failed.join(", ")}
//           </div>
//         )}
//         <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
//           OSM/Nominatim boundaries - locally cached
//         </div>
//       </div>

//       {/* map */}
// <MapContainer
//   center={[37.87, -122.27]}   // Berkeley
//   zoom={12}
//   bounds={[[37.60, -122.45], [37.98, -122.05]]}  // still okay to keep
//   style={{ height: "100%", width: "100%" }}
// >
//         <TileLayer
//           url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
//           attribution="&copy; OpenStreetMap"
//           maxZoom={19}
//         />
//         {scale && features.map(({ feature, value }, idx) => (
//           <GeoJSON
//             key={idx}
//             data={feature}
//             style={{
//               color: "#111827",
//               weight: 1,
//               opacity: 0.9,
//               fillColor: scale.color(value),
//               fillOpacity: 0.55
//             }}
//           />
//         ))}
//         {scale && <Legend scale={scale} />}
//         <FitToFeatures features={features} />
//       </MapContainer>
//     </div>
//   );
// }


import { MapContainer, TileLayer } from "react-leaflet";
import "react";

export default function App() {
  return (
    <MapContainer
      className="leaflet-map"
      center={[37.87, -122.27]}  // Berkeley
      zoom={12}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        maxZoom={19}
      />
    </MapContainer>
  );
}
