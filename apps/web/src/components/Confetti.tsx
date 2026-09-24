import { useEffect, useRef } from "react";

const DURATION_MS = 3200;
const COUNT = 140;

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  angle: number;
  spin: number;
  shape: "rect" | "circle" | "heart";
};

// One-shot confetti burst over its parent. Fires from two points near the top and falls away.
export function Confetti({ colors }: { colors: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const pieces: Piece[] = Array.from({ length: COUNT }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const spread = (Math.random() - 0.5) * 1.1;
      const aim = fromLeft ? -Math.PI / 3 : (-2 * Math.PI) / 3;
      const speed = 7 + Math.random() * 7;
      const roll = Math.random();
      return {
        x: fromLeft ? width * 0.15 : width * 0.85,
        y: height * 0.32,
        vx: Math.cos(aim + spread) * speed,
        vy: Math.sin(aim + spread) * speed,
        size: 6 + Math.random() * 6,
        color: colors[i % colors.length],
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        shape: roll < 0.15 ? "heart" : roll < 0.45 ? "circle" : "rect",
      };
    });

    let frame = 0;
    const start = performance.now();
    let last = start;
    function draw(now: number) {
      const t = now - start;
      // Step in 60 fps units so the burst moves at the same speed on 120 Hz screens.
      const step = Math.min((now - last) / (1000 / 60), 3);
      last = now;
      const drag = Math.pow(0.985, step);
      ctx!.clearRect(0, 0, width, height);
      ctx!.globalAlpha = Math.max(0, 1 - Math.max(0, t - DURATION_MS * 0.6) / (DURATION_MS * 0.4));
      for (const p of pieces) {
        p.vy += 0.22 * step;
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.angle += p.spin * step;
        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.angle);
        ctx!.fillStyle = p.color;
        if (p.shape === "circle") {
          ctx!.beginPath();
          ctx!.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx!.fill();
        } else if (p.shape === "heart") {
          const s = p.size / 12;
          ctx!.scale(s, s);
          ctx!.beginPath();
          ctx!.moveTo(0, 4);
          ctx!.bezierCurveTo(-8, -2, -4, -9, 0, -4);
          ctx!.bezierCurveTo(4, -9, 8, -2, 0, 4);
          ctx!.fill();
        } else {
          ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx!.restore();
      }
      if (t < DURATION_MS) frame = requestAnimationFrame(draw);
      else ctx!.clearRect(0, 0, width, height);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
    // Fires once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="confetti" aria-hidden="true" />;
}
