const $ = id => document.getElementById(id);
const PAL = {
  Original: { card: "#d9d9d9", ink: "#111", bar: "#2b2b2b", ring: "#7a7a7a" },
  Dusk: { card: "#2b2447", ink: "#f1ecff", bar: "#b9a4ff", ring: "#6d5bd0" },
  Mint: { card: "#cfe8dc", ink: "#0f2a22", bar: "#1f5a46", ring: "#5d9a84" },
  Ember: { card: "#3a1f1a", ink: "#ffe8dc", bar: "#ff8a5c", ring: "#a8472a" }
};
const MIME = { mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac" };
const PAUSE = '<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="5" height="17" rx="1"/><rect x="14" y="3.5" width="5" height="17" rx="1"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24"><path d="M7 3.8v16.4a.9.9 0 0 0 1.4.8l13-8.2a.9.9 0 0 0 0-1.5l-13-8.2A.9.9 0 0 0 7 3.8z"/></svg>';
const LOOP_ALL = '<svg class="ico s" viewBox="0 0 24 24"><path d="M7 7h10a3 3 0 0 1 3 3v1M17 17H7a3 3 0 0 1-3-3v-1"/><path d="M15 4l3 3-3 3M9 14l-3 3 3 3"/></svg>';
const LOOP_ONE = LOOP_ALL.replace("</svg>", '<path d="M11 10.6l1.5-1v5.4"/></svg>');
const LOOP_LABEL = ["Loop off", "Loop all songs", "Loop current song"];

const FADE_OUT = 0.35; // seconds
const FADE_IN = 0.4;

// Track shape: { name, path, cover }. `cover` = album-art URL; null = neutral placeholder.
const tracks = [];
const audio = new Audio();
let idx = 0, want = false, playing = false, loop = 0; // loop: 0 off, 1 all, 2 one
let blobUrl = null, loadId = 0, pauseT = 0, liveT = 0;
let ctx, gain, volGain, analyser, data;

// ---------- theme ----------
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, s * 100, l * 100];
}
// One picked colour becomes the card; text, bars and cover ring are derived from it.
function derive(hex) {
  const [r, g, b] = hexToRgb(hex), [h, s, l] = rgbToHsl(r, g, b);
  const dark = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5, k = s < 8 ? 0 : 1;
  const hs = (sat, l) => `hsl(${h.toFixed(0)} ${sat * k}% ${l}%)`;
  return {
    card: hex,
    ink: dark ? hs(60, 94) : hs(30, 8),
    bar: dark ? hs(Math.max(s, 60), 74) : hs(Math.max(s, 50), 24),
    // ring is always pushed well away from the card's own lightness so the cover never blends in
    ring: dark ? hs(Math.max(s * 0.8, 40), Math.max(58, Math.min(l + 30, 85))) : hs(Math.max(s * 0.6, 30), Math.min(42, Math.max(l - 30, 10)))
  };
}
function applyPalette(n, hex, live) {
  const p = n === "Custom" ? derive(hex || "#6d5bd0") : (PAL[n] || PAL.Original);
  for (const k in p) $("card").style.setProperty("--" + k, p[k]);
  if (live) { // snappy colour changes while dragging the wheel
    $("card").classList.add("live");
    clearTimeout(liveT);
    liveT = setTimeout(() => $("card").classList.remove("live"), 300);
  }
}
function setCover(url) { $("cov").hidden = !url; $("ph").hidden = !!url; if (url) $("cov").src = url; }

// ---------- state / UI ----------
function sync() {
  $("play").innerHTML = want ? PAUSE : PLAY;
  $("play").setAttribute("aria-label", want ? "Pause" : "Play");
  $("card").classList.toggle("playing", want);
  $("rep").innerHTML = loop === 2 ? LOOP_ONE : LOOP_ALL;
  $("rep").classList.toggle("dim", loop === 0);
  $("rep").setAttribute("aria-label", LOOP_LABEL[loop]);
  $("rep").title = LOOP_LABEL[loop];
  audio.loop = loop === 2; // gapless single-song loop
}

// ---------- audio (with fades) ----------
function ensureCtx() {
  if (ctx) return;
  ctx = new AudioContext();
  const src = ctx.createMediaElementSource(audio);
  gain = ctx.createGain();
  gain.gain.value = 0;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  analyser.minDecibels = -85;
  analyser.maxDecibels = -25;
  src.connect(gain);        // volume fades happen here, so the waveform fades with the sound
  gain.connect(analyser);
  volGain = ctx.createGain();   // volume sits after the analyser so the waveform doesn't shrink when you turn it down
  analyser.connect(volGain);
  volGain.connect(ctx.destination);
  applyVolume();
  data = new Uint8Array(analyser.frequencyBinCount);
  makeBands();
}
function fadeTo(v, sec) {
  if (!gain) return;
  const g = gain.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(v, t + sec);
}
function play() {
  ensureCtx();
  ctx.resume();
  want = true;
  clearTimeout(pauseT);
  audio.play().catch(() => {});
  fadeTo(1, FADE_IN);
  sync();
}
function pause() {
  want = false;
  sync();
  fadeTo(0, FADE_OUT);
  clearTimeout(pauseT);
  pauseT = setTimeout(() => { if (!want) audio.pause(); }, FADE_OUT * 1000 + 30);
}

async function load(i, go) {
  if (!tracks.length) return;
  idx = (i + tracks.length) % tracks.length;
  const t = tracks[idx], my = ++loadId;
  setTitle(t.name);
  setCover(t.cover);
  if (!go) want = false;
  sync();
  const buf = await api.readFile(t.path);
  if (my !== loadId) return;
  const ext = t.path.split(".").pop().toLowerCase();
  const url = URL.createObjectURL(new Blob([buf], { type: MIME[ext] || "audio/mpeg" }));
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = url;
  audio.src = url;
  if (go) play();
}

async function addSongs() {
  const paths = await api.openFiles();
  if (!paths.length) return;
  const wasEmpty = !tracks.length;
  for (const p of paths) tracks.push({ name: p.split(/[\\/]/).pop().replace(/\.[^.]+$/, ""), path: p, cover: null });
  if (wasEmpty) load(0, true);
}

audio.addEventListener("play", () => { playing = true; });
audio.addEventListener("pause", () => { playing = false; });
audio.addEventListener("ended", () => { // only fires when single-song loop is off
  if (loop === 1 && tracks.length === 1) { audio.currentTime = 0; play(); }
  else if (loop === 1 || idx < tracks.length - 1) load(idx + 1, true);
  else load(0, false); // end of queue: stop on the first song
});

$("play").onclick = () => {
  if (!tracks.length) return addSongs();
  want ? pause() : play();
};
$("queue").onclick = addSongs;
$("next").onclick = () => load(idx + 1, want);
$("prev").onclick = () => (audio.currentTime > 3 ? (audio.currentTime = 0) : load(idx - 1, want));
$("rep").onclick = () => { loop = (loop + 1) % 3; sync(); }; // off -> all -> one -> off
$("bar").onclick = e => {
  if (!audio.duration) return;
  const r = $("bar").getBoundingClientRect();
  audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
};

// ---------- volume ----------
const VOL_ICON = {
  body: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/>',
  low: '<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/>',
  high: '<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18 7a7 7 0 0 1 0 10"/>',
  mute: '<path d="M16 9.5l5 5M21 9.5l-5 5"/>'
};
let volume = 0.8, muted = false, volSaveT = 0, volShowT = 0;
function applyVolume() {
  const v = muted ? 0 : volume;
  if (volGain) volGain.gain.setTargetAtTime(v * v, ctx.currentTime, 0.02); // squared = feels natural to the ear
  const s = $("vslider");
  s.value = Math.round(v * 100);
  s.style.setProperty("--p", s.value + "%");
  const kind = v === 0 ? "mute" : v < 0.5 ? "low" : "high";
  $("vbtn").innerHTML = '<svg viewBox="0 0 24 24">' + VOL_ICON.body + (kind === "mute" ? VOL_ICON.mute : kind === "low" ? VOL_ICON.low : VOL_ICON.high) + "</svg>";
  $("vbtn").setAttribute("aria-label", v === 0 ? "Unmute" : "Mute");
}
function setVolume(v, flash) {
  volume = Math.max(0, Math.min(1, v));
  muted = false;
  applyVolume();
  clearTimeout(volSaveT);
  volSaveT = setTimeout(() => api.setVolume(volume), 300);
  if (flash) { // scrolling shows the slider for a moment
    $("volbox").classList.add("show");
    clearTimeout(volShowT);
    volShowT = setTimeout(() => $("volbox").classList.remove("show"), 1200);
  }
}
$("vslider").addEventListener("input", e => setVolume(e.target.value / 100));
$("vbtn").onclick = () => {
  if (muted || volume === 0) { muted = false; if (volume === 0) volume = 0.5; }
  else muted = true;
  applyVolume();
};
$("card").addEventListener("wheel", e => { e.preventDefault(); setVolume(volume - Math.sign(e.deltaY) * 0.05, true); }, { passive: false });
applyVolume();

// Waveform: 31 mirrored bars. Bass sits in the centre, treble spreads to the edges.
// Tune the feel with these three numbers:
const SHAPE = 1.8;    // higher = calmer; only real peaks reach the top
const ATTACK = 0.35;  // how fast bars rise (0-1)
const RELEASE = 0.10; // how fast bars fall (lower = smoother)
const NB = 31, MID = 15;
const wave = $("wave");
const bars = Array.from({ length: NB }, () => wave.appendChild(document.createElement("i")));
const lvl = new Array(MID + 1).fill(0);
let bands = [], peak = 0.4;
function makeBands() {
  const hz = ctx.sampleRate / analyser.fftSize;
  const f = k => 60 * Math.pow(9000 / 60, k / (MID + 1));
  bands = [];
  for (let k = 0; k <= MID; k++) {
    const lo = Math.max(1, Math.floor(f(k) / hz));
    bands.push([lo, Math.max(lo + 1, Math.floor(f(k + 1) / hz))]);
  }
}
function frame() {
  let target = new Array(MID + 1).fill(0);
  if (playing && analyser) {
    analyser.getByteFrequencyData(data);
    const raw = bands.map(([lo, hi], k) => {
      let s = 0;
      for (let b = lo; b < hi; b++) s += data[b];
      return (s / (hi - lo) / 255) * (0.85 + 0.6 * (k / MID));
    });
    peak = Math.max(0.35, peak * 0.995, ...raw); // slow auto-gain so loud sections don't pin every bar
    target = raw.map((v, k) => {
      const sm = 0.25 * raw[Math.max(0, k - 1)] + 0.5 * v + 0.25 * raw[Math.min(MID, k + 1)];
      return Math.pow(Math.min(1, sm / peak), SHAPE);
    });
  }
  for (let k = 0; k <= MID; k++) lvl[k] += (target[k] - lvl[k]) * (target[k] > lvl[k] ? ATTACK : RELEASE);
  bars.forEach((b, i) => {
    const k = Math.abs(i - MID);
    b.style.height = (1.2 + lvl[k] * 15 * (1 - 0.4 * (k / MID))) + "cqw";
  });
  $("dot").style.left = (audio.duration ? (audio.currentTime / audio.duration) * 100 : 0) + "%";
  requestAnimationFrame(frame);
}

// Title: fixed-size box. Short names sit centred; long names scroll in from the right and out to the left.
let lastTitle = "";
function setTitle(text) {
  lastTitle = text;
  const tt = $("tt"), s = $("title");
  s.textContent = text;
  tt.classList.remove("scroll");
  requestAnimationFrame(() => {
    const box = tt.clientWidth, w = s.offsetWidth;
    if (w > box) {
      const SPEED = 48; // pixels per second
      tt.style.setProperty("--from", box + "px");
      tt.style.setProperty("--to", -w + "px");
      tt.style.setProperty("--dur", (box + w) / SPEED + "s");
      tt.classList.add("scroll");
    }
  });
}
document.fonts.ready.then(() => setTitle(lastTitle));

// Drag the widget by grabbing any empty part of the card.
$("card").addEventListener("mousedown", e => {
  if (e.button !== 0 || e.target.closest("button,.bar,input")) return;
  const sx = e.screenX, sy = e.screenY;
  api.dragStart();
  dragging = true;
  const mv = m => api.dragMove(m.screenX - sx, m.screenY - sy);
  const up = () => { dragging = false; removeEventListener("mousemove", mv); removeEventListener("mouseup", up); };
  addEventListener("mousemove", mv);
  addEventListener("mouseup", up);
});
addEventListener("contextmenu", e => { e.preventDefault(); api.menu(); });

// ---------- decoration mode (capsule with only the waveform) ----------
// The window never resizes (resizing a transparent window makes it flicker on Windows). It stays the size
// of the full widget; in decoration mode the card just shrinks inside it, and the empty transparent area is
// click-through so it doesn't block whatever is behind it.
const CAP_W = 380, CAP_H = 122, MS = 560;
const wait = ms => new Promise(r => setTimeout(r, ms));
let mode = "widget", busy = false, widgetH = 0, widgetRadius = "";
let through = false, dragging = false;

function setThrough(v) { if (v !== through) { through = v; api.passThrough(v); } }
addEventListener("mousemove", e => { if (!dragging) setThrough(!e.target.closest("#card")); });

function measure() { const c = $("card"); widgetH = c.offsetHeight; widgetRadius = getComputedStyle(c).borderRadius; }
function setDecoStyles() {
  const c = $("card"), w = $("wave");
  c.style.width = CAP_W + "px";
  c.style.height = CAP_H + "px";
  c.style.borderRadius = CAP_H / 2 + "px";
  w.style.transform = `translateY(${CAP_H / 2 - (w.offsetTop + w.offsetHeight / 2)}px)`; // slide waveform to the capsule's centre
}
async function toDeco() {
  if (mode === "deco" || busy) return;
  busy = true; api.setMode("deco");
  const c = $("card");
  measure();
  c.style.width = c.offsetWidth + "px"; c.style.height = widgetH + "px"; c.style.borderRadius = widgetRadius;
  void c.offsetWidth;
  document.body.classList.add("anim", "deco");
  setDecoStyles();
  await wait(MS + 40);
  document.body.classList.remove("anim");
  mode = "deco"; busy = false;
}
async function toWidget() {
  if (mode === "widget" || busy) return;
  busy = true; api.setMode("widget");
  const c = $("card");
  document.body.classList.add("anim", "expanding");
  document.body.classList.remove("deco");
  c.style.width = "420px"; c.style.height = widgetH + "px"; c.style.borderRadius = widgetRadius;
  $("wave").style.transform = "";
  await wait(MS + 340);
  c.style.width = c.style.height = c.style.borderRadius = "";
  document.body.classList.remove("anim", "expanding");
  mode = "widget"; busy = false;
}

api.on("toggle-mode", () => (mode === "deco" ? toWidget() : toDeco()));
api.on("toggle", () => $("play").click());
api.on("add", addSongs);
api.on("palette", applyPalette);
api.settings().then(s => {
  applyPalette(s.palette, s.customColor);
  if (typeof s.volume === "number") { volume = s.volume; applyVolume(); }
});

measure();
api.fit(440, widgetH + 20); // the one and only window resize: fit the full widget once at launch
setThrough(true);           // click-through until the pointer is over the card
if (new URLSearchParams(location.search).get("mode") === "deco") { // launched in decoration mode: no animation
  document.body.classList.add("boot", "deco");
  setDecoStyles();
  mode = "deco";
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("boot")));
}
setTitle("Add songs to start");
sync();
requestAnimationFrame(frame);
