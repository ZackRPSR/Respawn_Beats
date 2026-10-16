const $ = id => document.getElementById(id);
const cv = $("wheel"), c = cv.getContext("2d"), R = cv.width / 2;
let H = 260, S = 0.6, V = 0.8, down = false;

function hsv2rgb(h, s, v) {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)].map(x => Math.round(x * 255));
}
function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) h = (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return [(h + 360) % 360, mx ? d / mx : 0, mx];
}
const toHex = ([r, g, b]) => "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");

function drawWheel() {
  const img = c.createImageData(cv.width, cv.height);
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const dx = x - R + 0.5, dy = y - R + 0.5, r = Math.hypot(dx, dy), i = (y * cv.width + x) * 4;
    if (r > R) continue;
    const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    img.data.set([...hsv2rgb(h, r / R, V), 255], i);
  }
  c.putImageData(img, 0, 0);
}
function show(send) {
  const hex = toHex(hsv2rgb(H, S, V));
  const a = H * Math.PI / 180;
  $("mk").style.left = R + Math.cos(a) * S * R + "px";
  $("mk").style.top = R + Math.sin(a) * S * R + "px";
  $("sw").style.background = hex;
  $("hx").textContent = hex.toUpperCase();
  if (send) api.themeLive(hex);
}
function pick(e) {
  const b = cv.getBoundingClientRect();
  const dx = e.clientX - b.left - R, dy = e.clientY - b.top - R;
  H = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  S = Math.min(1, Math.hypot(dx, dy) / R);
  show(true);
}
cv.addEventListener("pointerdown", e => { down = true; cv.setPointerCapture(e.pointerId); pick(e); });
cv.addEventListener("pointermove", e => { if (down) pick(e); });
cv.addEventListener("pointerup", () => { down = false; });
$("v").addEventListener("input", e => { V = e.target.value / 100; drawWheel(); show(true); });
$("done").onclick = () => window.close();

api.settings().then(s => {
  const n = parseInt((s.customColor || "#6d5bd0").slice(1), 16);
  [H, S, V] = rgb2hsv(n >> 16 & 255, n >> 8 & 255, n & 255);
  $("v").value = Math.max(6, Math.round(V * 100));
  drawWheel();
  show(false);
});
