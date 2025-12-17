import React, { useState, useRef, useEffect } from 'react';
import { AppMode, AspectRatio, ImageResolution, HistoryItem } from './types';
import { generateImage, editImage } from './services/geminiService';
import { initDB, saveItem, getItems, deleteItem } from './services/storageService';
import { 
  IconWand, IconDownload, IconUpload, IconTrash, IconPen, 
  IconSpray, IconMarker, IconEraser, IconBrush, IconUndo, 
  IconRedo, IconCamera, IconX, IconHistory, IconMove
} from './components/Icons';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.GENERATE);
  
  // -- Generation State --
  const [genPrompt, setGenPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [imageSize, setImageSize] = useState<ImageResolution>(ImageResolution.RES_1K);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // -- Editing State --
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreview, setEditPreview] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedImages, setEditedImages] = useState<string[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Undo/Redo History
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyStep, setHistoryStep] = useState<number>(-1);

  // Camera State
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Brush State
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#FF0055');
  const [brushSize, setBrushSize] = useState(20); // Default larger for spray
  const [brushType, setBrushType] = useState<'pen' | 'spray' | 'marker' | 'eraser'>('pen');

  // Toolbar Dragging State
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // -- Gallery / History State --
  const [galleryItems, setGalleryItems] = useState<HistoryItem[]>([]);

  // Init DB
  useEffect(() => {
    initDB().then(() => loadGallery());
  }, []);

  const loadGallery = async () => {
    try {
      const items = await getItems();
      setGalleryItems(items);
    } catch (e) {
      console.error("Failed to load history", e);
    }
  };

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

  // Download Helper
  const downloadImage = (src: string, filename: string) => {
    const link = document.createElement('a');
    link.href = src;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Handlers: Generation ---
  const handleGenerate = async () => {
    if (!genPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const results = await generateImage(genPrompt, aspectRatio, imageSize);
      setGeneratedImages(prev => [...results, ...prev]);
      
      // Save to History
      const newItem: HistoryItem = {
        id: generateId(),
        type: 'generated',
        src: results[0],
        prompt: genPrompt,
        timestamp: Date.now()
      };
      await saveItem(newItem);
      loadGallery();

    } catch (e) {
      alert("Failed to generate image. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Handlers: Editing ---
  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setEditFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setEditPreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
      setEditedImages([]);
    }
  };

  // Camera Logic
  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Unable to access camera. Please check permissions.");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        setEditPreview(dataUrl);
        // Convert to file for consistency
        fetch(dataUrl)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], "camera-capture.png", { type: "image/png" });
            setEditFile(file);
          });
        setEditedImages([]);
        stopCamera();
      }
    }
  };

  // Undo/Redo Logic
  const saveHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(imageData);
    
    // Limit history size to prevent memory issues
    if (newHistory.length > 20) {
      newHistory.shift();
    } else {
      setHistoryStep(prev => prev + 1);
    }
    setHistory(newHistory);
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      setHistoryStep(newStep);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx && history[newStep]) {
        ctx.putImageData(history[newStep], 0, 0);
      }
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      const newStep = historyStep + 1;
      setHistoryStep(newStep);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx && history[newStep]) {
        ctx.putImageData(history[newStep], 0, 0);
      }
    }
  };

  // --- Toolbar Dragging Logic ---
  const handleDragStart = (e: React.PointerEvent) => {
    if (toolbarRef.current) {
      // Prevent default to avoid scrolling on touch devices if only dragging handle
      e.preventDefault();
      e.stopPropagation(); // Stop bubbling to canvas

      toolbarRef.current.setPointerCapture(e.pointerId);
      setIsDraggingToolbar(true);
      dragStartRef.current = {
        x: e.clientX - toolbarPos.x,
        y: e.clientY - toolbarPos.y
      };
    }
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (isDraggingToolbar) {
      e.preventDefault();
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      setToolbarPos({ x: newX, y: newY });
    }
  };

  const handleDragEnd = (e: React.PointerEvent) => {
    setIsDraggingToolbar(false);
    if (toolbarRef.current) {
        toolbarRef.current.releasePointerCapture(e.pointerId);
    }
  };

  // --- Drawing Logic ---
  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = ('touches' in e) ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const sprayPaint = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size: number) => {
    ctx.fillStyle = color;
    // Increased density and randomness for better effect
    const density = Math.floor(size * 1.5); 
    for (let i = 0; i < density; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.sqrt(Math.random()) * size; // Uniform distribution within circle
      const dotX = x + radius * Math.cos(angle);
      const dotY = y + radius * Math.sin(angle);
      
      // Random dot size for texture
      const dotSize = Math.random() * 1.5 + 0.5;
      
      ctx.globalAlpha = Math.random() * 0.5 + 0.2; // Variable opacity
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }
    // Reset alpha used for other brushes
    ctx.globalAlpha = 1.0; 
  };

  const handleCanvasDrawStart = (e: React.MouseEvent | React.TouchEvent) => {
    // If dragging toolbar via touch, don't draw
    if (isDraggingToolbar) return;

    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    const { x, y } = getCanvasPoint(e, canvas);
    
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = brushColor;
    ctx.fillStyle = brushColor;

    if (brushType === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
    } else if (brushType === 'marker') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.5; // Highlighter effect
    } else if (brushType === 'spray') {
      ctx.globalCompositeOperation = 'source-over';
      // Alpha is handled inside sprayPaint
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);

    if (brushType === 'spray') {
      sprayPaint(ctx, x, y, brushColor, brushSize);
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const handleCanvasDrawMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    
    // Prevent scrolling on mobile while drawing
    // if (e.cancelable) e.preventDefault(); 
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { x, y } = getCanvasPoint(e, canvas);
    
    if (brushType === 'spray') {
      sprayPaint(ctx, x, y, brushColor, brushSize);
      ctx.beginPath(); // Reset path to avoid connecting spray points with lines
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const handleCanvasDrawEnd = () => {
    if (isDrawing) {
      setIsDrawing(false);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        // Reset global alpha just in case
        ctx.globalAlpha = 1;
      }
      saveHistory(); // Save state after stroke
    }
  };

  // Sync canvas with uploaded image and initialize history
  useEffect(() => {
    if (editPreview && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const img = new Image();
      img.src = editPreview;
      img.onload = () => {
        // Ensure max width fits screen on mobile
        const containerWidth = window.innerWidth - 32; // padding
        const maxCanvasWidth = Math.min(containerWidth, 800);
        
        const ratio = img.height / img.width;
        canvas.width = maxCanvasWidth;
        canvas.height = maxCanvasWidth * ratio;
        
        ctx?.clearRect(0,0, canvas.width, canvas.height);
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Reset and Init History
        const initialData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        if (initialData) {
            setHistory([initialData]);
            setHistoryStep(0);
        }
      };
    }
  }, [editPreview]);

  const clearCanvas = () => {
    if (history.length > 0) {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
             ctx.putImageData(history[0], 0, 0);
             setHistory([history[0]]);
             setHistoryStep(0);
        }
    }
  };

  const handleMagicEdit = async () => {
    if (!canvasRef.current || !editPrompt) return;
    setIsEditing(true);
    try {
      const base64Canvas = canvasRef.current.toDataURL('image/png');
      const results = await editImage(base64Canvas, editPrompt);
      setEditedImages(results);

      // Save to History
      const newItem: HistoryItem = {
        id: generateId(),
        type: 'edited',
        src: results[0],
        prompt: editPrompt,
        timestamp: Date.now()
      };
      await saveItem(newItem);
      loadGallery();

    } catch (e) {
      alert("Failed to edit image.");
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    if (confirm("Delete this image?")) {
      await deleteItem(id);
      loadGallery();
    }
  };

  // Brush Component
  const BrushBtn = ({ type, icon: Icon, active, onClick }: any) => (
    <button
      onClick={onClick}
      className={`p-2 rounded-lg transition-all ${active ? 'bg-indigo-600 text-white shadow-lg scale-110' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
    >
      <Icon className="w-5 h-5" />
    </button>
  );

  return (
    <div className="min-h-screen bg-black text-gray-100 flex flex-col pb-20 md:pb-0 font-sans">
      
      {/* Camera Overlay */}
      {showCamera && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="relative flex-1 bg-black">
             <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
             <button 
                onClick={stopCamera} 
                className="absolute top-4 right-4 p-3 bg-black/50 rounded-full text-white"
             >
               <IconX className="w-6 h-6" />
             </button>
          </div>
          <div className="p-8 bg-black flex justify-center items-center">
            <button 
              onClick={capturePhoto} 
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center hover:bg-white/10 transition-colors"
            >
               <div className="w-16 h-16 bg-white rounded-full"></div>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="p-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
            <IconWand className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            MagicLens AI
          </h1>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full">
        
        {/* MODE: GENERATE */}
        {mode === AppMode.GENERATE && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 shadow-xl">
              <h2 className="text-2xl font-bold mb-4 text-white">Create New Worlds</h2>
              <p className="text-gray-400 mb-6 text-sm">Powered by Gemini 3.0 Pro Image Preview (Nano Banana Pro)</p>
              
              <div className="space-y-4">
                <textarea
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  placeholder="Describe the image you want to create..."
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl p-4 focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all resize-none h-32 text-lg"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Aspect Ratio</label>
                    <select 
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500"
                    >
                      {Object.values(AspectRatio).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Resolution</label>
                    <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
                      {Object.values(ImageResolution).map(r => (
                        <button
                          key={r}
                          onClick={() => setImageSize(r)}
                          className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${imageSize === r ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !genPrompt}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl font-bold text-white shadow-lg hover:shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95 flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                      Dreaming...
                    </>
                  ) : (
                    <>
                      <IconWand className="w-5 h-5" />
                      Generate Magic
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {generatedImages.map((src, idx) => (
                <div key={idx} className="group relative rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
                  <img src={src} alt="Generated" className="w-full h-auto object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    <button 
                      onClick={() => downloadImage(src, `magic-gen-${Date.now()}.png`)}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform"
                    >
                      <IconDownload className="w-4 h-4" /> Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODE: EDIT */}
        {mode === AppMode.EDIT && (
          <div className="space-y-6 animate-fade-in pb-24 md:pb-0">
             <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 shadow-xl">
              <h2 className="text-2xl font-bold mb-2 text-white">Magic Editor</h2>
              <p className="text-gray-400 mb-6 text-sm">Upload or capture a photo, doodle on it, and transform it.</p>

              {!editPreview ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-64">
                   <label className="flex flex-col items-center justify-center h-full border-2 border-gray-700 border-dashed rounded-2xl cursor-pointer hover:bg-gray-800/50 transition-all">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <IconUpload className="w-10 h-10 mb-3 text-indigo-500" />
                      <p className="text-sm text-gray-400 font-semibold">Upload Photo</p>
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={handleEditFileChange} />
                  </label>
                  
                  <button 
                    onClick={startCamera}
                    className="flex flex-col items-center justify-center h-full border-2 border-gray-700 border-dashed rounded-2xl cursor-pointer hover:bg-gray-800/50 transition-all"
                  >
                     <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <IconCamera className="w-10 h-10 mb-3 text-purple-500" />
                      <p className="text-sm text-gray-400 font-semibold">Take Photo</p>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Canvas Container - ensure it's relative for floating toolbar if not dragged out */}
                  <div className="relative w-full flex justify-center bg-gray-950 rounded-lg overflow-hidden border border-gray-800 touch-none group">
                    <canvas 
                      ref={canvasRef}
                      onMouseDown={handleCanvasDrawStart}
                      onMouseMove={handleCanvasDrawMove}
                      onMouseUp={handleCanvasDrawEnd}
                      onMouseLeave={handleCanvasDrawEnd}
                      onTouchStart={handleCanvasDrawStart}
                      onTouchMove={handleCanvasDrawMove}
                      onTouchEnd={handleCanvasDrawEnd}
                      className="cursor-crosshair max-w-full"
                    />
                    
                    {/* Floating Tools Toolbar - Draggable */}
                    <div 
                        ref={toolbarRef}
                        onPointerDown={handleDragStart}
                        onPointerMove={handleDragMove}
                        onPointerUp={handleDragEnd}
                        onPointerCancel={handleDragEnd}
                        style={{ transform: `translate(${toolbarPos.x}px, ${toolbarPos.y}px)` }}
                        className="absolute bottom-4 left-0 right-0 mx-auto w-max max-w-[95%] bg-black/80 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl flex flex-col gap-2 cursor-grab active:cursor-grabbing touch-none z-10"
                    >
                        {/* Drag Handle */}
                        <div className="flex justify-center items-center py-1 opacity-50 hover:opacity-100">
                           <IconMove className="w-8 h-4 text-gray-400" />
                        </div>

                        {/* Brushes & History */}
                        <div 
                          className="flex items-center gap-2 justify-center flex-wrap"
                          onPointerDown={(e) => e.stopPropagation()} // Allow clicking buttons without dragging
                        >
                          <BrushBtn type="pen" icon={IconBrush} active={brushType === 'pen'} onClick={() => setBrushType('pen')} />
                          <BrushBtn type="spray" icon={IconSpray} active={brushType === 'spray'} onClick={() => setBrushType('spray')} />
                          <BrushBtn type="marker" icon={IconMarker} active={brushType === 'marker'} onClick={() => setBrushType('marker')} />
                          <BrushBtn type="eraser" icon={IconEraser} active={brushType === 'eraser'} onClick={() => setBrushType('eraser')} />
                          
                          <div className="w-px h-6 bg-white/20 mx-1"></div>
                          
                          <button onClick={handleUndo} disabled={historyStep <= 0} className="p-2 text-gray-400 hover:text-white disabled:opacity-30">
                            <IconUndo className="w-5 h-5" />
                          </button>
                          <button onClick={handleRedo} disabled={historyStep >= history.length - 1} className="p-2 text-gray-400 hover:text-white disabled:opacity-30">
                            <IconRedo className="w-5 h-5" />
                          </button>
                           <button onClick={clearCanvas} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg" title="Clear All">
                            <IconTrash className="w-5 h-5" />
                          </button>
                        </div>

                        {/* Settings: Size & Color */}
                        <div 
                          className="flex items-center gap-4 px-2 pt-1 border-t border-white/10"
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                           <div className="flex-1 min-w-[100px]">
                              <input 
                                type="range" 
                                min="2" 
                                max="50" 
                                value={brushSize} 
                                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                              />
                           </div>
                           <div className="flex gap-1 overflow-x-auto no-scrollbar py-1 max-w-[150px]">
                              {['#FFFFFF', '#000000', '#FF0055', '#00E5FF', '#FFD700', '#32CD32'].map(color => (
                                <button 
                                  key={color}
                                  onClick={() => setBrushColor(color)}
                                  className={`w-5 h-5 flex-shrink-0 rounded-full border border-white/20 hover:scale-110 transition-transform ${brushColor === color ? 'ring-2 ring-offset-1 ring-offset-black ring-white' : ''}`}
                                  style={{background: color}}
                                />
                              ))}
                           </div>
                        </div>
                    </div>
                  </div>

                  {/* Input */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="Describe the magic you want to add..."
                      className="flex-1 bg-gray-950 border border-gray-700 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none text-base"
                    />
                    <button
                      onClick={handleMagicEdit}
                      disabled={isEditing || !editPrompt}
                      className="w-full sm:w-auto px-6 py-4 sm:py-0 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold disabled:opacity-50 transition-colors flex items-center justify-center"
                    >
                      {isEditing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/> : "Transform"}
                    </button>
                  </div>
                  
                  <button onClick={() => {setEditPreview(null); setEditFile(null);}} className="text-sm text-gray-500 hover:text-white underline">
                    Choose a different photo
                  </button>
                </div>
              )}
            </div>

             {/* Results */}
             {editedImages.length > 0 && (
                <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                  <h3 className="text-lg font-bold mb-4 text-white">Magic Result</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {editedImages.map((src, idx) => (
                      <div key={idx} className="relative rounded-xl overflow-hidden">
                        <img src={src} alt="Edited" className="w-full" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                           <button 
                            onClick={() => downloadImage(src, `magic-edit-${Date.now()}.png`)}
                            className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform"
                          >
                            <IconDownload className="w-4 h-4" /> Save Image
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
             )}
          </div>
        )}

        {/* MODE: GALLERY */}
        {mode === AppMode.GALLERY && (
          <div className="space-y-6 animate-fade-in pb-20">
            <h2 className="text-2xl font-bold text-white mb-6">Your Gallery</h2>
            {galleryItems.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <IconHistory className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p>No magic created yet. Start creating!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {galleryItems.map((item) => (
                  <div key={item.id} className="group relative bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
                    <img src={item.src} alt={item.prompt} className="w-full h-48 object-cover" />
                    <div className="p-4">
                      <p className="text-xs text-indigo-400 font-bold uppercase tracking-wider mb-1">{item.type}</p>
                      <p className="text-sm text-gray-300 line-clamp-2" title={item.prompt}>{item.prompt}</p>
                    </div>
                    
                    {/* Hover Actions */}
                    <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                       <button 
                        onClick={() => downloadImage(item.src, `magic-gallery-${item.id}.png`)}
                        className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md"
                        title="Download"
                       >
                         <IconDownload className="w-6 h-6" />
                       </button>
                       <button 
                        onClick={() => handleDeleteHistory(item.id)}
                        className="p-3 bg-red-500/20 hover:bg-red-500/40 rounded-full text-red-400 backdrop-blur-md"
                        title="Delete"
                       >
                         <IconTrash className="w-6 h-6" />
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-gray-800 md:hidden z-40 pb-safe">
        <div className="flex justify-around p-4">
          <NavBtn active={mode === AppMode.GENERATE} onClick={() => setMode(AppMode.GENERATE)} icon={<IconWand />} label="Create" />
          <NavBtn active={mode === AppMode.EDIT} onClick={() => setMode(AppMode.EDIT)} icon={<IconPen />} label="Editor" />
          <NavBtn active={mode === AppMode.GALLERY} onClick={() => setMode(AppMode.GALLERY)} icon={<IconHistory />} label="Gallery" />
        </div>
      </div>

      {/* Desktop Navigation */}
      <div className="hidden md:flex fixed left-8 top-1/2 -translate-y-1/2 flex-col gap-4 bg-gray-900/90 backdrop-blur border border-gray-700 p-2 rounded-2xl shadow-2xl">
          <NavBtn active={mode === AppMode.GENERATE} onClick={() => setMode(AppMode.GENERATE)} icon={<IconWand />} label="Create" vertical />
          <NavBtn active={mode === AppMode.EDIT} onClick={() => setMode(AppMode.EDIT)} icon={<IconPen />} label="Editor" vertical />
          <NavBtn active={mode === AppMode.GALLERY} onClick={() => setMode(AppMode.GALLERY)} icon={<IconHistory />} label="Gallery" vertical />
      </div>
    </div>
  );
};

const NavBtn = ({ active, onClick, icon, label, vertical = false }: any) => (
  <button 
    onClick={onClick}
    className={`flex ${vertical ? 'flex-col gap-2 p-4' : 'flex-col gap-1'} items-center justify-center rounded-xl transition-all ${active ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}
  >
    <div className={`${active ? 'scale-110' : ''} transition-transform`}>{icon}</div>
    <span className="text-[10px] uppercase font-bold tracking-wider">{label}</span>
  </button>
);

export default App;
