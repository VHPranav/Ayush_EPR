"use client";
import { useEffect, useRef } from "react";
import { isLand } from "@/lib/land-mask";

interface Dot { lat: number; lon: number; land: boolean; draw: boolean }

const BASE_R = 340; // dot sizes below are tuned for a globe of this radius and scaled to the real one

const DOTS = 40000;           // ~5-6px between dots at the login panel size
const SEA_EVERY = 3;          // only every 3rd ocean dot is drawn (faint backdrop, saves work)
const FRAME_MS = 1000 / 30;   // 30 fps is plenty for a slow rotation
const LAND_BUCKETS = 6;
const SEA_BUCKETS = 3;
const TILT = (-18 * Math.PI) / 180; // look slightly down on the northern hemisphere
const SPEED = 0.00007;              // radians per ms (~90 s per turn)

/** Evenly spread points on a sphere (Fibonacci lattice), each tagged land/sea. Computed once. */
function buildDots(): Dot[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: DOTS }, (_, i) => {
    const y = 1 - (i / (DOTS - 1)) * 2;
    const lat = Math.asin(y);
    const lon = ((i * golden + Math.PI) % (2 * Math.PI)) - Math.PI;
    const latDeg = (lat * 180) / Math.PI, lonDeg = (lon * 180) / Math.PI;
    return { lat, lon, land: isLand(latDeg, lonDeg), draw: i % SEA_EVERY === 0 };
  });
}

/** Slowly rotating dotted globe drawn on a canvas. Decorative; static when the user prefers reduced motion. */
export function DottedGlobe({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dots = buildDots();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let size = 0;
    let angle = 2.2; // start with Europe/Africa/Asia facing the viewer

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = Math.max(1, Math.round(Math.min(r.width, r.height)));
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const R = size * 0.4; // leaves room inside the canvas for the glow, so it is never clipped into a box
      ctx.clearRect(0, 0, w, h);
      if (R < 8) return; // panel hidden or not laid out yet (e.g. narrow window): nothing to draw
      const cx = w / 2, cy = h / 2;

      // soft halo + limb
      const halo = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 1.25);
      halo.addColorStop(0, "rgba(120, 220, 170, 0.14)");
      halo.addColorStop(1, "rgba(120, 220, 170, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(170, 240, 205, 0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      // Project every dot, then draw them in a few batches by depth (far = dim and small) instead of one
      // canvas path per dot: ~10k dots stay smooth.
      const cosT = Math.cos(TILT), sinT = Math.sin(TILT);
      const land: number[][] = Array.from({ length: LAND_BUCKETS }, () => []);
      const sea: number[][] = Array.from({ length: SEA_BUCKETS }, () => []);
      for (const d of dots) {
        // orthographic projection of (lat, lon - angle), then tilt about the x-axis
        const lon = d.lon - angle;
        const x0 = Math.cos(d.lat) * Math.sin(lon);
        const y0 = Math.sin(d.lat);
        const z0 = Math.cos(d.lat) * Math.cos(lon);
        const y1 = y0 * cosT - z0 * sinT;
        const z1 = y0 * sinT + z0 * cosT;
        if (z1 <= 0) continue; // far side
        if (!d.land && !d.draw) continue;
        const buckets = d.land ? land : sea;
        const bi = Math.min(buckets.length - 1, Math.floor(z1 * buckets.length));
        buckets[bi].push(cx + x0 * R, cy - y1 * R);
      }
      const paint = (buckets: number[][], rgb: string, minA: number, maxA: number, minR: number, maxR: number) => {
        buckets.forEach((pts, i) => {
          if (!pts.length) return;
          const t = (i + 0.5) / buckets.length; // 0 = rim, 1 = facing the viewer
          const r = (minR + (maxR - minR) * t) * (R / BASE_R);
          ctx.fillStyle = `rgba(${rgb}, ${minA + (maxA - minA) * t})`;
          ctx.beginPath();
          for (let k = 0; k < pts.length; k += 2) {
            ctx.moveTo(pts[k] + r, pts[k + 1]);
            ctx.arc(pts[k], pts[k + 1], r, 0, Math.PI * 2);
          }
          ctx.fill();
        });
      };
      paint(sea, "150, 225, 190", 0.07, 0.2, 0.5, 0.8);
      paint(land, "196, 249, 220", 0.45, 1, 0.75, 1.5);
    };

    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS) return;
      angle += (now - last) * SPEED;
      last = now;
      draw();
    };

    resize();
    draw();
    if (!reduced) raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
