import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, 
  Download, FileArchive, Trash2, UploadCloud, SplitSquareVertical
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

  // Core processing configuration
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

  // Filter displayable frames
  const displayableFrames: IldaFrame[] = useMemo(() => {
    if (!selectedFile) return [];
    return selectedFile.frames.filter(f => f.header.pointCount > 0 && f.header.formatCode !== 2);
  }, [selectedFile]);

  useEffect(() => {
    setCurrentFrameIdx(0);
  }, [selectedFileIdx]);

  // Frame Playback Loop
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

  // Upload handler
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
        console.error("Error parsing ILDA file:", file.name, err);
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

  // Download single processed ILDA file
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

  // Batch Zip Export
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
      link.download = 'ilda_processed_batch.zip';
      link.click();
      URL.revokeObjectURL(url);

      confetti({
        particleCount: 40,
        spread: 45,
        origin: { y: 0.8 }
      });
    } catch (err) {
      console.error("Error creating ZIP:", err);
      alert("Export failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const currentOriginalFrame = displayableFrames[currentFrameIdx] || null;

  // Real-time preview frame calculation
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
    <div className="min-h-screen bg-[#12151a] text-slate-300 flex flex-col antialiased">
      {/* Precision Top Navbar */}
      <header className="border-b border-slate-800 bg-[#161a22] px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="flex items-center justify-center w-7 h-7 rounded border border-sky-500/30 bg-sky-500/10 text-sky-400 font-mono text-xs font-bold">
            ILD
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-white font-heading">
                ILDA Geometry & Timing Processor
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/80 text-slate-400">
                v1.1 · Browser WASM/Local
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Vertical safety boundaries, coordinate squashing, and frame normalization</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href="https://github.com/LevenJM/ilda_line_converter"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-mono text-slate-400 hover:text-white border border-slate-700/80 hover:border-slate-600 rounded px-2.5 py-1 transition-colors duration-150"
          >
            GitHub
          </a>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-[1680px] w-full mx-auto p-5 grid grid-cols-1 xl:grid-cols-12 gap-5">
        
        {/* Left Column: File Ledger & Control Rack */}
        <div className="xl:col-span-6 space-y-4">
          
          {/* File Ledger / Queue */}
          <div className="bg-[#161a22] border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400 font-heading">
                  Queue Ledger
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  [{files.length} {files.length === 1 ? 'file' : 'files'}]
                </span>
              </div>
              {files.length > 0 && (
                <button
                  onClick={clearAllFiles}
                  className="text-[11px] font-mono text-rose-400/80 hover:text-rose-400 transition-colors"
                >
                  Clear Queue
                </button>
              )}
            </div>

            {/* Drag and Drop Ingestion */}
            <label className="mt-3.5 border border-dashed border-slate-700/80 hover:border-sky-500/50 rounded-md p-5 flex items-center justify-center gap-3 cursor-pointer bg-[#12151a]/60 hover:bg-[#12151a] transition-colors duration-150 group">
              <UploadCloud className="w-5 h-5 text-slate-500 group-hover:text-sky-400 transition-colors" />
              <div className="text-left">
                <span className="text-xs font-medium text-slate-300 group-hover:text-white block">
                  Select or drop .ild files
                </span>
                <span className="text-[10px] text-slate-500 font-mono block">
                  ILDA Standard Formats 0, 1, 4, and 5
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

            {/* Dense Data Table for Files */}
            {files.length > 0 ? (
              <div className="mt-3.5 border border-slate-800/90 rounded overflow-hidden">
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="bg-[#12151a] border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider">
                        <th className="py-2 px-3 font-medium">Filename</th>
                        <th className="py-2 px-2.5 font-medium text-right">Frames</th>
                        <th className="py-2 px-2.5 font-medium text-right">Y Range</th>
                        <th className="py-2 px-2.5 font-medium text-right">Points</th>
                        <th className="py-2 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {files.map((f, idx) => (
                        <tr
                          key={idx}
                          onClick={() => setSelectedFileIdx(idx)}
                          className={`cursor-pointer transition-colors duration-100 ${
                            selectedFileIdx === idx
                              ? 'bg-sky-950/20 text-white font-medium'
                              : 'hover:bg-slate-800/30 text-slate-300'
                          }`}
                        >
                          <td className="py-2 px-3 truncate max-w-[180px]">
                            <span className={selectedFileIdx === idx ? 'text-sky-400' : 'text-slate-400'}>
                              {selectedFileIdx === idx ? '▸ ' : '  '}
                            </span>
                            {f.name}
                          </td>
                          <td className="py-2 px-2.5 text-right text-slate-400">{f.frames.length}</td>
                          <td className="py-2 px-2.5 text-right text-slate-400">[{f.minY}..{f.maxY}]</td>
                          <td className="py-2 px-2.5 text-right text-slate-400">{f.totalPoints}</td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                              <button
                                title="Download Processed"
                                onClick={() => downloadSingleProcessed(f)}
                                className="p-1 text-slate-400 hover:text-sky-400 transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                title="Remove from Queue"
                                onClick={() => removeFile(idx)}
                                className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
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
            ) : null}
          </div>

          {/* Configuration Rack */}
          <div className="bg-[#161a22] border border-slate-800 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400 font-heading">
                Operation Mode
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Method: {options.mode.toUpperCase()}
              </span>
            </div>

            {/* Mode Selector as segmented button group */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'discard', title: 'Discard', meta: 'Crop points > Y_MAX' },
                { id: 'squash', title: 'Squash', meta: 'Scale height to fit band' },
                { id: 'time', title: 'Time Only', meta: 'Geometry untouched' }
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setOptions({ ...options, mode: m.id as any })}
                  className={`p-2.5 text-left rounded border transition-colors duration-100 ${
                    options.mode === m.id
                      ? 'bg-slate-800 border-sky-500/70 text-white'
                      : 'bg-[#12151a] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-medium font-heading text-slate-200">{m.title}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{m.meta}</div>
                </button>
              ))}
            </div>

            {/* Spatial Safety Limits */}
            {options.mode !== 'time' && (
              <div className="space-y-3.5 pt-2 border-t border-slate-800/80">
                {/* Min Y Slider */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-400 font-medium">Floor Threshold (Y_MIN)</span>
                    <span className="font-mono text-sky-400 font-medium">{options.yMin}</span>
                  </div>
                  <input
                    type="range"
                    min="-32768"
                    max="32767"
                    step="100"
                    value={options.yMin}
                    onChange={(e) => setOptions({ ...options, yMin: parseInt(e.target.value) || 0 })}
                    className="w-full accent-sky-400 bg-slate-800 h-1 rounded cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-600 mt-0.5">
                    <span>-32768 (Bottom)</span>
                    <span>0 (Center)</span>
                    <span>+32767</span>
                  </div>
                </div>

                {/* Max Y Slider */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-400 font-medium">Ceiling Threshold (Y_MAX)</span>
                    <span className="font-mono text-sky-400 font-medium">{options.yMax}</span>
                  </div>
                  <input
                    type="range"
                    min="-32768"
                    max="32767"
                    step="100"
                    value={options.yMax}
                    onChange={(e) => setOptions({ ...options, yMax: parseInt(e.target.value) || 0 })}
                    className="w-full accent-sky-400 bg-slate-800 h-1 rounded cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-600 mt-0.5">
                    <span>-32768</span>
                    <span>15000 (Standard Safety)</span>
                    <span>+32767 (Top)</span>
                  </div>
                </div>

                {/* Preset Bandwidths */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-mono uppercase text-slate-500 mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={() => setOptions({ ...options, yMin: 0, yMax: 15000 })}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
                  >
                    Safety Band [0..15k]
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptions({ ...options, yMin: -10000, yMax: 20000 })}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
                  >
                    Wide [-10k..20k]
                  </button>
                  <button
                    type="button"
                    onClick={() => setOptions({ ...options, yMin: 0, yMax: 32767 })}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
                  >
                    Upper Half [0..32k]
                  </button>
                </div>

                {/* Mode specific checkboxes */}
                {options.mode === 'discard' && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/60">
                    <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.preserveAnimationTiming}
                        onChange={(e) => setOptions({ ...options, preserveAnimationTiming: e.target.checked })}
                        className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                      />
                      <span>Pad empty frames with blank dummy (preserves cadence)</span>
                    </label>

                    <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.blankGaps}
                        onChange={(e) => setOptions({ ...options, blankGaps: e.target.checked })}
                        className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                      />
                      <span>Blank transit spans (suppress beam travel between cut paths)</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Duration Normalization Section */}
            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <label className="flex items-center space-x-2 text-xs font-medium text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.enableDuration || options.mode === 'time'}
                  disabled={options.mode === 'time'}
                  onChange={(e) => setOptions({ ...options, enableDuration: e.target.checked })}
                  className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                />
                <span>Target Playback Duration Normalization</span>
              </label>

              {(options.enableDuration || options.mode === 'time') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-5 pt-1">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Target Duration (s)</label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.5"
                      value={options.targetSeconds}
                      onChange={(e) => setOptions({ ...options, targetSeconds: parseFloat(e.target.value) || 1.0 })}
                      className="w-full bg-[#12151a] border border-slate-700/80 rounded px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">Scanner Rate (kpps)</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={options.scanRateKpps}
                      onChange={(e) => setOptions({ ...options, scanRateKpps: parseFloat(e.target.value) || 30 })}
                      className="w-full bg-[#12151a] border border-slate-700/80 rounded px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1.5 text-xs text-slate-400">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.allowExtend}
                        onChange={(e) => setOptions({ ...options, allowExtend: e.target.checked })}
                        className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                      />
                      <span>Loop shorter clips to reach target</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.allowTrim}
                        onChange={(e) => setOptions({ ...options, allowTrim: e.target.checked })}
                        className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                      />
                      <span>Trim longer clips at boundary</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
              <button
                disabled={files.length === 0 || isProcessing}
                onClick={downloadAllZip}
                className="flex-1 py-2 px-3.5 rounded font-medium text-xs bg-sky-500 hover:bg-sky-400 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-colors duration-150"
              >
                <FileArchive className="w-3.5 h-3.5" />
                {isProcessing ? 'Packaging...' : `Export Batch ZIP (${files.length})`}
              </button>

              {selectedFile && (
                <button
                  disabled={isProcessing}
                  onClick={() => downloadSingleProcessed(selectedFile)}
                  className="py-2 px-3 rounded font-medium text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 flex items-center gap-1.5 transition-colors duration-150"
                >
                  <Download className="w-3.5 h-3.5" />
                  Save Active
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Technical Visualizer & Monitor */}
        <div className="xl:col-span-6 flex flex-col space-y-4">
          <div className="bg-[#161a22] border border-slate-800 rounded-lg p-4 flex-1 flex flex-col">
            
            {/* Monitor Header Toolbar */}
            <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400 font-heading">
                  Oscilloscope & Path Monitor
                </span>
              </div>

              {/* View mode toggle */}
              <div className="flex items-center bg-[#12151a] p-0.5 rounded border border-slate-800 text-xs font-mono">
                <button
                  onClick={() => setViewMode('split')}
                  className={`px-2.5 py-1 rounded transition-colors duration-100 flex items-center gap-1 ${
                    viewMode === 'split' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <SplitSquareVertical className="w-3 h-3" /> Split
                </button>
                <button
                  onClick={() => setViewMode('processed')}
                  className={`px-2.5 py-1 rounded transition-colors duration-100 ${
                    viewMode === 'processed' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  Processed
                </button>
                <button
                  onClick={() => setViewMode('original')}
                  className={`px-2.5 py-1 rounded transition-colors duration-100 ${
                    viewMode === 'original' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  Source
                </button>
              </div>
            </div>

            {/* Visualizer Display Area */}
            <div className="flex-1 flex items-center justify-center min-h-[360px]">
              {viewMode === 'split' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  <LaserCanvas
                    frame={currentOriginalFrame}
                    palette={selectedFile?.palette}
                    options={options}
                    showCropOverlay={true}
                    label="Source Frame"
                    badge="Input"
                    subtext={currentOriginalFrame ? `${currentOriginalFrame.points.length} pts` : ''}
                  />
                  <LaserCanvas
                    frame={currentProcessedFrame}
                    palette={selectedFile?.palette}
                    options={options}
                    showCropOverlay={false}
                    label="Computed Output"
                    badge={options.mode.toUpperCase()}
                    subtext={currentProcessedFrame ? `${currentProcessedFrame.points.length} pts` : ''}
                  />
                </div>
              ) : viewMode === 'processed' ? (
                <div className="max-w-[460px] w-full mx-auto">
                  <LaserCanvas
                    frame={currentProcessedFrame}
                    palette={selectedFile?.palette}
                    options={options}
                    showCropOverlay={false}
                    label="Computed Output"
                    badge={options.mode.toUpperCase()}
                    subtext={currentProcessedFrame ? `${currentProcessedFrame.points.length} pts` : ''}
                  />
                </div>
              ) : (
                <div className="max-w-[460px] w-full mx-auto">
                  <LaserCanvas
                    frame={currentOriginalFrame}
                    palette={selectedFile?.palette}
                    options={options}
                    showCropOverlay={true}
                    label="Source Frame"
                    badge="Input"
                    subtext={currentOriginalFrame ? `${currentOriginalFrame.points.length} pts` : ''}
                  />
                </div>
              )}
            </div>

            {/* Transport Bar */}
            {displayableFrames.length > 1 && (
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => setCurrentFrameIdx(prev => (prev > 0 ? prev - 1 : displayableFrames.length - 1))}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title="Step back"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="p-1 px-2 rounded bg-sky-500 text-slate-950 font-medium hover:bg-sky-400"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setCurrentFrameIdx(prev => (prev + 1) % displayableFrames.length)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title="Step forward"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] text-slate-400 ml-2">
                      {currentFrameIdx + 1} / {displayableFrames.length}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                    <span>Playback:</span>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      step="5"
                      value={playbackFps}
                      onChange={(e) => setPlaybackFps(parseInt(e.target.value))}
                      className="w-16 accent-sky-400 bg-slate-800 h-1 rounded cursor-pointer"
                    />
                    <span className="text-slate-300 w-10 text-right">{playbackFps} fps</span>
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
                  className="w-full accent-sky-400 bg-slate-800 h-1 rounded cursor-pointer"
                />
              </div>
            )}

            {/* Telemetry Metrics Bar */}
            {selectedFile && currentOriginalFrame && currentProcessedFrame && (
              <div className="mt-3 p-2.5 rounded bg-[#12151a] border border-slate-800 text-[11px] font-mono grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">Input</span>
                  <span className="text-slate-200">{currentOriginalFrame.points.length} pts</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">Processed</span>
                  <span className="text-sky-400">{currentProcessedFrame.points.length} pts</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">Delta</span>
                  <span className={currentProcessedFrame.points.length < currentOriginalFrame.points.length ? "text-rose-400" : "text-slate-200"}>
                    {currentProcessedFrame.points.length - currentOriginalFrame.points.length}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">Clip Extents</span>
                  <span className="text-slate-300">[{selectedFile.minY}..{selectedFile.maxY}]</span>
                </div>
              </div>
            )}
          </div>
        </div>

      </main>

      {/* Structured Footer */}
      <footer className="border-t border-slate-800 bg-[#161a22] px-6 py-2.5 flex items-center justify-between text-[11px] font-mono text-slate-500">
        <div>Client-side binary manipulation · ILDA ISP Standard</div>
        <div>No telemetry · Local memory execution only</div>
      </footer>
    </div>
  );
}

export default App;
