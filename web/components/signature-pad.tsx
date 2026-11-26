"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

export interface SignaturePadHandle {
  clear: () => void;
  /** PNG data URL of the drawing (transparent background), or null when nothing was drawn. */
  toDataUrl: () => string | null;
}

/** Finger / stylus / mouse signature box. Draws at device resolution so the signature stays sharp on the PDF. */
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (signed: boolean) => void; label: string }>(
  function SignaturePad({ onChange, label }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const drawn = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);

    const setup = useCallback(() => {
      const c = canvas.current;
      if (!c) return;
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      const { width, height } = c.getBoundingClientRect();
      const snapshot = drawn.current ? c.toDataURL() : null;
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
      const g = c.getContext("2d")!;
      g.scale(dpr, dpr);
      g.lineCap = "round";
      g.lineJoin = "round";
      g.lineWidth = 2.6;
      g.strokeStyle = "#14142b";
      if (snapshot) {
        const img = new Image();
        img.onload = () => g.drawImage(img, 0, 0, width, height);
        img.src = snapshot;
      }
    }, []);

    useEffect(() => {
      setup();
      window.addEventListener("resize", setup);
      return () => window.removeEventListener("resize", setup);
    }, [setup]);

    const point = (e: React.PointerEvent) => {
      const r = canvas.current!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    useImperativeHandle(ref, () => ({
      clear() {
        const c = canvas.current;
        if (!c) return;
        c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
        drawn.current = false;
        onChange?.(false);
      },
      toDataUrl: () => (drawn.current && canvas.current ? canvas.current.toDataURL("image/png") : null),
    }), [onChange]);

    return (
      <canvas
        ref={canvas}
        aria-label={label}
        role="img"
        className="h-56 w-full touch-none rounded-2xl border-2 border-dashed border-line-strong bg-white"
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = point(e);
          const g = canvas.current!.getContext("2d")!;
          g.beginPath();
          g.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
          g.fillStyle = "#14142b";
          g.fill();
        }}
        onPointerMove={e => {
          if (!last.current) return;
          const p = point(e);
          const g = canvas.current!.getContext("2d")!;
          g.beginPath();
          g.moveTo(last.current.x, last.current.y);
          g.lineTo(p.x, p.y);
          g.stroke();
          last.current = p;
          if (!drawn.current) { drawn.current = true; onChange?.(true); }
        }}
        onPointerUp={() => { last.current = null; }}
        onPointerCancel={() => { last.current = null; }}
      />
    );
  },
);
