import { useEffect, useRef } from "react";

export default function SignaturePad({ label, onChange, initialDataUrl }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);

  const resizeAndPaintInitial = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parentWidth = canvas.parentElement?.clientWidth || 320;
    const width = Math.max(280, Math.floor(parentWidth - 2));
    const height = 150;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0f0f10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#f3f4f6";

    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = initialDataUrl;
    }
  };

  useEffect(() => {
    resizeAndPaintInitial();
    const onResize = () => resizeAndPaintInitial();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [initialDataUrl]);

  const getPoint = (evt) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = evt.touches?.[0] || evt.changedTouches?.[0];
    const x = touch ? touch.clientX : evt.clientX;
    const y = touch ? touch.clientY : evt.clientY;
    return { x: x - rect.left, y: y - rect.top };
  };

  const begin = (evt) => {
    evt.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPoint(evt);
  };

  const move = (evt) => {
    if (!drawingRef.current) return;
    evt.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const current = getPoint(evt);
    const last = lastPointRef.current;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    lastPointRef.current = current;
    onChange(canvas.toDataURL("image/png"));
  };

  const end = (evt) => {
    if (!drawingRef.current) return;
    evt.preventDefault();
    drawingRef.current = false;
    const canvas = canvasRef.current;
    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0f0f10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">
        {label}
      </div>
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-[#0f0f10] shadow-sm">
        <canvas
          ref={canvasRef}
          className="w-full block touch-none"
          onMouseDown={begin}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={begin}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <button
        type="button"
        className="btn btn-muted bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs"
        onClick={clear}
      >
        Limpiar Firma
      </button>
    </div>
  );
}
