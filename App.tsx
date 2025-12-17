import React, { useState, useRef, useEffect } from 'react';
import { AppMode, AspectRatio, ImageResolution, HistoryItem } from './types';
import { generateImage, editImage } from './services/geminiService';
import { initDB, saveItem, getItems, deleteItem } from './services/storageService';
import { 
  IconWand, IconDownload, IconUpload, IconTrash, IconPen, 
  IconSpray, IconMarker, IconEraser, IconBrush, IconUndo, 
  IconRedo, IconCamera, IconX, IconHistory, IconMove,
  IconHand, IconZoomIn, IconZoomOut, IconMinimize, IconMaximize,
  IconSave, IconRestore, IconScissors, IconCheck
} from './components/Icons';

// Magical Processing Overlay
const ProcessingOverlay = ({ text }: { text: string }) => (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in pointer-events-auto">
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
         <div className="w-24 h-24 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
         <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
               <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-40 animate-pulse"></div>
               <IconWand className="w-8 h-8 text-indigo-400 relative z-10" />
            </div>
         </div>
      </div>
      <div className="flex flex-col items-center">
         <p className="text-white font-bold text-lg tracking-wider uppercase animate-pulse">{text}</p>
         <p className="text-gray-400 text-xs tracking-widest mt-1">AI Magic in Progress</p>
      </div>
    </div>
  </div>
);

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
  const containerRef = useRef<HTMLDivElement>(null);
  
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
  const [brushSize, setBrushSize] = useState(20);
  const [brushType, setBrushType] = useState<'pen' | 'spray' | 'marker' | 'eraser' | 'pan'>('pen');
  const lastDrawPointRef = useRef<{x: number, y: number} | null>(null);

  // Zoom & Pan State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Toolbar State
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [isToolbarMinimized, setIsToolbarMinimized] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // -- Gallery / History State --
  const [galleryItems, setGalleryItems] = useState<HistoryItem[]>([]);
  
  // -- LocalStorage Session State --
  const [hasSavedSession, setHasSavedSession] = useState(false);

  // Init DB and Check Session
  useEffect(() => {
    initDB().then(() => loadGallery());
    const saved = localStorage.getItem('magicLens_session');
    setHasSavedSession(!!saved);
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
        setTransform({ x: 0, y: 0, scale: 1 }); // Reset zoom
      };
      reader.readAsDataURL(file);
      setEditedImages([]);
    }
  };

  // Session Management
  const saveSession = () => {
    if (!canvasRef.current) return;
    try {
      const sessionData = {
        image: canvasRef.current.toDataURL(),
        prompt: editPrompt,
        brushColor,
        brushSize,
        brushType,
        transform
      };
      localStorage.setItem('magicLens_session', JSON.stringify(sessionData));
      setHasSavedSession(true);
      alert("Session saved successfully!");
    } catch (e) {
      console.error(e);
      alert("Failed to save session. The image might be too large for local storage.");
    }
  };

  const loadSession = () => {
    try {
      const saved = localStorage.getItem('magicLens_session');
      if (saved) {
        const session = JSON.parse(saved);
        setEditPrompt(session.prompt || '');
        setBrushColor(session.brushColor || '#FF0055');
        setBrushSize(session.brushSize || 20);
        setBrushType(session.brushType || 'pen');
        setTransform(session.transform || { x: 0, y: 0, scale: 1 });
        setEditPreview(session.image); // This triggers the useEffect to redraw canvas
      }
    } catch (e) {
       console.error(e);
       alert("Failed to load session.");
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
        setTransform({ x: 0, y: 0, scale: 1 });
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
      e.preventDefault();
      e.stopPropagation(); 
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

  // --- Zoom/Pan Logic ---
  const handleZoomIn = () => setTransform(p => ({ ...p, scale: Math.min(p.scale + 0.5, 5) }));
  const handleZoomOut = () => setTransform(p => ({ ...p, scale: Math.max(p.scale - 0.5, 0.5) }));
  const handleResetZoom = () => setTransform({ x: 0, y: 0, scale: 1 });

  // --- Drawing Logic ---
  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = ('touches' in e) ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const xRelative = clientX - rect.left;
    const yRelative = clientY - rect.top;
    const x = xRelative * (canvas.width / rect.width);
    const y = yRelative * (canvas.height / rect.height);
    return { x, y };
  };

  const sprayPaint = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size: number) => {
    ctx.fillStyle = color;
    const density = Math.floor(size * 1.5); 
    for (let i = 0; i < density; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.sqrt(Math.random()) * size; 
      const dotX = x + radius * Math.cos(angle);
      const dotY = y + radius * Math.sin(angle);
      const dotSize = Math.random() * 1.5 + 0.5;
      
      ctx.globalAlpha = Math.random() * 0.5 + 0.2; 
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0; 
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isDraggingToolbar) return;

    if (brushType === 'pan') {
      setIsPanning(true);
      const clientX = ('touches' in e) ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = ('touches' in e) ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      panStartRef.current = { x: clientX - transform.x, y: clientY - transform.y };
      return;
    }

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
      ctx.globalAlpha = 0.5;
    } else if (brushType === 'spray') {
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    if (brushType === 'spray') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      sprayPaint(ctx, x, y, brushColor, brushSize);
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y);
      lastDrawPointRef.current = { x, y };
      // Draw a single dot
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPanning) {
      e.preventDefault(); 
      const clientX = ('touches' in e) ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = ('touches' in e) ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      setTransform(prev => ({
        ...prev,
        x: clientX - panStartRef.current.x,
        y: clientY - panStartRef.current.y
      }));
      return;
    }

    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { x, y } = getCanvasPoint(e, canvas);
    
    if (brushType === 'spray') {
      sprayPaint(ctx, x, y, brushColor, brushSize);
      ctx.beginPath(); 
      ctx.moveTo(x, y);
    } else {
      // Smooth Drawing Logic with Quadratic Curves
      const p1 = lastDrawPointRef.current;
      if (p1) {
         const mid = { x: (p1.x + x) / 2, y: (p1.y + y) / 2 };
         ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
         ctx.stroke();
         lastDrawPointRef.current = { x, y };
      }
    }
  };

  const handlePointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (isDrawing) {
      setIsDrawing(false);
      lastDrawPointRef.current = null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.globalAlpha = 1;
      }
      saveHistory(); 
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
        const maxDim = 2048; 
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx?.clearRect(0,0, canvas.width, canvas.height);
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
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

  const handleRemoveBackground = async () => {
    if (!canvasRef.current) return;
    setIsEditing(true);
    try {
      const base64Canvas = canvasRef.current.toDataURL('image/png');
      const results = await editImage(base64Canvas, "Remove the background from this image. Keep the subject isolated and visible.");
      setEditedImages(results);
      
      const newItem: HistoryItem = {
        id: generateId(),
        type: 'edited',
        src: results[0],
        prompt: "Remove background",
        timestamp: Date.now()
      };
      await saveItem(newItem);
      loadGallery();
    } catch (e) {
      alert("Failed to remove background.");
    } finally {
      setIsEditing(false);
    }
  };

  const handleApplyResult = (src: string) => {
    setEditPreview(src); // This triggers the useEffect to redraw canvas with new image
    setEditedImages([]); // Close overlay
  };

  const handleDeleteHistory = async (id: string) => {
    if (confirm("Delete this image?")) {
      await deleteItem(id);
      loadGallery();
    }
  };

  // Brush Component
  const BrushBtn = ({ type, icon: Icon, active, onClick, label }: any) => (
    <div className="relative group w-full">
      <button
        onClick={onClick}
        className={`w-full p-2.5 rounded-lg transition-all flex items-center justify-center ${active ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-400' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
      >
        <Icon className="w-5 h-5" />
      </button>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 backdrop-blur text-white text-[10px] font-medium rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
        {label}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black text-gray-100 flex flex-col font-sans touch-manipulation">
      
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
      <header className="p-4 border-b border-gray-800 flex items-center justify-between bg-black/80 backdrop-blur-md z-30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
            <IconWand className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            MagicLens
          </h1>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 relative w-full">
        
        {/* MODE: GENERATE */}
        {mode === AppMode.GENERATE && (
          <div className="flex-1 overflow-y-auto p-4 animate-fade-in pb-32">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 shadow-xl">
                <h2 className="text-2xl font-bold mb-4 text-white">Create</h2>
                <p className="text-gray-400 mb-6 text-sm">Gemini 3.0 Pro Image Preview</p>
                
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
                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl font-bold text-white shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isGenerating ? "Dreaming..." : <> <IconWand className="w-5 h-5" /> Generate Magic </>}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Generation Placeholder */}
                {isGenerating && (
                    <div className="aspect-square rounded-2xl overflow-hidden relative bg-gray-900 border border-gray-800 shadow-2xl flex items-center justify-center">
                        <ProcessingOverlay text="Dreaming..." />
                    </div>
                )}
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
          </div>
        )}

        {/* MODE: EDIT */}
        {mode === AppMode.EDIT && (
          <div className="flex-1 flex flex-col relative overflow-hidden animate-fade-in">
              {!editPreview ? (
                <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-center">
                   <div className="max-w-lg mx-auto w-full pb-24 space-y-4">
                     <div className="bg-gray-900 p-8 rounded-3xl border border-gray-800 text-center shadow-2xl">
                       <h2 className="text-3xl font-bold mb-2">Magic Canvas</h2>
                       <p className="text-gray-400 mb-8">Start by choosing a source</p>
                       
                       <div className="grid grid-cols-2 gap-4">
                          <label className="flex flex-col items-center justify-center h-40 bg-gray-800 rounded-2xl cursor-pointer hover:bg-gray-700 transition-all border border-gray-700 hover:border-indigo-500 group">
                            <IconUpload className="w-10 h-10 mb-3 text-indigo-500 group-hover:scale-110 transition-transform" />
                            <span className="font-semibold text-sm">Upload</span>
                            <input type="file" className="hidden" accept="image/*" onChange={handleEditFileChange} />
                          </label>
                          <button 
                            onClick={startCamera}
                            className="flex flex-col items-center justify-center h-40 bg-gray-800 rounded-2xl cursor-pointer hover:bg-gray-700 transition-all border border-gray-700 hover:border-purple-500 group"
                          >
                            <IconCamera className="w-10 h-10 mb-3 text-purple-500 group-hover:scale-110 transition-transform" />
                            <span className="font-semibold text-sm">Camera</span>
                          </button>
                       </div>
                       
                       {hasSavedSession && (
                          <button 
                            onClick={loadSession}
                            className="w-full mt-4 py-4 bg-gray-800 hover:bg-gray-700 rounded-2xl border border-gray-700 text-gray-300 font-semibold flex items-center justify-center gap-2 transition-all"
                          >
                            <IconRestore className="w-5 h-5 text-green-500" />
                            Resume Previous Session
                          </button>
                       )}
                     </div>
                   </div>
                </div>
              ) : (
                <>
                  {/* Canvas Viewport */}
                  <div 
                    ref={containerRef}
                    className="flex-1 bg-[#121212] relative overflow-hidden flex items-center justify-center touch-none select-none w-full"
                    style={{ cursor: brushType === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair' }}
                  >
                    <div 
                      style={{ 
                        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                        transformOrigin: '0 0',
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        marginLeft: canvasRef.current ? -(canvasRef.current.width * 0.5) : 0,
                        marginTop: canvasRef.current ? -(canvasRef.current.height * 0.5) : 0,
                        transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                      }}
                    >
                       <canvas 
                        ref={canvasRef}
                        onMouseDown={handlePointerDown}
                        onMouseMove={handlePointerMove}
                        onMouseUp={handlePointerUp}
                        onMouseLeave={handlePointerUp}
                        onTouchStart={handlePointerDown}
                        onTouchMove={handlePointerMove}
                        onTouchEnd={handlePointerUp}
                        className="shadow-2xl border border-gray-800 bg-gray-900"
                        style={{ maxWidth: 'unset' }} // Override max-w-full to allow zoom
                      />
                    </div>

                    {/* Editor Processing Overlay (Scoped to Canvas Container) */}
                    {isEditing && <ProcessingOverlay text="Weaving Magic..." />}
                    
                    {/* Floating Minimalist Zoom Controls - Right Side */}
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 p-1.5 bg-black/60 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl z-20">
                      <button onClick={handleZoomIn} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                        <IconZoomIn className="w-5 h-5" />
                      </button>
                      
                      {/* Vertical text indicator */}
                      <span className="text-[10px] font-medium text-gray-400 rotate-90 py-2 select-none tracking-widest whitespace-nowrap">
                        {Math.round(transform.scale * 100)}%
                      </span>
                      
                      <button onClick={handleZoomOut} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                        <IconZoomOut className="w-5 h-5" />
                      </button>
                      
                      <button onClick={handleResetZoom} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-colors mt-1 border-t border-white/10" title="Reset">
                         <div className="w-2 h-2 rounded-full bg-current" />
                      </button>
                    </div>

                    {/* Draggable Brushes Toolbar */}
                    <div 
                        ref={toolbarRef}
                        onPointerDown={handleDragStart}
                        onPointerMove={handleDragMove}
                        onPointerUp={handleDragEnd}
                        onPointerCancel={handleDragEnd}
                        style={{ transform: `translate(${toolbarPos.x}px, ${toolbarPos.y}px)` }}
                        className={`absolute left-4 top-4 w-auto bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl flex flex-col gap-2 cursor-grab active:cursor-grabbing touch-none z-30 transition-all ${isToolbarMinimized ? 'p-2' : 'p-3'}`}
                    >
                        {/* Header with Minimize & Save */}
                        <div className="flex justify-between items-center px-1 gap-2" onPointerDown={(e) => e.stopPropagation()}>
                           <div className="p-1 cursor-grab active:cursor-grabbing" onPointerDown={handleDragStart}>
                              <IconMove className="w-4 h-4 text-gray-500" />
                           </div>
                           <div className="flex items-center gap-1">
                             <div className="relative group">
                               <button onClick={saveSession} className="text-gray-400 hover:text-green-400">
                                  <IconSave className="w-4 h-4" />
                               </button>
                               <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 backdrop-blur text-white text-[10px] font-medium rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                  Save Session
                               </div>
                             </div>
                             <div className="relative group">
                               <button onClick={() => setIsToolbarMinimized(!isToolbarMinimized)} className="text-gray-400 hover:text-white">
                                  {isToolbarMinimized ? <IconMaximize className="w-4 h-4"/> : <IconMinimize className="w-4 h-4" />}
                               </button>
                               <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 backdrop-blur text-white text-[10px] font-medium rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                  {isToolbarMinimized ? 'Maximize' : 'Minimize'}
                               </div>
                             </div>
                           </div>
                        </div>

                        {!isToolbarMinimized && (
                          <div onPointerDown={(e) => e.stopPropagation()} className="space-y-4 animate-fade-in">
                            <div className="grid grid-cols-3 gap-2">
                              <BrushBtn type="pan" icon={IconHand} active={brushType === 'pan'} onClick={() => setBrushType('pan')} label="Pan Tool" />
                              <BrushBtn type="pen" icon={IconPen} active={brushType === 'pen'} onClick={() => setBrushType('pen')} label="Pen Tool" />
                              <BrushBtn type="spray" icon={IconSpray} active={brushType === 'spray'} onClick={() => setBrushType('spray')} label="Spray Paint" />
                              <BrushBtn type="marker" icon={IconMarker} active={brushType === 'marker'} onClick={() => setBrushType('marker')} label="Marker" />
                              <BrushBtn type="eraser" icon={IconEraser} active={brushType === 'eraser'} onClick={() => setBrushType('eraser')} label="Eraser" />
                              <div className="relative group w-full">
                                <button onClick={clearCanvas} className="w-full p-2.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center">
                                  <IconTrash className="w-5 h-5" />
                                </button>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 backdrop-blur text-white text-[10px] font-medium rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                  Clear Canvas
                                </div>
                              </div>
                            </div>

                            {/* Remove Background Tool */}
                            <button 
                                onClick={handleRemoveBackground}
                                title="Isolate subject from background"
                                className="w-full p-3 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-lg flex items-center justify-center gap-2 border border-indigo-500/30 transition-all"
                            >
                                <IconScissors className="w-4 h-4" />
                                <span className="text-xs font-bold">Remove BG</span>
                            </button>

                            <div className="h-px bg-white/10"></div>
                            
                            <div className="flex justify-between gap-1">
                               <div className="relative group flex-1">
                                 <button onClick={handleUndo} disabled={historyStep <= 0} className="w-full p-2 text-gray-400 hover:text-white disabled:opacity-30 flex justify-center"><IconUndo /></button>
                                 <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 backdrop-blur text-white text-[10px] font-medium rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                    Undo
                                 </div>
                               </div>
                               <div className="relative group flex-1">
                                 <button onClick={handleRedo} disabled={historyStep >= history.length - 1} className="w-full p-2 text-gray-400 hover:text-white disabled:opacity-30 flex justify-center"><IconRedo /></button>
                                 <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 backdrop-blur text-white text-[10px] font-medium rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                    Redo
                                 </div>
                               </div>
                            </div>
                             <div>
                                <input 
                                  type="range" min="2" max="100" value={brushSize} 
                                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                  className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                             </div>
                             <div className="grid grid-cols-4 gap-2">
                                {['#FFFFFF', '#000000', '#FF0055', '#00E5FF', '#FFD700', '#32CD32', '#FF4500', '#9370DB'].map(color => (
                                  <button 
                                    key={color}
                                    onClick={() => setBrushColor(color)}
                                    className={`w-6 h-6 rounded-full border border-white/20 hover:scale-110 transition-transform ${brushColor === color ? 'ring-2 ring-offset-2 ring-offset-black ring-white' : ''}`}
                                    style={{background: color}}
                                  />
                                ))}
                             </div>
                          </div>
                        )}
                        {isToolbarMinimized && (
                           <div className="flex justify-center py-2" onPointerDown={(e) => e.stopPropagation()}>
                              <div className="w-6 h-6 rounded-full" style={{background: brushColor, border: '1px solid white'}}></div>
                           </div>
                        )}
                    </div>

                    {/* Modern Floating "Magic Bar" Input */}
                    <div className="absolute bottom-24 md:bottom-8 left-0 right-0 z-40 px-4 flex justify-center pointer-events-none">
                      <div className="w-full max-w-2xl pointer-events-auto">
                         <div className="relative group">
                            {/* Glow Effect */}
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full opacity-20 group-hover:opacity-50 blur transition duration-500"></div>
                            
                            {/* Glass Container */}
                            <div className="relative flex items-center gap-2 bg-gray-950/80 backdrop-blur-2xl border border-white/10 rounded-full p-2 pl-2 shadow-2xl">
                               
                               <button 
                                 onClick={() => {setEditPreview(null); setEditFile(null);}} 
                                 className="w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                                 title="Cancel"
                               >
                                 <IconX className="w-5 h-5" />
                               </button>

                               <div className="h-6 w-px bg-white/10 mx-1"></div>

                               <input
                                type="text"
                                value={editPrompt}
                                onChange={(e) => setEditPrompt(e.target.value)}
                                placeholder="Describe the magic change..."
                                className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-500 text-sm md:text-base font-medium min-w-0"
                              />
                              
                              <button
                                onClick={handleMagicEdit}
                                disabled={isEditing || !editPrompt}
                                className={`
                                    h-10 px-6 rounded-full font-bold text-white shadow-lg transition-all flex items-center gap-2
                                    ${isEditing || !editPrompt ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/25 active:scale-95'}
                                `}
                              >
                                 {isEditing ? (
                                   <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                                 ) : (
                                   <>
                                     <span className="hidden sm:inline">Magic</span>
                                     <IconWand className="w-4 h-4" />
                                   </>
                                 )}
                              </button>
                            </div>
                         </div>
                      </div>
                    </div>
                  </div>

                  {/* Results Overlay */}
                   {editedImages.length > 0 && (
                      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
                        <div className="bg-gray-900 rounded-3xl p-6 max-w-2xl w-full border border-gray-700 shadow-2xl relative">
                           <button onClick={() => setEditedImages([])} className="absolute top-4 right-4 p-2 bg-gray-800 rounded-full hover:bg-gray-700">
                              <IconX />
                           </button>
                           <h2 className="text-xl font-bold mb-4">Magic Result</h2>
                           <div className="grid grid-cols-1 gap-4">
                              {editedImages.map((src, idx) => (
                                <div key={idx} className="relative rounded-2xl overflow-hidden group">
                                  <img src={src} className="w-full max-h-[60vh] object-contain bg-black" alt="Result"/>
                                  
                                  <div className="absolute bottom-4 right-4 flex gap-2">
                                     <button 
                                        onClick={() => handleApplyResult(src)}
                                        className="px-6 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg flex items-center gap-2 hover:bg-indigo-500 transition-colors"
                                      >
                                        <IconCheck className="w-4 h-4" /> Apply
                                      </button>
                                      <button 
                                        onClick={() => downloadImage(src, `magic-edit-result-${Date.now()}.png`)}
                                        className="px-6 py-3 bg-white text-black rounded-full font-bold shadow-lg flex items-center gap-2 hover:bg-gray-200 transition-colors"
                                      >
                                        <IconDownload className="w-4 h-4" /> Save
                                      </button>
                                  </div>
                                </div>
                              ))}
                           </div>
                        </div>
                      </div>
                   )}
                </>
              )}
          </div>
        )}

        {/* MODE: GALLERY */}
        {mode === AppMode.GALLERY && (
          <div className="flex-1 overflow-y-auto p-4 animate-fade-in pb-32">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-2xl font-bold text-white mb-6">Gallery</h2>
              {galleryItems.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                  <IconHistory className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p>No magic created yet. Start creating!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {galleryItems.map((item) => (
                    <div key={item.id} className="group relative bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-lg">
                      <img src={item.src} alt={item.prompt} className="w-full h-56 object-cover" />
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-2">
                           <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${item.type === 'generated' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-purple-500/20 text-purple-300'}`}>
                             {item.type.toUpperCase()}
                           </span>
                           <span className="text-xs text-gray-500">{new Date(item.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-gray-300 line-clamp-2" title={item.prompt}>{item.prompt}</p>
                      </div>
                      
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                         <button 
                          onClick={() => downloadImage(item.src, `magic-gallery-${item.id}.png`)}
                          className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md"
                         >
                           <IconDownload className="w-6 h-6" />
                         </button>
                         <button 
                          onClick={() => handleDeleteHistory(item.id)}
                          className="p-3 bg-red-500/20 hover:bg-red-500/40 rounded-full text-red-400 backdrop-blur-md"
                         >
                           <IconTrash className="w-6 h-6" />
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-950/90 backdrop-blur-lg border-t border-gray-800 md:hidden z-40 pb-safe">
        <div className="flex justify-around p-3">
          <NavBtn active={mode === AppMode.GENERATE} onClick={() => setMode(AppMode.GENERATE)} icon={<IconWand />} label="Create" />
          <NavBtn active={mode === AppMode.EDIT} onClick={() => setMode(AppMode.EDIT)} icon={<IconPen />} label="Editor" />
          <NavBtn active={mode === AppMode.GALLERY} onClick={() => setMode(AppMode.GALLERY)} icon={<IconHistory />} label="Gallery" />
        </div>
      </div>

      {/* Desktop Navigation */}
      <div className="hidden md:flex fixed left-6 top-1/2 -translate-y-1/2 flex-col gap-4 bg-gray-900/90 backdrop-blur border border-gray-700 p-2 rounded-2xl shadow-2xl z-50">
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
    className={`flex ${vertical ? 'flex-col gap-2 p-3 w-16' : 'flex-col gap-1 w-full'} items-center justify-center rounded-xl transition-all ${active ? 'text-indigo-400 bg-white/5' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
  >
    <div className={`${active ? 'scale-110' : ''} transition-transform`}>{icon}</div>
    <span className="text-[10px] uppercase font-bold tracking-wider">{label}</span>
  </button>
);

export default App;
