// Daily station game, logic only. Every value that changes from city to city comes from CITY, which the city's
// data file defines next to STATIONS (which lines stop where), COORDS (where each station sits) and LINES (stop order).
// The page pastes this file byte for byte.
"use strict";

const GAME_CITY = typeof CITY !== "undefined" ? CITY : {};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function longDate(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear();
}
function joinAnd(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }

// The city's values in one place. CITY.lines is the line order the page uses, each with its colour.
// CITY.mapOnlyColors colours segments that are drawn on the map but are not lines a station is tagged with.
const GAME = (function (c) {
  const lines = Array.isArray(c.lines) ? c.lines : [];
  const order = lines.map(l => l.name);
  const colors = {};
  lines.forEach(l => { colors[l.name] = l.color; });
  const start = typeof c.start === "string" ? c.start : "";
  const name = c.game || "Station Game";
  return {
    name,
    system: c.system || "the trains",
    timeName: c.timeName || "local",
    timeZone: c.timeZone || "UTC",
    start,
    seed: typeof c.seed === "number" ? c.seed : 1,
    page: c.page || "",
    storageKey: c.storageKey || name.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".v1",
    lineOrder: order,
    colors,
    mapColors: Object.assign({}, colors, c.mapOnlyColors || {}),
    lineExamples: order.length > 3 ? order.slice(0, 3).join(", ") + " and the rest" : joinAnd(order),
    published: start ? longDate(start) : "",
    startWords: start ? longDate(start).replace(/, \d+$/, "") : "",
    mapK: typeof c.mapK === "number" ? c.mapK : null,
  };
})(GAME_CITY);

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
  // A station marked "answer": false (closed for works, say) can be guessed and counted through, but is never the answer.
  return { linesAt, adj, rep, names: stations.map(s => s.station), pool: stations.filter(s => s.answer !== false).map(s => s.station) };
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

// Same answer for everyone on a date: a fixed shuffle of the stations that can be answers, one per day from day 1.
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
  const order = shuffled(g.pool || g.names, seed);
  const n = dayNumber(isoDate, startIso);
  return order[((n - 1) % order.length + order.length) % order.length];
}

// What a row says, from CITY.row. A city file that leaves it out gets the bands ending at 1, 3, 6, 10 and 15 stops
// (then 16 or more), eight compass points, and a lines column that names every shared line.
const GAME_ROW = (function (r) {
  return {
    bandEnds: Array.isArray(r.bandEnds) ? r.bandEnds.slice() : [1, 3, 6, 10, 15],
    points: r.points === 4 ? 4 : 8,
    lines: r.lines === "yesno" ? "yesno" : "all",
  };
})(GAME_CITY.row || {});

// Stops in bands, as a row says them, so a first guess doesn't solve the day. feedback keeps the exact number
// (the map, the checks and the counts use it). 0 (a free walkway) and -1 (not connected) are not banded: null.
// Each band runs from one past the end before it to its own end; past the last end it is "or more".
function band(stops) {
  if (!(stops >= 1)) return null;
  let lo = 1;
  for (const hi of GAME_ROW.bandEnds) {
    if (stops <= hi) return lo === hi ? hi + (hi === 1 ? " stop away" : " stops away") : lo + " to " + hi + " stops away";
    lo = hi + 1;
  }
  return lo + " or more stops away";
}

// The lines column: the shared lines, or "No shared lines" when there are none. With CITY.row.lines "yesno" it says
// only whether the two stations share a line.
function linesValue(shared) {
  if (GAME_ROW.lines === "yesno") return shared.length ? "shares a line" : "no shared line";
  return shared.length ? shared : "No shared lines";
}

// Share text: one line per guess, a square per shared line count and the stops, no station names.
// A wrong row can carry its compass word (r.point), shortened to N, NE, E, SE, S, SW, W or NW after the stops.
const SHORT_POINT = { "north": "N", "north-east": "NE", "east": "E", "south-east": "SE", "south": "S", "south-west": "SW", "west": "W", "north-west": "NW" };
function shareText(dayNo, results, maxTries) {
  const won = results.length && results[results.length - 1].correct;
  const head = GAME.name + " #" + dayNo + " " + (won ? results.length : "X") + "/" + maxTries;
  const rows = results.map(r => r.correct ? "\u{1F7E9} here" : (r.shared.length ? "\u{1F7E8}" : "⬜") + " " + (r.stops > 1 ? band(r.stops).replace(/ away$/, "") : r.stops + (r.stops === 1 ? " stop" : " stops")) + (r.point && SHORT_POINT.hasOwnProperty(r.point) ? " " + SHORT_POINT[r.point] : ""));
  return [head].concat(rows).join("\n");
}

// Map: a flat projection so every point can be checked by hand. Longitude is squeezed by K, the cosine of the
// stations' mean latitude, unless CITY.mapK sets K. P is the padding. Stations without a lat and lon are left off.
const MAP_P = 10;
function hasPoint(c) { return !!c && typeof c.lat === "number" && typeof c.lon === "number" && isFinite(c.lat) && isFinite(c.lon); }
function mapK(ok) {
  if (GAME.mapK !== null) return GAME.mapK;
  let sumLat = 0;
  for (const c of ok) sumLat += c.lat;
  return ok.length ? Math.cos(sumLat / ok.length * Math.PI / 180) : 1;
}
function mapLayout(coords, W) {
  const ok = coords.filter(hasPoint);
  const pts = new Map();
  if (!ok.length) return { pts, width: W, height: 2 * MAP_P, k: 1 };
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const c of ok) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lon < minLon) minLon = c.lon;
    if (c.lon > maxLon) maxLon = c.lon;
  }
  const K = mapK(ok);
  const span = (maxLon - minLon) * K;
  const s = span > 0 ? (W - 2 * MAP_P) / span : 1;
  for (const c of ok) pts.set(c.station, { x: MAP_P + (c.lon - minLon) * K * s, y: MAP_P + (maxLat - c.lat) * s });
  return { pts, width: W, height: 2 * MAP_P + (maxLat - minLat) * s, k: K };
}

// Compass clue: degrees clockwise from north, from one point to another, on the same flat projection as the map,
// with the K mapLayout uses for this city's COORDS (CITY.mapK when set). null if either point has no lat and lon.
let COMPASS_K = null;
function bearing(from, to) {
  if (!hasPoint(from) || !hasPoint(to)) return null;
  if (COMPASS_K === null) COMPASS_K = mapK(typeof COORDS !== "undefined" && Array.isArray(COORDS) ? COORDS.filter(hasPoint) : []);
  const dx = (to.lon - from.lon) * COMPASS_K, dy = to.lat - from.lat;
  const d = Math.atan2(dx, dy) * 180 / Math.PI;
  return d < 0 ? d + 360 : d;
}

// Eight points, each 45 degrees wide and centred on its point, so north runs from 337.5 up to 22.5.
// With CITY.row.points 4, four points 90 degrees wide, north from 315 up to 45. A bearing on the edge between two
// points takes the one clockwise of it, so 45 is east.
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const COMPASS4 = ["north", "east", "south", "west"];
function compassPoint(deg) {
  if (GAME_ROW.points === 4) return COMPASS4[Math.floor((((deg % 360) + 360) % 360 + 45) / 90) % 4];
  return COMPASS[Math.floor((((deg % 360) + 360) % 360 + 22.5) / 45) % 8];
}

const MAP_COLORS = GAME.mapColors;

// SVG string: every segment as a thin line in its colour, the answer ring once the game is over
// (drawn under the guesses so a right guess keeps its number), then one numbered dot per guess.
// Once over, each guess and the answer also get a name label, the station name with its bracketed part removed.
// exampleName, when given, is the example guess: one faint dot numbered 1 there, the size of a guess dot.
function mapSvg(layout, lines, guesses, answer, over, exampleName) {
  const f = v => String(Math.round(v * 10) / 10);
  const esc = n => String(n).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(layout.width) + " " + f(layout.height) + '" width="100%" style="overflow:visible" role="img" aria-label="Map of ' + esc(GAME.system) + ' with your guesses">'];
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
  const ex = exampleName ? layout.pts.get(exampleName) : null;
  if (ex) {
    out.push('<circle class="guess example" cx="' + f(ex.x) + '" cy="' + f(ex.y) + '" r="7.5" fill="#bbbbbb" stroke="#ffffff" stroke-width="1.5"/>');
    out.push('<text x="' + f(ex.x) + '" y="' + f(ex.y + 3.5) + '" text-anchor="middle" font-size="10" font-weight="700" font-family="sans-serif" fill="#ffffff">1</text>');
  }
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

if (typeof module !== "undefined") module.exports = { buildGraph, stopsAway, feedback, dayNumber, shuffled, answerFor, shareText, mapLayout, mapSvg, MAP_COLORS, GAME, longDate, bearing, compassPoint, band };
