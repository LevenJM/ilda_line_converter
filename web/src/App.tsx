import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, 
  Download, Trash2, Upload, Sliders, Layers
} from 'lucide-react';
import JSZip from 'jszip';
import confetti from 'canvas-confetti';
import { 
  parseIlda, processIldaFile, transformFrameForPreview,
  type ParsedIldaFile, type ProcessOptions, type IldaFrame 
} from './utils/ildaParser';
import { LaserCanvas } from './components/LaserCanvas';

export function App() {
  const [files, setFiles] = useState<ParsedIldaFile[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState<number>(0);
  const [currentFrameIdx, setCurrentFrameIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackFps, setPlaybackFps] = useState<number>(30);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'split' | 'processed' | 'original'>('split');

  // Core processing options
  const [options, setOptions] = useState<ProcessOptions>({
    mode: 'discard',
    yMin: 0,
    yMax: 15000,
    preserveAnimationTiming: true,
    blankGaps: true,
    enableDuration: false,
    targetSeconds: 10.0,
    scanRateKpps: 30.0,
    allowExtend: true,
    allowTrim: true
  });

  const selectedFile = files[selectedFileIdx] || null;

  // Real displayable frames
  const displayableFrames: IldaFrame[] = useMemo(() => {
    if (!selectedFile) return [];
    return selectedFile.frames.filter(f => f.header.pointCount > 0 && f.header.formatCode !== 2);
  }, [selectedFile]);

  useEffect(() => {
    setCurrentFrameIdx(0);
  }, [selectedFileIdx]);

  // Frame playback loop
  const animTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying || displayableFrames.length <= 1) {
      if (animTimerRef.current) clearInterval(animTimerRef.current);
      return;
    }

    animTimerRef.current = window.setInterval(() => {
      setCurrentFrameIdx(prev => (prev + 1) % displayableFrames.length);
    }, 1000 / playbackFps);

    return () => {
      if (animTimerRef.current) clearInterval(animTimerRef.current);
    };
  }, [isPlaying, displayableFrames.length, playbackFps]);

  // File upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    const parsedList: ParsedIldaFile[] = [];
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      try {
        const arrayBuffer = await file.arrayBuffer();
        const parsed = parseIlda(arrayBuffer, file.name);
        parsedList.push(parsed);
      } catch (err) {
        console.error("Error parsing file:", file.name, err);
      }
    }

    setFiles(prev => [...prev, ...parsedList]);
    event.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (selectedFileIdx >= index && selectedFileIdx > 0) {
      setSelectedFileIdx(prev => prev - 1);
    }
  };

  const clearAllFiles = () => {
    setFiles([]);
    setSelectedFileIdx(0);
    setCurrentFrameIdx(0);
  };

  // Download single file
  const downloadSingleProcessed = (file: ParsedIldaFile) => {
    const processedBytes = processIldaFile(file, options);
    const blob = new Blob([processedBytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    link.href = url;
    link.download = `${baseName}_processed.ild`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Batch Zip
  const downloadAllZip = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);

    try {
      const zip = new JSZip();

      for (const file of files) {
        const processedBytes = processIldaFile(file, options);
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        zip.file(`${baseName}_processed.ild`, processedBytes);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ilda_processed.zip';
      link.click();
      URL.revokeObjectURL(url);

      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.8 }
      });
    } catch (err) {
      console.error("ZIP creation error:", err);
      alert("Failed to export ZIP file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const currentOriginalFrame = displayableFrames[currentFrameIdx] || null;

  // Real-time preview calculation
  const currentProcessedFrame = useMemo(() => {
    if (!currentOriginalFrame || !selectedFile) return null;
    return transformFrameForPreview(
      currentOriginalFrame,
      options,
      selectedFile.minY,
      selectedFile.maxY
    );
  }, [currentOriginalFrame, selectedFile, options]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans selection:bg-slate-900 selection:text-white">
      {/* Refined Navigation Bar */}
      <header className="border-b border-slate-200 bg-white px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-md bg-slate-900 text-white flex items-center justify-center font-mono text-xs font-semibold">
            IL
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-900 tracking-tight">
                ILDA Studio
              </h1>
              <span className="text-[11px] text-slate-400 font-normal">
                Vertical Safety & Playback Processing
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://github.com/LevenJM/ilda_line_converter"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-500 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded px-2.5 py-1 transition-colors font-medium"
          >
            GitHub
          </a>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Left Column: Source Files & Parameters */}
        <div className="xl:col-span-5 space-y-5">
          
          {/* File Manager Section */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-900 tracking-tight flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-400" /> Files
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  ({files.length})
                </span>
              </div>
              {files.length > 0 && (
                <button
                  onClick={clearAllFiles}
                  className="text-xs text-slate-400 hover:text-red-600 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Drop Zone */}
            <label className="mt-3 border border-dashed border-slate-200 hover:border-slate-400 rounded-md p-4 flex items-center justify-center gap-3 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors group">
              <Upload className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
              <div className="text-left">
                <span className="text-xs font-medium text-slate-700 block">
                  Add ILDA files (.ild)
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Click or drag files here to begin
                </span>
              </div>
              <input
                type="file"
                multiple
                accept=".ild"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {/* Structured File Table */}
            {files.length > 0 && (
              <div className="mt-3 border border-slate-200 rounded overflow-hidden">
                <div className="max-h-44 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 font-medium">
                        <th className="py-2 px-3">File Name</th>
                        <th className="py-2 px-2 text-right">Frames</th>
                        <th className="py-2 px-2 text-right">Y Range</th>
                        <th className="py-2 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {files.map((f, idx) => (
                        <tr
                          key={idx}
                          onClick={() => setSelectedFileIdx(idx)}
                          className={`cursor-pointer transition-colors ${
                            selectedFileIdx === idx
                              ? 'bg-slate-100/80 text-slate-900 font-medium'
                              : 'hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          <td className="py-2 px-3 truncate max-w-[170px] font-mono text-[11px]">
                            {f.name}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-[11px] text-slate-500">{f.frames.length}</td>
                          <td className="py-2 px-2 text-right font-mono text-[11px] text-slate-500">[{f.minY}..{f.maxY}]</td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                              <button
                                title="Download processed"
                                onClick={() => downloadSingleProcessed(f)}
                                className="p-1 text-slate-400 hover:text-slate-800 transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                title="Remove"
                                onClick={() => removeFile(idx)}
                                className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Settings Section */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-900 tracking-tight flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-slate-400" /> Processing Settings
              </span>
            </div>

            {/* Mode Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Processing Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'discard', label: 'Crop (Discard)', desc: 'Remove points outside boundaries' },
                  { id: 'squash', label: 'Squash (Scale)', desc: 'Fit vertical geometry into band' },
                  { id: 'time', label: 'Duration Only', desc: 'Preserve geometry, normalize length' }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setOptions({ ...options, mode: m.id as any })}
                    className={`p-2.5 text-left rounded border transition-all ${
                      options.mode === m.id
                        ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs font-medium">{m.label}</div>
                    <div className={`text-[10px] mt-0.5 leading-tight ${options.mode === m.id ? 'text-slate-300' : 'text-slate-400'}`}>
                      {m.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Y Sliders */}
            {options.mode !== 'time' && (
              <div className="space-y-3.5 pt-2 border-t border-slate-100">
                {/* Min Y */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-600 font-medium">Floor (Y Min)</span>
                    <span className="font-mono text-slate-900 font-medium">{options.yMin}</span>
                  </div>
                  <input
                    type="range"
                    min="-32768"
                    max="32767"
                    step="100"
                    value={options.yMin}
                    onChange={(e) => setOptions({ ...options, yMin: parseInt(e.target.value) || 0 })}
                    className="w-full accent-slate-900 bg-slate-200 h-1 rounded cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-0.5">
                    <span>-32,768 (Bottom)</span>
                    <span>0 (Center)</span>
                    <span>+32,767</span>
                  </div>
                </div>

                {/* Max Y */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-600 font-medium">Safety Ceiling (Y Max)</span>
                    <span className="font-mono text-slate-900 font-medium">{options.yMax}</span>
                  </div>
                  <input
                    type="range"
                    min="-32768"
                    max="32767"
                    step="100"
                    value={options.yMax}
                    onChange={(e) => setOptions({ ...options, yMax: parseInt(e.target.value) || 0 })}
                    className="w-full accent-slate-900 bg-slate-200 h-1 rounded cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-0.5">
                    <span>-32,768</span>
                    <span>15,000 (Standard Safety)</span>
                    <span>+32,767</span>
                  </div>
                </div>

                {/* Presets */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400 mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={() => setOptions({ ...options, yMin: 0, yMax: 15000 })}
                    className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    Safety Band (0 to 15k)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptions({ ...options, yMin: -10000, yMax: 20000 })}
                    className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    Mid-Band (-10k to 20k)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptions({ ...options, yMin: 0, yMax: 32767 })}
                    className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    Upper Half (0 to 32k)
                  </button>
                </div>

                {/* Discard Mode Options */}
                {options.mode === 'discard' && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.preserveAnimationTiming}
                        onChange={(e) => setOptions({ ...options, preserveAnimationTiming: e.target.checked })}
                        className="rounded border-slate-300 text-slate-900 focus:ring-0"
                      />
                      <span>Preserve animation frame timing (insert dummy point for empty frames)</span>
                    </label>

                    <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.blankGaps}
                        onChange={(e) => setOptions({ ...options, blankGaps: e.target.checked })}
                        className="rounded border-slate-300 text-slate-900 focus:ring-0"
                      />
                      <span>Blank transit gaps (turn laser beam dark across cut sections)</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Target Duration Section */}
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <label className="flex items-center space-x-2 text-xs font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.enableDuration || options.mode === 'time'}
                  disabled={options.mode === 'time'}
                  onChange={(e) => setOptions({ ...options, enableDuration: e.target.checked })}
                  className="rounded border-slate-300 text-slate-900 focus:ring-0"
                />
                <span>Set target playback duration</span>
              </label>

              {(options.enableDuration || options.mode === 'time') && (
                <div className="grid grid-cols-2 gap-3 pl-5 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Duration (seconds)</label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.5"
                      value={options.targetSeconds}
                      onChange={(e) => setOptions({ ...options, targetSeconds: parseFloat(e.target.value) || 1.0 })}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-xs font-mono text-slate-800 focus:outline-none focus:border-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Scanner Rate (kpps)</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={options.scanRateKpps}
                      onChange={(e) => setOptions({ ...options, scanRateKpps: parseFloat(e.target.value) || 30 })}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-xs font-mono text-slate-800 focus:outline-none focus:border-slate-400"
                    />
                  </div>

                  <div className="col-span-2 space-y-1 text-xs text-slate-600">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.allowExtend}
                        onChange={(e) => setOptions({ ...options, allowExtend: e.target.checked })}
                        className="rounded border-slate-300 text-slate-900 focus:ring-0"
                      />
                      <span>Loop shorter clips to reach target duration</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.allowTrim}
                        onChange={(e) => setOptions({ ...options, allowTrim: e.target.checked })}
                        className="rounded border-slate-300 text-slate-900 focus:ring-0"
                      />
                      <span>Trim longer clips at target duration</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Primary Action Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
              <button
                disabled={files.length === 0 || isProcessing}
                onClick={downloadAllZip}
                className="flex-1 py-2 px-3 rounded font-medium text-xs bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                {isProcessing ? 'Packaging...' : `Export All as ZIP (${files.length})`}
              </button>

              {selectedFile && (
                <button
                  disabled={isProcessing}
                  onClick={() => downloadSingleProcessed(selectedFile)}
                  className="py-2 px-3 rounded font-medium text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors shadow-2xs"
                >
                  Save Active File
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Clean Vector Studio Preview */}
        <div className="xl:col-span-7 flex flex-col space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs flex-1 flex flex-col">
            
            {/* Toolbar */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-900 tracking-tight">
                  Vector Frame Preview
                </span>
                {selectedFile && (
                  <span className="text-xs text-slate-400 font-mono">
                    · {selectedFile.name}
                  </span>
                )}
              </div>

              {/* View toggle */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded text-xs">
                <button
                  onClick={() => setViewMode('split')}
                  className={`px-2.5 py-1 rounded transition-colors font-medium ${
                    viewMode === 'split' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Side-by-Side
                </button>
                <button
                  onClick={() => setViewMode('processed')}
                  className={`px-2.5 py-1 rounded transition-colors font-medium ${
                    viewMode === 'processed' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Processed
                </button>
                <button
                  onClick={() => setViewMode('original')}
                  className={`px-2.5 py-1 rounded transition-colors font-medium ${
                    viewMode === 'original' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Original
                </button>
              </div>
            </div>

            {/* Display Area */}
            <div className="flex-1 flex items-center justify-center min-h-[380px]">
              {viewMode === 'split' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  <LaserCanvas
                    frame={currentOriginalFrame}
                    palette={selectedFile?.palette}
                    options={options}
                    showCropOverlay={true}
                    label="Original Input"
                    badge="Source"
                    subtext={currentOriginalFrame ? `${currentOriginalFrame.points.length} pts` : ''}
                  />
                  <LaserCanvas
                    frame={currentProcessedFrame}
                    palette={selectedFile?.palette}
                    options={options}
                    showCropOverlay={false}
                    label="Processed Result"
                    badge={options.mode.toUpperCase()}
                    subtext={currentProcessedFrame ? `${currentProcessedFrame.points.length} pts` : ''}
                  />
                </div>
              ) : viewMode === 'processed' ? (
                <div className="max-w-[480px] w-full mx-auto">
                  <LaserCanvas
                    frame={currentProcessedFrame}
                    palette={selectedFile?.palette}
                    options={options}
                    showCropOverlay={false}
                    label="Processed Result"
                    badge={options.mode.toUpperCase()}
                    subtext={currentProcessedFrame ? `${currentProcessedFrame.points.length} pts` : ''}
                  />
                </div>
              ) : (
                <div className="max-w-[480px] w-full mx-auto">
                  <LaserCanvas
                    frame={currentOriginalFrame}
                    palette={selectedFile?.palette}
                    options={options}
                    showCropOverlay={true}
                    label="Original Input"
                    badge="Source"
                    subtext={currentOriginalFrame ? `${currentOriginalFrame.points.length} pts` : ''}
                  />
                </div>
              )}
            </div>

            {/* Playback Controls */}
            {displayableFrames.length > 1 && (
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => setCurrentFrameIdx(prev => (prev > 0 ? prev - 1 : displayableFrames.length - 1))}
                      className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                      title="Previous frame"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="p-1.5 px-2.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium transition-colors"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setCurrentFrameIdx(prev => (prev + 1) % displayableFrames.length)}
                      className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                      title="Next frame"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs text-slate-500 font-mono ml-2">
                      Frame {currentFrameIdx + 1} of {displayableFrames.length}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-slate-500">
                    <span>Speed:</span>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      step="5"
                      value={playbackFps}
                      onChange={(e) => setPlaybackFps(parseInt(e.target.value))}
                      className="w-16 accent-slate-900 bg-slate-200 h-1 rounded cursor-pointer"
                    />
                    <span className="font-mono text-slate-700 w-12 text-right">{playbackFps} fps</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0"
                  max={Math.max(0, displayableFrames.length - 1)}
                  value={currentFrameIdx}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setCurrentFrameIdx(parseInt(e.target.value));
                  }}
                  className="w-full accent-slate-900 bg-slate-200 h-1 rounded cursor-pointer"
                />
              </div>
            )}

            {/* Metrics Info Bar */}
            {selectedFile && currentOriginalFrame && currentProcessedFrame && (
              <div className="mt-3 p-2.5 rounded bg-slate-50 border border-slate-200/60 text-xs font-mono grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-sans">Input Points</span>
                  <span className="text-slate-800 font-medium">{currentOriginalFrame.points.length}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-sans">Output Points</span>
                  <span className="text-slate-800 font-medium">{currentProcessedFrame.points.length}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-sans">Reduction</span>
                  <span className={`font-medium ${currentProcessedFrame.points.length < currentOriginalFrame.points.length ? "text-amber-700" : "text-slate-600"}`}>
                    {currentProcessedFrame.points.length - currentOriginalFrame.points.length} pts
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-sans">File Bounds</span>
                  <span className="text-slate-700">[{selectedFile.minY}..{selectedFile.maxY}]</span>
                </div>
              </div>
            )}
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-2.5 text-center text-xs text-slate-400">
        ILDA Specification Compliant · All processing performed client-side in your browser
      </footer>
    </div>
  );
}

export default App;
