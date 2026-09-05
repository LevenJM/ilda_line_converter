import React, { useEffect, useRef } from 'react';
import type { IldaFrame, ProcessOptions } from '../utils/ildaParser';
import { DEFAULT_ILDA_PALETTE } from '../utils/ildaParser';

interface LaserCanvasProps {
  frame: IldaFrame | null;
  palette?: [number, number, number][];
  options: ProcessOptions;
  showCropOverlay?: boolean;
  label?: string;
  badge?: string;
  subtext?: string;
}

export const LaserCanvas: React.FC<LaserCanvasProps> = ({
  frame,
  palette = DEFAULT_ILDA_PALETTE,
  options,
  showCropOverlay = true,
  label,
  badge,
  subtext
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clean neutral studio canvas background (off-white / subtle slate)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Subtle plotting grid
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const gx = (width / 4) * i;
      const gy = (height / 4) * i;
      ctx.moveTo(gx, 0); ctx.lineTo(gx, height);
      ctx.moveTo(0, gy); ctx.lineTo(width, gy);
    }
    ctx.stroke();

    // Center crosshairs (subtle light gray)
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Coordinate mapping: ILDA X is -32768 to 32767, Y is -32768 to 32767
    const mapX = (x: number) => ((x + 32768) / 65535) * width;
    const mapY = (y: number) => height - ((y + 32768) / 65535) * height;

    // Safety / Boundary Zone Overlay
    if (showCropOverlay && options.mode !== 'time') {
      const topY = mapY(options.yMax);
      const bottomY = mapY(options.yMin);

      // Excluded zones in soft warm gray/red tint
      ctx.fillStyle = 'rgba(239, 68, 68, 0.04)';
      ctx.fillRect(0, 0, width, topY);
      ctx.fillRect(0, bottomY, width, height - bottomY);

      // Boundary lines
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(0, topY); ctx.lineTo(width, topY);
      ctx.moveTo(0, bottomY); ctx.lineTo(width, bottomY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Clean typographic annotations
      ctx.font = '500 10px var(--font-mono, monospace)';
      ctx.fillStyle = '#64748b';
      ctx.fillText(`Max ${options.yMax}`, 8, Math.min(height - 8, Math.max(14, topY - 4)));
      ctx.fillText(`Min ${options.yMin}`, 8, Math.min(height - 8, Math.max(14, bottomY + 12)));
    }

    if (!frame || frame.points.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px var(--font-sans, sans-serif)';
      ctx.textAlign = 'center';
      ctx.fillText('No points in frame', width / 2, height / 2);
      ctx.textAlign = 'start';
      return;
    }

    // Draw Vector Path
    const points = frame.points;
    let prevPoint: { x: number; y: number } | null = null;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const curX = mapX(pt.x);
      const curY = mapY(pt.y);

      // Clean vector stroke color
      let strokeColor = '#0284c7'; // default crisp slate-blue
      if (pt.r !== undefined && pt.g !== undefined && pt.b !== undefined) {
        strokeColor = `rgb(${pt.r}, ${pt.g}, ${pt.b})`;
      } else if (pt.colorIndex !== undefined) {
        const palColor = palette[pt.colorIndex % palette.length] || [2, 132, 199];
        strokeColor = `rgb(${palColor[0]}, ${palColor[1]}, ${palColor[2]})`;
      }

      if (prevPoint && !pt.blanked) {
        // Clean, crisp vector line without sci-fi glowing neon halos
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.4;

        ctx.beginPath();
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineTo(curX, curY);
        ctx.stroke();
      }

      // Small vertex indicator
      if (!pt.blanked) {
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(curX, curY, 1, 0, Math.PI * 2);
        ctx.fill();
      }

      prevPoint = { x: curX, y: curY };
    }
  }, [frame, palette, options, showCropOverlay]);

  return (
    <div className="flex flex-col w-full">
      {label && (
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-800 tracking-tight">
              {label}
            </span>
            {badge && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                {badge}
              </span>
            )}
          </div>
          {subtext && <span className="text-xs text-slate-400 font-mono">{subtext}</span>}
        </div>
      )}
      <div className="relative border border-slate-200/80 rounded-lg overflow-hidden bg-white shadow-xs flex items-center justify-center w-full aspect-square">
        <canvas
          ref={canvasRef}
          width={440}
          height={440}
          className="w-full h-full object-contain block"
        />
      </div>
    </div>
  );
};
