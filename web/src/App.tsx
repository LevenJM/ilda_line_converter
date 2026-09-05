import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Upload, Trash2, Sliders, Play, Pause, SkipBack, SkipForward, 
  Download, FileArchive, ShieldAlert, Cpu, Layers 
} from 'lucide-react';
import JSZip from 'jszip';
import confetti from 'canvas-confetti';
import { 
  parseIlda, processIldaFile, 
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

  // Settings matching the Python version
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

  // Real displayable frames (pointCount > 0 && formatCode != 2)
  const displayableFrames: IldaFrame[] = useMemo(() => {
    if (!selectedFile) return [];
    return selectedFile.frames.filter(f => f.header.pointCount > 0 && f.header.formatCode !== 2);
  }, [selectedFile]);

  // Keep frame index valid
  useEffect(() => {
    setCurrentFrameIdx(0);
  }, [selectedFileIdx]);

  // Animation Loop for multi-frame laser preview
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

  // Handle file uploads
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

  // Download a single processed file
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

  // Process and package all files into a Zip
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
      link.download = 'ilda_processed_files.zip';
      link.click();
      URL.revokeObjectURL(url);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.7 }
      });
    } catch (err) {
      console.error("Error generating zip:", err);
      alert("Failed to create ZIP package.");
    } finally {
      setIsProcessing(false);
    }
  };

  const currentFrame = displayableFrames[currentFrameIdx] || null;

  return (
    <div className="min-h-screen bg-[#0f141c] text-gray-200 flex flex-col selection:bg-teal-500 selection:text-black">
      {/* Header */}
      <header className="border-b border-gray-800/80 bg-[#141b24]/90 backdrop-blur sticky top-0 z-40 px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.3)]">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
              ILDA Crowd Safety & Duration Tool
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-700/50">
                Web Assembly / Client-Side
              </span>
            </h1>
            <p className="text-xs text-gray-400">Crop, squash vertical bands, and normalize playback length for ILDA laser projectors</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/LevenJM/ilda_line_converter"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-400 hover:text-teal-300 border border-gray-700 hover:border-teal-500/50 rounded-lg px-3 py-1.5 transition flex items-center gap-1.5"
          >
            GitHub Repository
          </a>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: File Manager & Parameters */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* File Upload / List Card */}
          <div className="bg-[#141b24] border border-gray-800 rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-400 flex items-center gap-2">
                <Layers className="w-4 h-4" /> Loaded Files ({files.length})
              </h2>
              {files.length > 0 && (
                <button
                  onClick={clearAllFiles}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              )}
            </div>

            {/* Drop Zone / Add Button */}
            <label className="border-2 border-dashed border-gray-700 hover:border-teal-500/60 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-[#0f141c]/50 hover:bg-[#0f141c] transition group">
              <Upload className="w-8 h-8 text-gray-500 group-hover:text-teal-400 transition mb-2" />
              <span className="text-sm font-medium text-gray-300 group-hover:text-white">Click or drag & drop ILDA files here</span>
              <span className="text-xs text-gray-500 mt-1">Supports Format 0, 1, 4, 5 (.ild)</span>
              <input
                type="file"
                multiple
                accept=".ild"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {/* File List */}
            {files.length > 0 && (
              <div className="mt-4 max-h-52 overflow-y-auto space-y-1.5 pr-1">
                {files.map((f, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedFileIdx(idx)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-sm cursor-pointer transition ${
                      selectedFileIdx === idx
                        ? 'bg-teal-950/40 border-teal-500/50 text-white'
                        : 'bg-[#18202c] border-gray-800/80 text-gray-300 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <div className={`w-2 h-2 rounded-full ${selectedFileIdx === idx ? 'bg-teal-400 ring-2 ring-teal-400/20' : 'bg-gray-600'}`} />
                      <span className="font-mono truncate">{f.name}</span>
                      <span className="text-xs text-gray-500">
                        ({f.frames.length} frames, Y: [{f.minY} .. {f.maxY}])
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        title="Download Processed"
                        onClick={(e) => { e.stopPropagation(); downloadSingleProcessed(f); }}
                        className="p-1 hover:text-teal-400 text-gray-400 transition"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        title="Remove"
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        className="p-1 hover:text-rose-400 text-gray-500 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mode & Boundary Settings */}
          <div className="bg-[#141b24] border border-gray-800 rounded-xl p-5 shadow-xl space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-400 flex items-center gap-2">
              <Sliders className="w-4 h-4" /> Processing Settings
            </h2>

            {/* Mode selection radio cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'discard', title: 'Discard Out-of-bounds', desc: 'Drops points exceeding safety ceiling' },
                { id: 'squash', title: 'Squash (Vertical Scale)', desc: 'Compresses geometry into safety band' },
                { id: 'time', title: 'Duration Only', desc: 'Leaves geometry intact, loop/trim length' }
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setOptions({ ...options, mode: m.id as any })}
                  className={`p-3 text-left rounded-xl border transition flex flex-col justify-between ${
                    options.mode === m.id
                      ? 'bg-teal-950/40 border-teal-500/70 text-white shadow-sm'
                      : 'bg-[#18202c]/60 border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <span className="font-semibold text-xs tracking-wide text-gray-200">{m.title}</span>
                  <span className="text-[11px] text-gray-500 mt-1 leading-snug">{m.desc}</span>
                </button>
              ))}
            </div>

            {/* Vertical Range Controls */}
            {options.mode !== 'time' && (
              <div className="space-y-4 pt-2 border-t border-gray-800/80">
                {/* Min Y */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-gray-300 font-medium">Min Y Coordinate (0 = Center):</span>
                    <span className="font-mono text-teal-400">{options.yMin}</span>
                  </div>
                  <input
                    type="range"
                    min="-32768"
                    max="32767"
                    step="100"
                    value={options.yMin}
                    onChange={(e) => setOptions({ ...options, yMin: parseInt(e.target.value) || 0 })}
                    className="w-full accent-teal-400 bg-gray-700 h-1.5 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                    <span>-32768 (Bottom)</span>
                    <span>0 (Middle)</span>
                    <span>32767 (Top)</span>
                  </div>
                </div>

                {/* Max Y */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-gray-300 font-medium">Max Y Safety Ceiling:</span>
                    <span className="font-mono text-teal-400">{options.yMax}</span>
                  </div>
                  <input
                    type="range"
                    min="-32768"
                    max="32767"
                    step="100"
                    value={options.yMax}
                    onChange={(e) => setOptions({ ...options, yMax: parseInt(e.target.value) || 0 })}
                    className="w-full accent-teal-400 bg-gray-700 h-1.5 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                    <span>-32768</span>
                    <span>15000 (Default safety)</span>
                    <span>32767</span>
                  </div>
                </div>

                {/* Discard mode specific checkboxes */}
                {options.mode === 'discard' && (
                  <div className="space-y-2 pt-2">
                    <label className="flex items-center space-x-2.5 text-xs text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.preserveAnimationTiming}
                        onChange={(e) => setOptions({ ...options, preserveAnimationTiming: e.target.checked })}
                        className="rounded bg-gray-800 border-gray-700 text-teal-500 focus:ring-0"
                      />
                      <span>Preserve animation timing (insert blanked dummy point if frame is empty)</span>
                    </label>

                    <label className="flex items-center space-x-2.5 text-xs text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.blankGaps}
                        onChange={(e) => setOptions({ ...options, blankGaps: e.target.checked })}
                        className="rounded bg-gray-800 border-gray-700 text-teal-500 focus:ring-0"
                      />
                      <span>Blank gaps (don't draw connecting laser line across discarded spans)</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Playback Duration Section */}
            <div className="pt-4 border-t border-gray-800/80 space-y-3">
              <label className="flex items-center space-x-2.5 text-xs font-semibold text-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.enableDuration || options.mode === 'time'}
                  disabled={options.mode === 'time'}
                  onChange={(e) => setOptions({ ...options, enableDuration: e.target.checked })}
                  className="rounded bg-gray-800 border-gray-700 text-teal-500 focus:ring-0"
                />
                <span>Normalize playback duration</span>
              </label>

              {(options.enableDuration || options.mode === 'time') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6 pt-1">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Target Duration (seconds)</label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.5"
                      value={options.targetSeconds}
                      onChange={(e) => setOptions({ ...options, targetSeconds: parseFloat(e.target.value) || 1.0 })}
                      className="w-full bg-[#18202c] border border-gray-700 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Scanner Rate (kpps, matches .prg)</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={options.scanRateKpps}
                      onChange={(e) => setOptions({ ...options, scanRateKpps: parseFloat(e.target.value) || 30 })}
                      className="w-full bg-[#18202c] border border-gray-700 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1.5 text-xs text-gray-300">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.allowExtend}
                        onChange={(e) => setOptions({ ...options, allowExtend: e.target.checked })}
                        className="rounded bg-gray-800 border-gray-700 text-teal-500 focus:ring-0"
                      />
                      <span>Loop / lengthen files shorter than target</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.allowTrim}
                        onChange={(e) => setOptions({ ...options, allowTrim: e.target.checked })}
                        className="rounded bg-gray-800 border-gray-700 text-teal-500 focus:ring-0"
                      />
                      <span>Trim files longer than target</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Process & Download Action Buttons */}
            <div className="pt-4 flex flex-wrap gap-3">
              <button
                disabled={files.length === 0 || isProcessing}
                onClick={downloadAllZip}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-gray-950 shadow-lg shadow-teal-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
              >
                <FileArchive className="w-4 h-4" />
                {isProcessing ? 'Generating...' : `Export All as ZIP (${files.length})`}
              </button>

              {selectedFile && (
                <button
                  disabled={isProcessing}
                  onClick={() => downloadSingleProcessed(selectedFile)}
                  className="py-3 px-4 rounded-xl font-semibold text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 flex items-center gap-2 transition"
                >
                  <Download className="w-4 h-4" />
                  Download Current
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Laser Visualizer */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          <div className="bg-[#141b24] border border-gray-800 rounded-xl p-5 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-teal-400 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" /> Laser Visualizer
              </h2>
              {selectedFile && (
                <span className="text-xs text-gray-400 font-mono">
                  Frame {currentFrameIdx + 1} / {displayableFrames.length || 1}
                </span>
              )}
            </div>

            {/* Canvas */}
            <div className="flex-1 flex items-center justify-center">
              <LaserCanvas
                frame={currentFrame}
                palette={selectedFile?.palette}
                options={options}
                showCropOverlay={true}
              />
            </div>

            {/* Playback & Frame Slider */}
            {displayableFrames.length > 1 && (
              <div className="mt-4 pt-4 border-t border-gray-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentFrameIdx(prev => (prev > 0 ? prev - 1 : displayableFrames.length - 1))}
                      className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                      title="Previous Frame"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="p-1.5 rounded-lg bg-teal-500 text-black font-semibold hover:bg-teal-400"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setCurrentFrameIdx(prev => (prev + 1) % displayableFrames.length)}
                      className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                      title="Next Frame"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>
                  </div>

                  {/* FPS Slider */}
                  <div className="flex items-center space-x-2 text-xs text-gray-400">
                    <span>Speed:</span>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      step="5"
                      value={playbackFps}
                      onChange={(e) => setPlaybackFps(parseInt(e.target.value))}
                      className="w-20 accent-teal-400 bg-gray-700 h-1.5 rounded-lg cursor-pointer"
                    />
                    <span className="font-mono text-gray-300 w-8">{playbackFps} fps</span>
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
                  className="w-full accent-teal-400 bg-gray-700 h-1.5 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {/* Metadata Info badge */}
            {selectedFile && currentFrame && (
              <div className="mt-4 p-3 rounded-lg bg-[#0f141c] border border-gray-800 text-[11px] text-gray-400 grid grid-cols-2 gap-2 font-mono">
                <div>Format: Code {currentFrame.header.formatCode}</div>
                <div>Points: {currentFrame.header.pointCount}</div>
                <div>Global Y: {selectedFile.minY} .. {selectedFile.maxY}</div>
                <div>Company: {currentFrame.header.companyName || 'N/A'}</div>
              </div>
            )}
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/80 bg-[#141b24]/50 py-3 text-center text-xs text-gray-500">
        100% Client-side. No files are uploaded to any server. Processed safely in your browser.
      </footer>
    </div>
  );
}

export default App;
