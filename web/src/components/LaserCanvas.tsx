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

    // Grounded dark slate-gray canvas background
    ctx.fillStyle = '#0e1117';
    ctx.fillRect(0, 0, width, height);

    // Subtle technical grid
    ctx.strokeStyle = '#181e28';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const gx = (width / 4) * i;
      const gy = (height / 4) * i;
      ctx.moveTo(gx, 0); ctx.lineTo(gx, height);
      ctx.moveTo(0, gy); ctx.lineTo(width, gy);
    }
    ctx.stroke();

    // Center crosshairs
    ctx.strokeStyle = '#222b3a';
    ctx.beginPath();
    ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Coordinate mapping helpers: ILDA X is -32768 to 32767 (left to right), Y is -32768 to 32767 (bottom to top)
    const mapX = (x: number) => ((x + 32768) / 65535) * width;
    const mapY = (y: number) => height - ((y + 32768) / 65535) * height;

    // Safety / Crop Zone Overlay
    if (showCropOverlay && options.mode !== 'time') {
      const topY = mapY(options.yMax);
      const bottomY = mapY(options.yMin);
      const bandHeight = bottomY - topY;

      // Active zone
      ctx.fillStyle = 'rgba(56, 189, 248, 0.04)';
      ctx.fillRect(0, topY, width, bandHeight);

      // Excluded zones
      ctx.fillStyle = 'rgba(239, 68, 68, 0.04)';
      ctx.fillRect(0, 0, width, topY);
      ctx.fillRect(0, bottomY, width, height - bottomY);

      // Safety ceiling and floor lines
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(0, topY); ctx.lineTo(width, topY);
      ctx.moveTo(0, bottomY); ctx.lineTo(width, bottomY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Precision technical coordinate annotations
      ctx.font = '10px var(--font-mono, monospace)';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
      ctx.fillText(`Y_MAX ${options.yMax > 0 ? '+' : ''}${options.yMax}`, 8, Math.min(height - 8, Math.max(14, topY - 4)));
      ctx.fillText(`Y_MIN ${options.yMin > 0 ? '+' : ''}${options.yMin}`, 8, Math.min(height - 8, Math.max(14, bottomY + 12)));
    }

    if (!frame || frame.points.length === 0) {
      ctx.fillStyle = '#475569';
      ctx.font = '11px var(--font-mono, monospace)';
      ctx.textAlign = 'center';
      ctx.fillText('NO DATA', width / 2, height / 2);
      ctx.textAlign = 'start';
      return;
    }

    // Laser Path Render
    const points = frame.points;
    let prevPoint: { x: number; y: number } | null = null;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const curX = mapX(pt.x);
      const curY = mapY(pt.y);

      let strokeColor = '#38bdf8';
      if (pt.r !== undefined && pt.g !== undefined && pt.b !== undefined) {
        strokeColor = `rgb(${pt.r}, ${pt.g}, ${pt.b})`;
      } else if (pt.colorIndex !== undefined) {
        const palColor = palette[pt.colorIndex % palette.length] || [56, 189, 248];
        strokeColor = `rgb(${palColor[0]}, ${palColor[1]}, ${palColor[2]})`;
      }

      if (prevPoint && !pt.blanked) {
        // Subtle trace bloom (natural laser phosphorescence)
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 4;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.6;

        ctx.beginPath();
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineTo(curX, curY);
        ctx.stroke();

        // Core line
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineTo(curX, curY);
        ctx.stroke();
      }

      // Point illumination
      if (!pt.blanked) {
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(curX, curY, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      prevPoint = { x: curX, y: curY };
    }
  }, [frame, palette, options, showCropOverlay]);

  return (
    <div className="flex flex-col w-full">
      {label && (
        <div className="flex items-center justify-between py-1.5 px-0.5 mb-1.5 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium tracking-wider uppercase text-slate-300 font-heading">
              {label}
            </span>
            {badge && (
              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-800 text-slate-300 border border-slate-700/60">
                {badge}
              </span>
            )}
          </div>
          {subtext && <span className="text-[11px] text-slate-400 font-mono">{subtext}</span>}
        </div>
      )}
      <div className="relative border border-slate-800/90 rounded-lg overflow-hidden bg-[#0e1117] flex items-center justify-center w-full aspect-square">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="w-full h-full object-contain block"
        />
      </div>
    </div>
  );
};
