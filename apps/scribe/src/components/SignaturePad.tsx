import { useRef } from "react";

// Cattura grafometrica: i tratti del pointer diventano un path SVG compatto
// (signature_stroke). Nessuna dipendenza — canvas + pointer events.
export function SignaturePad({
  onChange,
}: {
  onChange: (svgPath: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const path = useRef<string>("");

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.round(e.clientX - rect.left),
      y: Math.round(e.clientY - rect.top),
    };
  };

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const { x, y } = pos(e);
    path.current += `M${x},${y}`;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const { x, y } = pos(e);
    path.current += `L${x},${y}`;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  };
  const end = () => {
    drawing.current = false;
    onChange(path.current || null);
  };
  const clear = () => {
    path.current = "";
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={420}
        height={140}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        style={{
          width: "100%",
          height: 140,
          border: "1px dashed var(--slate-300)",
          borderRadius: 8,
          touchAction: "none",
          background: "#fff",
        }}
      />
      <button
        className="ghost"
        style={{ marginTop: 8, minHeight: 36, padding: "6px 12px", fontSize: 13 }}
        onClick={clear}
        type="button"
      >
        ✕
      </button>
    </div>
  );
}
