// Daily L station game, logic only. Data: stations.json (which lines stop where) and lines.json (stop order),
// both from Wikipedia under CC BY-SA 4.0. No CTA data. The page pastes this file byte for byte.
"use strict";

function buildGraph(stations, lines) {
  const linesAt = new Map(stations.map(s => [s.station, s.lines.slice()]));
  // A free walking transfer joins two stations into one node, so it costs no stops.
  const parent = new Map(stations.map(s => [s.station, s.station]));
  const rep = n => { while (parent.get(n) !== n) n = parent.get(n); return n; };
  for (const [a, b] of lines.transfers || []) {
    if (parent.has(a) && parent.has(b)) parent.set(rep(b), rep(a));
  }
  const adj = new Map(stations.map(s => [rep(s.station), new Set()]));
  for (const seg of lines.segments) {
    for (let i = 1; i < seg.stops.length; i++) {
      const a = seg.stops[i - 1], b = seg.stops[i];
      if (!parent.has(a) || !parent.has(b)) continue;
      const ra = rep(a), rb = rep(b);
      if (ra === rb) continue;
      adj.get(ra).add(rb);
      adj.get(rb).add(ra);
    }
  }
  return { linesAt, adj, rep, names: stations.map(s => s.station) };
}

// Fewest stops between two stations, riding any line. -1 if not connected.
function stopsAway(g, fromName, toName) {
  const from = g.rep(fromName), to = g.rep(toName);
  if (from === to) return 0;
  const seen = new Set([from]);
  let frontier = [from], d = 0;
  while (frontier.length) {
    d++;
    const next = [];
    for (const s of frontier) {
      for (const n of g.adj.get(s) || []) {
        if (n === to) return d;
        if (!seen.has(n)) { seen.add(n); next.push(n); }
      }
    }
    frontier = next;
  }
  return -1;
}

function feedback(g, guess, answer) {
  const gl = g.linesAt.get(guess) || [], al = g.linesAt.get(answer) || [];
  return {
    correct: guess === answer,
    shared: gl.filter(l => al.includes(l)),
    stops: stopsAway(g, guess, answer),
  };
}

// Same answer for everyone on a date: a fixed shuffle of the station list, one per day from day 1.
function dayNumber(isoDate, startIso) {
  const ms = Date.parse(isoDate + "T00:00:00Z") - Date.parse(startIso + "T00:00:00Z");
  return Math.floor(ms / 86400000) + 1;
}

function shuffled(names, seed) {
  const a = names.slice().sort();
  let x = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const j = x % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function answerFor(g, isoDate, startIso, seed) {
  const order = shuffled(g.names, seed);
  const n = dayNumber(isoDate, startIso);
  return order[((n - 1) % order.length + order.length) % order.length];
}

// Share text: one line per guess, a square per shared line count and the stops, no station names.
function shareText(dayNo, results, maxTries) {
  const won = results.length && results[results.length - 1].correct;
  const head = "L Stop #" + dayNo + " " + (won ? results.length : "X") + "/" + maxTries;
  const rows = results.map(r => r.correct ? "\u{1F7E9} here" : (r.shared.length ? "\u{1F7E8}" : "⬜") + " " + r.stops + (r.stops === 1 ? " stop" : " stops"));
  return [head].concat(rows).join("\n");
}

// Map: a flat projection with fixed constants so every point can be checked by hand (EXPECTED-MAP.md).
// K is cos(41.88 degrees), P the padding. Stations without a lat and lon are left off.
const MAP_K = 0.7445, MAP_P = 10;
function mapLayout(coords, W) {
  const ok = coords.filter(c => c && typeof c.lat === "number" && typeof c.lon === "number" && isFinite(c.lat) && isFinite(c.lon));
  const pts = new Map();
  if (!ok.length) return { pts, width: W, height: 2 * MAP_P };
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const c of ok) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lon < minLon) minLon = c.lon;
    if (c.lon > maxLon) maxLon = c.lon;
  }
  const span = (maxLon - minLon) * MAP_K;
  const s = span > 0 ? (W - 2 * MAP_P) / span : 1;
  for (const c of ok) pts.set(c.station, { x: MAP_P + (c.lon - minLon) * MAP_K * s, y: MAP_P + (maxLat - c.lat) * s });
  return { pts, width: W, height: 2 * MAP_P + (maxLat - minLat) * s };
}

const MAP_COLORS = { Red: "#c60c30", Blue: "#00a1de", Brown: "#62361b", Green: "#009b3a", Orange: "#f9461c", Pink: "#e27ea6", Purple: "#522398", Yellow: "#f9e300", Loop: "#565a5c" };

// SVG string: every segment as a thin line in its colour, the answer ring once the game is over
// (drawn under the guesses so a right guess keeps its number), then one numbered dot per guess.
// Once over, each guess and the answer also get a name label, the station name with its bracketed part removed.
function mapSvg(layout, lines, guesses, answer, over) {
  const f = v => String(Math.round(v * 10) / 10);
  const out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(layout.width) + " " + f(layout.height) + '" width="100%" style="overflow:visible" role="img" aria-label="Map of the L with your guesses">'];
  for (const seg of lines.segments) {
    const ps = seg.stops.map(n => layout.pts.get(n)).filter(Boolean);
    if (ps.length < 2) continue;
    out.push('<polyline fill="none" stroke="' + (MAP_COLORS[seg.line] || "#888888") + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" points="' + ps.map(p => f(p.x) + "," + f(p.y)).join(" ") + '"/>');
  }
  if (over) {
    const a = layout.pts.get(answer);
    if (a) out.push('<circle class="answer" cx="' + f(a.x) + '" cy="' + f(a.y) + '" r="12" fill="#ffffff" stroke="#000000" stroke-width="3"/>');
  }
  guesses.forEach((n, i) => {
    const p = layout.pts.get(n);
    if (!p) return;
    out.push('<circle class="guess" cx="' + f(p.x) + '" cy="' + f(p.y) + '" r="7.5" fill="#444444" stroke="#ffffff" stroke-width="1.5"/>');
    out.push('<text x="' + f(p.x) + '" y="' + f(p.y + 3.5) + '" text-anchor="middle" font-size="10" font-weight="700" font-family="sans-serif" fill="#ffffff">' + (i + 1) + "</text>");
  });
  if (over) {
    // Right of the dot, or left of it in the right half so the name stays on the map. A right guess is labelled once, as the answer.
    const plain = n => n.replace(/\s*\([^)]*\)\s*$/, "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const label = (n, gap, cls) => {
      const p = layout.pts.get(n);
      if (!p) return;
      const left = p.x > layout.width / 2;
      out.push('<text class="' + cls + '" x="' + f(left ? p.x - gap : p.x + gap) + '" y="' + f(p.y + 4) + '" text-anchor="' + (left ? "end" : "start") + '" font-size="11" font-family="sans-serif" fill="#1a1a1a" stroke="#ffffff" stroke-width="3" paint-order="stroke">' + plain(n) + "</text>");
    };
    new Set(guesses.filter(n => n !== answer)).forEach(n => label(n, 10, "label"));
    label(answer, 15, "label answer-label");
  }
  out.push("</svg>");
  return out.join("");
}

if (typeof module !== "undefined") module.exports = { buildGraph, stopsAway, feedback, dayNumber, shuffled, answerFor, shareText, mapLayout, mapSvg, MAP_COLORS };
