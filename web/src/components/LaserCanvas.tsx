import React, { useEffect, useRef } from 'react';
import type { IldaFrame, ProcessOptions } from '../utils/ildaParser';
import { DEFAULT_ILDA_PALETTE } from '../utils/ildaParser';

interface LaserCanvasProps {
  frame: IldaFrame | null;
  palette?: [number, number, number][];
  options: ProcessOptions;
  showCropOverlay?: boolean;
}

export const LaserCanvas: React.FC<LaserCanvasProps> = ({
  frame,
  palette = DEFAULT_ILDA_PALETTE,
  options,
  showCropOverlay = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear background
    ctx.fillStyle = '#080c10';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid & Axes
    ctx.strokeStyle = '#1a2230';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Grid lines
    for (let i = 1; i < 4; i++) {
      const gx = (width / 4) * i;
      const gy = (height / 4) * i;
      ctx.moveTo(gx, 0); ctx.lineTo(gx, height);
      ctx.moveTo(0, gy); ctx.lineTo(width, gy);
    }
    ctx.stroke();

    // Center crosshairs
    ctx.strokeStyle = '#253549';
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

      // Inverted / active band
      ctx.fillStyle = 'rgba(0, 255, 204, 0.08)';
      ctx.fillRect(0, topY, width, bandHeight);

      // Excluded regions
      ctx.fillStyle = 'rgba(255, 0, 70, 0.05)';
      ctx.fillRect(0, 0, width, topY); // Above max
      ctx.fillRect(0, bottomY, width, height - bottomY); // Below min

      // Min/Max Boundary lines
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#00ffcc';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(0, topY); ctx.lineTo(width, topY);
      ctx.moveTo(0, bottomY); ctx.lineTo(width, bottomY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Labels
      ctx.font = '10px monospace';
      ctx.fillStyle = '#00ffcc';
      ctx.fillText(`Max Y: ${options.yMax}`, 8, Math.min(height - 8, Math.max(14, topY - 4)));
      ctx.fillText(`Min Y: ${options.yMin}`, 8, Math.min(height - 8, Math.max(14, bottomY + 12)));
    }

    if (!frame || frame.points.length === 0) {
      ctx.fillStyle = '#4a5568';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No laser points to display', width / 2, height / 2);
      ctx.textAlign = 'start';
      return;
    }

    // Draw Laser Path
    const points = frame.points;
    let prevPoint: { x: number; y: number } | null = null;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const curX = mapX(pt.x);
      const curY = mapY(pt.y);

      // Determine color
      let strokeColor = '#00ffcc';
      if (pt.r !== undefined && pt.g !== undefined && pt.b !== undefined) {
        strokeColor = `rgb(${pt.r}, ${pt.g}, ${pt.b})`;
      } else if (pt.colorIndex !== undefined) {
        const palColor = palette[pt.colorIndex % palette.length] || [0, 255, 204];
        strokeColor = `rgb(${palColor[0]}, ${palColor[1]}, ${palColor[2]})`;
      }

      if (prevPoint && !pt.blanked) {
        // Laser beam glow
        ctx.shadowColor = strokeColor;
        ctx.shadowBlur = 6;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineTo(curX, curY);
        ctx.stroke();

        // Inner bright core
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineTo(curX, curY);
        ctx.stroke();
      }

      // If point is not blanked, render a small illuminated point
      if (!pt.blanked) {
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(curX, curY, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      prevPoint = { x: curX, y: curY };
    }
  }, [frame, palette, options, showCropOverlay]);

  return (
    <div className="relative border border-gray-800 rounded-xl overflow-hidden shadow-2xl bg-black flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={480}
        height={480}
        className="w-full max-w-[480px] aspect-square object-contain block"
      />
    </div>
  );
};
