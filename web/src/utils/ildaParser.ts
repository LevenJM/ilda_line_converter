// Standard 64-color ILDA palette (RGB)
export const DEFAULT_ILDA_PALETTE: [number, number, number][] = [
  [255, 0, 0], [255, 16, 0], [255, 32, 0], [255, 48, 0],
  [255, 64, 0], [255, 80, 0], [255, 96, 0], [255, 112, 0],
  [255, 128, 0], [255, 144, 0], [255, 160, 0], [255, 176, 0],
  [255, 192, 0], [255, 208, 0], [255, 224, 0], [255, 240, 0],
  [255, 255, 0], [224, 255, 0], [192, 255, 0], [160, 255, 0],
  [128, 255, 0], [96, 255, 0], [64, 255, 0], [32, 255, 0],
  [0, 255, 0], [0, 255, 32], [0, 255, 64], [0, 255, 96],
  [0, 255, 128], [0, 255, 160], [0, 255, 192], [0, 255, 224],
  [0, 255, 255], [0, 224, 255], [0, 192, 255], [0, 160, 255],
  [0, 128, 255], [0, 96, 255], [0, 64, 255], [0, 32, 255],
  [0, 0, 255], [32, 0, 255], [64, 0, 255], [96, 0, 255],
  [128, 0, 255], [160, 0, 255], [192, 0, 255], [224, 0, 255],
  [255, 0, 255], [255, 32, 255], [255, 64, 255], [255, 96, 255],
  [255, 128, 255], [255, 160, 255], [255, 192, 255], [255, 224, 255],
  [255, 255, 255], [255, 224, 224], [255, 192, 192], [255, 160, 160],
  [255, 128, 128], [255, 96, 96], [255, 64, 64], [255, 32, 32]
];

export interface IldaHeader {
  signature: string;
  formatCode: number;
  frameName: string;
  companyName: string;
  pointCount: number;
  frameNumber: number;
  totalFrames: number;
  scanner: number;
  rawHeaderBytes: Uint8Array;
}

export interface IldaPoint {
  x: number;
  y: number;
  z?: number;
  blanked: boolean;
  lastPoint: boolean;
  colorIndex?: number;
  r?: number;
  g?: number;
  b?: number;
  rawBytes: Uint8Array;
}

export interface IldaFrame {
  header: IldaHeader;
  points: IldaPoint[];
  rawBytes?: Uint8Array; // for palette frames or verbatim copy
}

export interface ParsedIldaFile {
  name: string;
  frames: IldaFrame[];
  minY: number;
  maxY: number;
  totalPoints: number;
  palette?: [number, number, number][];
  buffer: ArrayBuffer;
}

export interface ProcessOptions {
  mode: 'discard' | 'squash' | 'time';
  yMin: number;
  yMax: number;
  preserveAnimationTiming: boolean;
  blankGaps: boolean;
  enableDuration: boolean;
  targetSeconds: number;
  scanRateKpps: number;
  allowExtend: boolean;
  allowTrim: boolean;
}

const HEADER_SIZE = 32;

export function parseIlda(buffer: ArrayBuffer, fileName = "file.ild"): ParsedIldaFile {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let offset = 0;
  const frames: IldaFrame[] = [];

  let globalMinY = Infinity;
  let globalMaxY = -Infinity;
  let totalPointsCount = 0;
  let activePalette: [number, number, number][] | undefined = undefined;

  const textDecoder = new TextDecoder('ascii');

  while (offset + HEADER_SIZE <= bytes.byteLength) {
    const sig = textDecoder.decode(bytes.subarray(offset, offset + 4));
    if (sig !== 'ILDA') {
      break;
    }

    const formatCode = view.getUint8(offset + 7);
    const frameName = textDecoder.decode(bytes.subarray(offset + 8, offset + 16)).trim();
    const companyName = textDecoder.decode(bytes.subarray(offset + 16, offset + 24)).trim();
    const pointCount = view.getUint16(offset + 24, false);
    const frameNumber = view.getUint16(offset + 26, false);
    const totalFrames = view.getUint16(offset + 28, false);
    const scanner = view.getUint8(offset + 30);
    const rawHeaderBytes = bytes.slice(offset, offset + HEADER_SIZE);

    const header: IldaHeader = {
      signature: sig,
      formatCode,
      frameName,
      companyName,
      pointCount,
      frameNumber,
      totalFrames,
      scanner,
      rawHeaderBytes
    };

    offset += HEADER_SIZE;

    let pointSize = 0;
    if (formatCode === 0) pointSize = 8;       // 3D indexed
    else if (formatCode === 1) pointSize = 6;  // 2D indexed
    else if (formatCode === 2) pointSize = 3;  // Color palette
    else if (formatCode === 4) pointSize = 10; // 3D true color
    else if (formatCode === 5) pointSize = 8;  // 2D true color
    else {
      break;
    }

    const dataSize = pointCount * pointSize;
    if (offset + dataSize > bytes.byteLength) {
      break;
    }

    const pointsRaw = bytes.subarray(offset, offset + dataSize);
    offset += dataSize;

    // Format 2: Palette
    if (formatCode === 2) {
      const palette: [number, number, number][] = [];
      for (let i = 0; i < pointCount; i++) {
        const pOffset = i * 3;
        palette.push([pointsRaw[pOffset], pointsRaw[pOffset + 1], pointsRaw[pOffset + 2]]);
      }
      activePalette = palette;
      frames.push({
        header,
        points: [],
        rawBytes: bytes.slice(offset - dataSize, offset)
      });
      continue;
    }

    // Null frame / EOF frame
    if (pointCount === 0) {
      frames.push({
        header,
        points: [],
        rawBytes: new Uint8Array(0)
      });
      continue;
    }

    const points: IldaPoint[] = [];
    totalPointsCount += pointCount;

    for (let i = 0; i < pointCount; i++) {
      const pOffset = i * pointSize;
      const ptView = new DataView(pointsRaw.buffer, pointsRaw.byteOffset + pOffset, pointSize);
      const rawPtBytes = bytes.slice(offset - dataSize + pOffset, offset - dataSize + pOffset + pointSize);

      let x = 0;
      let y = 0;
      let z: number | undefined;
      let status = 0;
      let colorIndex: number | undefined;
      let r: number | undefined;
      let g: number | undefined;
      let b: number | undefined;

      if (formatCode === 0) {
        x = ptView.getInt16(0, false);
        y = ptView.getInt16(2, false);
        z = ptView.getInt16(4, false);
        status = ptView.getUint8(6);
        colorIndex = ptView.getUint8(7);
      } else if (formatCode === 1) {
        x = ptView.getInt16(0, false);
        y = ptView.getInt16(2, false);
        status = ptView.getUint8(4);
        colorIndex = ptView.getUint8(5);
      } else if (formatCode === 4) {
        x = ptView.getInt16(0, false);
        y = ptView.getInt16(2, false);
        z = ptView.getInt16(4, false);
        status = ptView.getUint8(6);
        b = ptView.getUint8(7);
        g = ptView.getUint8(8);
        r = ptView.getUint8(9);
      } else if (formatCode === 5) {
        x = ptView.getInt16(0, false);
        y = ptView.getInt16(2, false);
        status = ptView.getUint8(4);
        b = ptView.getUint8(5);
        g = ptView.getUint8(6);
        r = ptView.getUint8(7);
      }

      if (y < globalMinY) globalMinY = y;
      if (y > globalMaxY) globalMaxY = y;

      const blanked = (status & 0x40) !== 0;
      const lastPoint = (status & 0x80) !== 0;

      points.push({
        x,
        y,
        z,
        blanked,
        lastPoint,
        colorIndex,
        r,
        g,
        b,
        rawBytes: rawPtBytes
      });
    }

    frames.push({
      header,
      points
    });
  }

  return {
    name: fileName,
    frames,
    minY: globalMinY === Infinity ? 0 : globalMinY,
    maxY: globalMaxY === -Infinity ? 0 : globalMaxY,
    totalPoints: totalPointsCount,
    palette: activePalette,
    buffer
  };
}

export function processIldaFile(parsed: ParsedIldaFile, options: ProcessOptions): Uint8Array {
  const { mode, yMin, yMax, preserveAnimationTiming, blankGaps } = options;
  const globYmin = parsed.minY;
  const globYmax = parsed.maxY;

  interface OutFrame {
    header: IldaHeader;
    pointsBytes: Uint8Array[];
    isReal: boolean;
    isPalette: boolean;
    isTerminator: boolean;
  }

  const outFrames: OutFrame[] = [];

  for (const frame of parsed.frames) {
    const { formatCode, pointCount } = frame.header;

    // Palette or null header
    if (formatCode === 2 || pointCount === 0) {
      outFrames.push({
        header: { ...frame.header },
        pointsBytes: frame.rawBytes ? [frame.rawBytes] : [],
        isReal: false,
        isPalette: formatCode === 2,
        isTerminator: pointCount === 0
      });
      continue;
    }

    const processedPoints: Uint8Array[] = [];
    let gapSinceLastKept = false;

    for (let i = 0; i < frame.points.length; i++) {
      const pt = frame.points[i];
      const raw = new Uint8Array(pt.rawBytes);
      const is3D = formatCode === 0 || formatCode === 4;
      const statusIdx = is3D ? 6 : 4;

      if (mode === 'squash') {
        let newY = 0;
        if (globYmax > globYmin) {
          const scale = (yMax - yMin) / (globYmax - globYmin);
          newY = Math.round(yMin + (pt.y - globYmin) * scale);
        } else {
          newY = Math.round((yMin + yMax) / 2);
        }

        const ptView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        ptView.setInt16(2, newY, false); // Set Y
        processedPoints.push(raw);

      } else if (mode === 'time') {
        processedPoints.push(raw);

      } else {
        // Discard mode
        if (pt.y >= yMin && pt.y <= yMax) {
          if (blankGaps && gapSinceLastKept && processedPoints.length > 0) {
            // Clone and set blank bit 0x40
            const blanked = new Uint8Array(raw);
            blanked[statusIdx] = blanked[statusIdx] | 0x40;
            processedPoints.push(blanked);
          }
          processedPoints.push(raw);
          gapSinceLastKept = false;
        } else {
          gapSinceLastKept = true;
        }
      }
    }

    if (processedPoints.length === 0) {
      if (preserveAnimationTiming) {
        let dummy: Uint8Array;
        if (formatCode === 0) {
          dummy = new Uint8Array(8);
          const dv = new DataView(dummy.buffer);
          dv.setUint8(6, 0xC0); // Blanked + Last point
        } else if (formatCode === 1) {
          dummy = new Uint8Array(6);
          const dv = new DataView(dummy.buffer);
          dv.setUint8(4, 0xC0);
        } else if (formatCode === 4) {
          dummy = new Uint8Array(10);
          const dv = new DataView(dummy.buffer);
          dv.setUint8(6, 0xC0);
        } else {
          dummy = new Uint8Array(8);
          const dv = new DataView(dummy.buffer);
          dv.setUint8(4, 0xC0);
        }
        processedPoints.push(dummy);
      } else {
        // Skip empty frame completely
        continue;
      }
    }

    // Set correct last point bit
    const finalPoints: Uint8Array[] = [];
    const is3D = formatCode === 0 || formatCode === 4;
    const statusIdx = is3D ? 6 : 4;

    for (let idx = 0; idx < processedPoints.length; idx++) {
      const ptBytes = new Uint8Array(processedPoints[idx]);
      let status = ptBytes[statusIdx];
      if (idx === processedPoints.length - 1) {
        status = status | 0x80; // Set last point
      } else {
        status = status & 0x7F; // Clear last point
      }
      ptBytes[statusIdx] = status;
      finalPoints.push(ptBytes);
    }

    const newHeader = { ...frame.header, pointCount: finalPoints.length };
    outFrames.push({
      header: newHeader,
      pointsBytes: finalPoints,
      isReal: true,
      isPalette: false,
      isTerminator: false
    });
  }

  // Duration adjustment if enabled
  let finalFrames = outFrames;
  if (options.enableDuration && (options.allowExtend || options.allowTrim)) {
    const reals = outFrames.filter(f => f.isReal);
    const palettes = outFrames.filter(f => f.isPalette);
    const terminator = outFrames.find(f => f.isTerminator);

    if (reals.length > 0) {
      const pps = Math.max(1.0, options.scanRateKpps * 1000.0);
      const framePts = reals.map(r => r.pointsBytes.length);
      const basePoints = framePts.reduce((a, b) => a + b, 0);
      const targetPoints = Math.max(0, options.targetSeconds * pps);
      const F = reals.length;
      const FRAME_LIMIT = 65535;

      const skipExtend = targetPoints > basePoints && !options.allowExtend;
      const skipTrim = targetPoints < basePoints && !options.allowTrim;

      if (!skipExtend && !skipTrim) {
        const selected: number[] = [];
        let cum = 0;
        let i = 0;

        while (selected.length < FRAME_LIMIT) {
          const p = framePts[i % F];
          if (selected.length > 0 && Math.abs(cum + p - targetPoints) >= Math.abs(cum - targetPoints)) {
            break;
          }
          selected.push(i % F);
          cum += p;
          i++;
        }

        const M = selected.length;
        const newFramesList: OutFrame[] = [...palettes];

        for (let idx = 0; idx < M; idx++) {
          const origFrame = reals[selected[idx]];
          newFramesList.push({
            ...origFrame,
            header: {
              ...origFrame.header,
              frameNumber: idx,
              totalFrames: M
            }
          });
        }

        if (terminator) {
          newFramesList.push({
            ...terminator,
            header: {
              ...terminator.header,
              frameNumber: 0,
              totalFrames: M
            }
          });
        }

        finalFrames = newFramesList;
      }
    }
  }

  // Pack frames into binary
  let totalLength = 0;
  for (const fr of finalFrames) {
    totalLength += HEADER_SIZE;
    for (const pb of fr.pointsBytes) {
      totalLength += pb.byteLength;
    }
  }

  const resultBuffer = new Uint8Array(totalLength);
  let writeOffset = 0;

  for (const fr of finalFrames) {
    // Write header
    const h = fr.header;
    const hBytes = new Uint8Array(fr.header.rawHeaderBytes);
    const hView = new DataView(hBytes.buffer, hBytes.byteOffset, hBytes.byteLength);

    hView.setUint16(24, fr.pointsBytes.length, false);
    hView.setUint16(26, h.frameNumber, false);
    hView.setUint16(28, h.totalFrames, false);

    resultBuffer.set(hBytes, writeOffset);
    writeOffset += HEADER_SIZE;

    // Write points
    for (const pb of fr.pointsBytes) {
      resultBuffer.set(pb, writeOffset);
      writeOffset += pb.byteLength;
    }
  }

  return resultBuffer;
}
