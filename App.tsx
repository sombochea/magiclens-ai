import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppMode, AspectRatio, ImageResolution, HistoryItem, Layer, LayerSnapshot, HistoryState } from './types';
import { generateImage, editImage } from './services/geminiService';
import { initDB, saveItem, getItems, deleteItem } from './services/storageService';
import { 
  IconWand, IconDownload, IconUpload, IconTrash, IconPen, 
  IconSpray, IconMarker, IconEraser, IconBrush, IconUndo, 
  IconRedo, IconCamera, IconX, IconHistory, IconMove,
  IconHand, IconZoomIn, IconZoomOut, IconMinimize, IconMaximize,
  IconSave, IconRestore, IconScissors, IconCheck, IconLayers,
  IconEye, IconEyeOff, IconPlus, IconArrowUp, IconArrowDown, IconImage,
  IconSliders, IconCrop, IconRotateCw, IconRotateCcw, IconScaling,
  IconFlipCamera, IconChevronDown, IconChevronRight
} from './components/Icons';

const SUGGESTED_PROMPTS = [
  "A futuristic cyberpunk cityscape with neon lights and flying cars",
  "A mystical forest with glowing mushrooms and ethereal spirits",
  "A majestic dragon made of obsidian scales breathing blue fire",
  "A cozy cottage in a snowy valley at sunset, pixel art style",
  "An abstract portrait with vibrant swirling watercolors",
  "A group of astronauts playing poker on the moon"
];

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

const createLayer = (name: string, width: number, height: number): Layer => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return {
    id: Math.random().toString(36).substring(2, 11),
    name,
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
    canvas,
  };
};

const BLEND_MODES: { value: GlobalCompositeOperation; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
];

const LayerThumbnail = ({ layer }: { layer: Layer }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx && layer.canvas) {
            canvas.width = 40;
            canvas.height = 40;
            ctx.clearRect(0,0, 40, 40);
            const s = 4;
            for(let x=0; x<40; x+=s) {
                for(let y=0; y<40; y+=s) {
                    ctx.fillStyle = (x/s + y/s) % 2 === 0 ? '#333' : '#444';
                    ctx.fillRect(x,y,s,s);
                }
            }
            ctx.drawImage(layer.canvas, 0, 0, 40, 40);
        }
    }, [layer.canvas, layer.visible]); 
    return <canvas ref={canvasRef} width={40} height={40} className="w-8 h-8 rounded border border-white/10 bg-gray-800 object-cover flex-shrink-0" />;
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.GENERATE);
  
  // -- Generation State --
  const [genPrompt, setGenPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [imageSize, setImageSize] = useState<ImageResolution>(ImageResolution.RES_1K);
  const [genModel, setGenModel] = useState<'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview'>('gemini-2.5-flash-image');
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // -- Editor State --
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedImages, setEditedImages] = useState<string[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 }); 
  const [previewBlendMode, setPreviewBlendMode] = useState<GlobalCompositeOperation | null>(null);
  const [showBlendMenu, setShowBlendMenu] = useState(false);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyStep, setHistoryStep] = useState<number>(-1);
  const [showCamera, setShowCamera] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState('#FF0055');
  const [brushSize, setBrushSize] = useState(20);
  const [brushType, setBrushType] = useState<'pen' | 'spray' | 'marker' | 'eraser' | 'pan'>('pen');
  const [brushShape, setBrushShape] = useState<'round' | 'square' | 'textured'>('round');
  const [brushJitter, setBrushJitter] = useState(0); 
  const [brushFlow, setBrushFlow] = useState(100); 
  const [brushFalloff, setBrushFalloff] = useState(0); 
  const [showBrushSettings, setShowBrushSettings] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({ shape: true, advanced: true, colors: false, symmetry: true });
  const [symmetry, setSymmetry] = useState<'none' | 'vertical' | 'horizontal' | 'radial'>('none');
  const [radialCount, setRadialCount] = useState(4);
  const [isCropping, setIsCropping] = useState(false);
  const [cropRect, setCropRect] = useState<{x:number, y:number, w:number, h:number} | null>(null);
  const [showResizeDialog, setShowResizeDialog] = useState(false);
  const [resizeWidth, setResizeWidth] = useState(0);
  const [resizeHeight, setResizeHeight] = useState(0);
  const [keepAspect, setKeepAspect] = useState(true);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [isToolbarMinimized, setIsToolbarMinimized] = useState(false);
  const [galleryItems, setGalleryItems] = useState<HistoryItem[]>([]);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [draggedLayerIndex, setDraggedLayerIndex] = useState<number | null>(null);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); 
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastDrawPointRef = useRef<{x: number, y: number} | null>(null);
  const strokeDistanceRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const needsCompositeRef = useRef<boolean>(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const brushTipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cachedBoundingRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    initDB().then(() => loadGallery());
    const saved = localStorage.getItem('magicLens_session');
    setHasSavedSession(!!saved);
  }, []);

  const toggleSection = (key: string) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const loadGallery = async () => {
    try {
      const items = await getItems();
      setGalleryItems(items);
    } catch (e) {
      console.error("Failed to load history", e);
    }
  };

  const downloadImage = (src: string, filename: string) => {
    const link = document.createElement('a');
    link.href = src;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Pre-render brush tip for performance
  useEffect(() => {
    const size = Math.max(1, brushSize);
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const center = size;
      const radius = size / 2;
      
      ctx.fillStyle = brushColor;
      if (brushShape === 'round') {
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (brushShape === 'square') {
        ctx.fillRect(center - radius, center - radius, size, size);
      } else if (brushShape === 'textured') {
        // High-performance textured tip
        const density = Math.max(20, size * 2);
        for (let i = 0; i < density; i++) {
          const r = Math.sqrt(Math.random()) * radius;
          const theta = Math.random() * Math.PI * 2;
          ctx.globalAlpha = Math.random() * 0.6;
          ctx.fillRect(center + Math.cos(theta) * r, center + Math.sin(theta) * r, 1.5, 1.5);
        }
      }
    }
    brushTipCanvasRef.current = canvas;
  }, [brushShape, brushSize, brushColor]);

  const renderCompositeCanvas = useCallback(() => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas) return;
    const ctx = mainCanvas.getContext('2d', { alpha: false }); // Opt: No alpha for main composition if not needed
    if (!ctx) return;
    
    if (mainCanvas.width !== canvasSize.width || mainCanvas.height !== canvasSize.height) {
      mainCanvas.width = canvasSize.width;
      mainCanvas.height = canvasSize.height;
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
    
    layers.forEach(layer => {
      if (layer.visible) {
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = (layer.id === activeLayerId && previewBlendMode) ? previewBlendMode : layer.blendMode;
        ctx.drawImage(layer.canvas, 0, 0);
      }
    });
    
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    needsCompositeRef.current = false;
  }, [layers, activeLayerId, previewBlendMode, canvasSize]);

  useEffect(() => {
    const loop = () => {
      if (needsCompositeRef.current) renderCompositeCanvas();
      rafIdRef.current = requestAnimationFrame(loop);
    };
    rafIdRef.current = requestAnimationFrame(loop);
    return () => { if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current); };
  }, [renderCompositeCanvas]);

  useEffect(() => { needsCompositeRef.current = true; }, [layers, canvasSize, previewBlendMode, activeLayerId]);

  const toggleCameraFacing = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    startCamera(next);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(videoRef.current, 0, 0);
      initEditorWithImage(canvas.toDataURL());
      setShowCamera(false);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY;
        const scaleChange = delta > 0 ? 1.1 : 0.9;
        setTransform(t => ({ ...t, scale: Math.max(0.1, Math.min(10, t.scale * scaleChange)) }));
    } else {
        setTransform(t => ({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }));
    }
  };

  const handleZoomIn = () => setTransform(t => ({ ...t, scale: Math.min(t.scale * 1.2, 10) }));
  const handleZoomOut = () => setTransform(t => ({ ...t, scale: Math.max(t.scale / 1.2, 0.1) }));
  const handleResetZoom = () => setTransform({ x: 0, y: 0, scale: 1 });

  const handleToggleVisibility = (id: string) => {
    const next = layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l);
    setLayers(next);
    saveHistory(next);
  };

  const handleDeleteLayer = (id: string) => {
    const next = layers.filter(l => l.id !== id);
    setLayers(next);
    if (activeLayerId === id) setActiveLayerId(next[next.length - 1]?.id || null);
    saveHistory(next);
  };

  const handleAddLayer = () => {
    const l = createLayer(`Layer ${layers.length + 1}`, canvasSize.width, canvasSize.height);
    const next = [...layers, l];
    setLayers(next);
    setActiveLayerId(l.id);
    saveHistory(next);
  };

  const handleLayerDrop = (targetIndex: number) => {
    if (draggedLayerIndex === null) return;
    const newLayers = [...layers];
    const [removed] = newLayers.splice(draggedLayerIndex, 1);
    newLayers.splice(targetIndex, 0, removed);
    setLayers(newLayers);
    setDraggedLayerIndex(null);
    saveHistory(newLayers);
  };

  const openResizeDialog = () => {
    setResizeWidth(canvasSize.width);
    setResizeHeight(canvasSize.height);
    setShowResizeDialog(true);
  };

  const handleClearLayer = () => {
    if (!activeLayerId) return;
    const layer = layers.find(l => l.id === activeLayerId);
    if (!layer) return;
    const ctx = layer.canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
      needsCompositeRef.current = true;
      saveHistory();
    }
  };

  const handleUndo = () => { if (historyStep > 0) restoreStep(historyStep - 1); };
  const handleRedo = () => { if (historyStep < history.length - 1) restoreStep(historyStep + 1); };

  const handleGenerate = async () => {
    if (!genPrompt.trim()) return;
    if (genModel === 'gemini-3-pro-image-preview') {
      if (typeof window !== 'undefined' && (window as any).aistudio) {
        try {
          const hasKey = await (window as any).aistudio.hasSelectedApiKey();
          if (!hasKey) await (window as any).aistudio.openSelectKey();
        } catch (e) { console.warn("API key check error", e); }
      }
    }
    setIsGenerating(true);
    try {
      const results = await generateImage(genPrompt, aspectRatio, imageSize, genModel);
      setGeneratedImages(prev => [...results, ...prev]);
      await saveItem({ id: Date.now().toString(), type: 'generated', src: results[0], prompt: genPrompt, timestamp: Date.now() });
      loadGallery();
    } catch (e) { alert("Failed to generate image."); } finally { setIsGenerating(false); }
  };

  const initEditorWithImage = (src: string) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      const scale = Math.min(1, 2048 / Math.max(img.width, img.height));
      const w = Math.floor(img.width * scale);
      const h = Math.floor(img.height * scale);
      setCanvasSize({ width: w, height: h });
      const bg = createLayer('Background', w, h);
      bg.canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
      setLayers([bg]);
      setActiveLayerId(bg.id);
      setHistory([]);
      setHistoryStep(-1);
      setTimeout(() => saveHistory([bg], w, h), 100);
      setTransform({ x: 0, y: 0, scale: 1 });
      needsCompositeRef.current = true;
    };
  };

  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    setShowCamera(true);
    setFacingMode(mode);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch (err) { alert("Camera access failed."); setShowCamera(false); }
  };

  const getSymmetricPoints = (x: number, y: number) => {
    const cx = canvasSize.width / 2;
    const cy = canvasSize.height / 2;
    const points = [{ x, y }];

    if (symmetry === 'vertical') {
      points.push({ x: 2 * cx - x, y });
    } else if (symmetry === 'horizontal') {
      points.push({ x, y: 2 * cy - y });
    } else if (symmetry === 'radial') {
      const angleStep = (2 * Math.PI) / radialCount;
      const cos = Math.cos(angleStep);
      const sin = Math.sin(angleStep);
      let dx = x - cx;
      let dy = y - cy;
      for (let i = 1; i < radialCount; i++) {
        const nx = dx * cos - dy * sin;
        const ny = dx * sin + dy * cos;
        dx = nx;
        dy = ny;
        points.push({ x: cx + dx, y: cy + dy });
      }
    }
    return points;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isDraggingToolbar) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cache the rect for performance during the stroke
    cachedBoundingRectRef.current = canvas.getBoundingClientRect();

    if (brushType === 'pan') {
      setIsPanning(true);
      const {clientX: x, clientY: y} = 'touches' in e ? e.touches[0] : e;
      panStartRef.current = { x: x - transform.x, y: y - transform.y };
      return;
    }

    if (!activeLayerId) return;
    const layer = layers.find(l => l.id === activeLayerId);
    if (!layer || !layer.visible) return;

    setIsDrawing(true);
    strokeDistanceRef.current = 0; 
    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = cachedBoundingRectRef.current;
    const {clientX: cx, clientY: cy} = 'touches' in e ? e.touches[0] : e;
    const x = (cx - rect.left) * (canvas.width / rect.width);
    const y = (cy - rect.top) * (canvas.height / rect.height);
    
    const points = getSymmetricPoints(x, y);
    ctx.lineWidth = brushSize;
    ctx.lineCap = brushShape === 'square' ? 'square' : 'round';
    ctx.lineJoin = brushShape === 'square' ? 'bevel' : 'round';
    ctx.strokeStyle = brushColor;
    ctx.fillStyle = brushColor;

    let alpha = brushType === 'marker' ? 0.5 : 1.0;
    alpha *= (brushFlow / 100);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = brushType === 'eraser' ? 'destination-out' : 'source-over';

    // Batched drawing
    if (brushType === 'pen' || brushType === 'eraser' || brushType === 'marker') {
      ctx.beginPath();
      points.forEach(p => {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    } else if (brushType === 'spray') {
      points.forEach(p => sprayPaint(ctx, p.x, p.y));
    }

    lastDrawPointRef.current = { x, y };
    needsCompositeRef.current = true;
  };

  const sprayPaint = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    const size = brushSize;
    const density = Math.floor(size * (brushFlow / 40)); 
    for (let i = 0; i < density; i++) {
      const r = Math.sqrt(Math.random()) * size;
      const theta = Math.random() * Math.PI * 2;
      ctx.globalAlpha = Math.random() * 0.4;
      ctx.fillRect(x + Math.cos(theta) * r, y + Math.sin(theta) * r, 1.5, 1.5);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPanning) {
      e.preventDefault();
      const {clientX: x, clientY: y} = 'touches' in e ? e.touches[0] : e;
      setTransform(p => ({ ...p, x: x - panStartRef.current.x, y: y - panStartRef.current.y }));
      return;
    }
    if (!isDrawing || !canvasRef.current || !cachedBoundingRectRef.current) return;
    const layer = layers.find(l => l.id === activeLayerId);
    if (!layer) return;
    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;

    const rect = cachedBoundingRectRef.current;
    const {clientX: cx, clientY: cy} = 'touches' in e ? e.touches[0] : e;
    let x = (cx - rect.left) * (canvasRef.current.width / rect.width);
    let y = (cy - rect.top) * (canvasRef.current.height / rect.height);
    
    if (brushJitter > 0) { 
        x += (Math.random() - 0.5) * brushJitter; 
        y += (Math.random() - 0.5) * brushJitter; 
    }
    
    const last = lastDrawPointRef.current;
    if (last) {
        const dx = x - last.x;
        const dy = y - last.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        strokeDistanceRef.current += dist;
        
        let alpha = brushType === 'marker' ? 0.5 : 1.0;
        alpha *= (brushFlow / 100);
        if (brushFalloff > 0) alpha *= Math.max(0, 1 - (strokeDistanceRef.current / (3000 / (brushFalloff * 0.5 || 1))));
        ctx.globalAlpha = alpha;

        const points = getSymmetricPoints(x, y);
        const lastPoints = getSymmetricPoints(last.x, last.y);

        if (brushType === 'spray') {
          points.forEach(p => sprayPaint(ctx, p.x, p.y));
        } else if (brushShape === 'textured' && brushTipCanvasRef.current) {
          const steps = Math.ceil(dist / Math.max(1, brushSize / 8));
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            points.forEach((p, i) => {
              const lp = lastPoints[i];
              const curX = lp.x + (p.x - lp.x) * t;
              const curY = lp.y + (p.y - lp.y) * t;
              ctx.drawImage(brushTipCanvasRef.current!, curX - brushSize, curY - brushSize);
            });
          }
        } else {
          // Optimized batched stroke for standard brushes
          ctx.beginPath();
          points.forEach((p, i) => {
            const lp = lastPoints[i];
            ctx.moveTo(lp.x, lp.y);
            ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
        }
    }

    lastDrawPointRef.current = { x, y };
    needsCompositeRef.current = true;
  };

  const handlePointerUp = () => {
    setIsPanning(false);
    cachedBoundingRectRef.current = null;
    if (isDrawing) { setIsDrawing(false); lastDrawPointRef.current = null; strokeDistanceRef.current = 0; saveHistory(); }
  };

  const saveHistory = (currentLayers: Layer[] = layers, w: number = canvasSize.width, h: number = canvasSize.height) => {
    const snapshots: LayerSnapshot[] = currentLayers.map(l => ({
      id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blendMode: l.blendMode,
      imageData: l.canvas.getContext('2d')!.getImageData(0, 0, l.canvas.width, l.canvas.height)
    }));
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push({ layers: snapshots, size: { width: w, height: h } });
    if (newHistory.length > 20) newHistory.shift();
    else setHistoryStep(newHistory.length - 1);
    setHistory(newHistory);
  };

  const restoreStep = (step: number) => {
    const s = history[step]; if (!s) return;
    setCanvasSize(s.size);
    const restored: Layer[] = s.layers.map(ls => {
      const l = createLayer(ls.name, s.size.width, s.size.height);
      l.id = ls.id; l.visible = ls.visible; l.opacity = ls.opacity; l.blendMode = ls.blendMode;
      l.canvas.getContext('2d')?.putImageData(ls.imageData, 0, 0);
      return l;
    });
    setLayers(restored);
    if (!restored.find(l => l.id === activeLayerId)) setActiveLayerId(restored[restored.length - 1]?.id || null);
    setHistoryStep(step);
    needsCompositeRef.current = true;
  };

  const saveSession = () => {
    if (!canvasRef.current) return;
    try {
      localStorage.setItem('magicLens_session', JSON.stringify({ image: canvasRef.current.toDataURL(), brushColor, brushSize, brushType, transform }));
      setHasSavedSession(true); alert("Session saved!");
    } catch (e) { alert("Session save failed (too large)."); }
  };

  const loadSession = () => {
    const s = localStorage.getItem('magicLens_session');
    if (s) { const data = JSON.parse(s); setBrushColor(data.brushColor); setBrushSize(data.brushSize); initEditorWithImage(data.image); }
  };

  const handleMagicEdit = async () => {
    if (!canvasRef.current || !editPrompt) return;
    setIsEditing(true);
    try {
      const res = await editImage(canvasRef.current.toDataURL('image/png'), editPrompt);
      setEditedImages(res);
    } catch (e) { alert("Edit failed."); } finally { setIsEditing(false); }
  };

  const handleRemoveBackground = async () => {
    if (!canvasRef.current) return;
    setIsEditing(true);
    try {
      const res = await editImage(canvasRef.current.toDataURL('image/png'), "Remove the background from this image. Keep the subject isolated and visible.");
      setEditedImages(res);
    } catch (e) { alert("Background removal failed."); } finally { setIsEditing(false); }
  };

  const handleApplyResult = (src: string) => {
    const img = new Image(); img.src = src;
    img.onload = () => {
        const l = createLayer(`Magic Result`, canvasSize.width, canvasSize.height);
        l.canvas.getContext('2d')?.drawImage(img, 0, 0, canvasSize.width, canvasSize.height);
        const newLayers = [...layers, l];
        setLayers(newLayers); setActiveLayerId(l.id); setEditedImages([]); saveHistory(newLayers);
    };
  };

  const handleMoveLayer = (idx: number, dir: 'up' | 'down') => {
    const next = [...layers]; if (dir === 'up' && idx < layers.length - 1) [next[idx], next[idx+1]] = [next[idx+1], next[idx]];
    else if (dir === 'down' && idx > 0) [next[idx], next[idx-1]] = [next[idx-1], next[idx]];
    setLayers(next); saveHistory(next);
  };

  const handleRotateCanvas = (deg: number) => {
    const w = canvasSize.height, h = canvasSize.width;
    const next = layers.map(l => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d')!; ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(deg * Math.PI / 180); ctx.drawImage(l.canvas, -l.canvas.width/2, -l.canvas.height/2); ctx.restore();
      return { ...l, canvas: c };
    });
    setCanvasSize({ width: w, height: h });
    setLayers(next); saveHistory(next, w, h);
  };

  const applyResize = () => {
    const w = resizeWidth, h = resizeHeight;
    const next = layers.map(l => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d')?.drawImage(l.canvas, 0, 0, w, h); return { ...l, canvas: c };
    });
    setCanvasSize({ width: w, height: h });
    setLayers(next); saveHistory(next, w, h); setShowResizeDialog(false);
  };

  const applyCrop = () => {
      if (!cropRect) return;
      const w = cropRect.w, h = cropRect.h;
      const next = layers.map(l => {
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d')?.drawImage(l.canvas, cropRect.x, cropRect.y, w, h, 0, 0, w, h); return { ...l, canvas: c };
      });
      setCanvasSize({ width: w, height: h });
      setLayers(next); saveHistory(next, w, h); setIsCropping(false); setCropRect(null);
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => initEditorWithImage(ev.target?.result as string); r.readAsDataURL(f); }
  };
  const handleAddImageLayer = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => {
        const img = new Image(); img.src = ev.target?.result as string;
        img.onload = () => {
            const l = createLayer(`Image`, canvasSize.width, canvasSize.height);
            l.canvas.getContext('2d')?.drawImage(img, 0, 0, canvasSize.width, canvasSize.height);
            setLayers(p => [...p, l]); setActiveLayerId(l.id); saveHistory([...layers, l]);
        };
    }; r.readAsDataURL(f); }
  };
  
  const handleDragStart = (e: React.PointerEvent) => {
    setIsDraggingToolbar(true);
    dragStartRef.current = { x: e.clientX - toolbarPos.x, y: e.clientY - toolbarPos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleDragMove = (e: React.PointerEvent) => {
    if (!isDraggingToolbar) return;
    setToolbarPos({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
  };
  const handleDragEnd = (e: React.PointerEvent) => {
    if (!isDraggingToolbar) return;
    setIsDraggingToolbar(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const NavBtn = ({ active, onClick, icon, label, vertical = false }: any) => (
    <button onClick={onClick} className={`flex ${vertical ? 'flex-col gap-2 p-3 w-16' : 'flex-col gap-1 w-full'} items-center justify-center rounded-xl transition-all ${active ? 'text-indigo-400 bg-white/5' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
      <div className={`${active ? 'scale-110' : ''} transition-transform`}>{icon}</div>
      <span className="text-[10px] uppercase font-bold tracking-wider">{label}</span>
    </button>
  );

  const BrushBtn = ({ icon: Icon, active, onClick }: any) => (
    <button onClick={onClick} className={`w-full p-2.5 rounded-xl transition-all flex items-center justify-center ${active ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-800/60 text-gray-400 hover:text-white'}`}>
      <Icon className="w-5 h-5" />
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black text-gray-100 flex flex-col font-sans touch-manipulation">
      {showCamera && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col animate-fade-in">
          <div className="relative flex-1 bg-black overflow-hidden">
             <video ref={videoRef} className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} autoPlay playsInline muted />
             <div className="absolute top-6 left-6 right-6 flex justify-between">
               <button onClick={() => setShowCamera(false)} className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white"><IconX className="w-6 h-6" /></button>
               <button onClick={toggleCameraFacing} className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white"><IconFlipCamera className="w-6 h-6" /></button>
             </div>
             <div className="absolute bottom-12 left-0 right-0 flex justify-center">
                <button onClick={capturePhoto} className="w-24 h-24 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-all"><div className="w-20 h-20 bg-white rounded-full"></div></button>
             </div>
          </div>
        </div>
      )}

      {showResizeDialog && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
                  <h3 className="text-lg font-bold mb-4 text-white">Resize Image</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                      <div><label className="text-xs text-gray-400 uppercase">Width</label><input type="number" value={resizeWidth} onChange={e => { const v = parseInt(e.target.value)||0; setResizeWidth(v); if(keepAspect) setResizeHeight(Math.round(v*(canvasSize.height/canvasSize.width))); }} className="w-full bg-gray-800 rounded p-2 text-white border border-gray-700"/></div>
                      <div><label className="text-xs text-gray-400 uppercase">Height</label><input type="number" value={resizeHeight} onChange={e => { const v = parseInt(e.target.value)||0; setResizeHeight(v); if(keepAspect) setResizeWidth(Math.round(v*(canvasSize.width/canvasSize.height))); }} className="w-full bg-gray-800 rounded p-2 text-white border border-gray-700"/></div>
                  </div>
                  <div className="flex gap-2"><button onClick={() => setShowResizeDialog(false)} className="flex-1 py-3 bg-gray-800 rounded-xl font-bold">Cancel</button><button onClick={applyResize} className="flex-1 py-3 bg-indigo-600 rounded-xl font-bold">Apply</button></div>
              </div>
          </div>
      )}

      <header className="p-4 border-b border-gray-800 flex items-center justify-between bg-black/80 backdrop-blur-md z-30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg"><IconWand className="text-white w-5 h-5" /></div>
          <h1 className="text-xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">MagicLens</h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative w-full overflow-hidden">
        {mode === AppMode.GENERATE && (
          <div className="flex-1 overflow-y-auto p-6 pb-40 animate-fade-in custom-scrollbar">
            <div className="max-w-5xl mx-auto space-y-12">
              <div className="text-center space-y-4">
                 <h2 className="text-5xl font-black tracking-tight text-white">Create Magic</h2>
                 <p className="text-gray-400 text-lg max-w-2xl mx-auto">Generate high-fidelity visual assets using the latest Gemini models.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-gray-900/50 backdrop-blur border border-white/5 rounded-[40px] p-8 shadow-2xl space-y-6">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Your Prompt</label>
                        <button onClick={() => setGenPrompt("")} className="text-[10px] font-black uppercase text-indigo-400 hover:text-indigo-300">Clear</button>
                      </div>
                      <textarea value={genPrompt} onChange={e => setGenPrompt(e.target.value)} placeholder="A celestial fox dancing in the aurora borealis..." className="w-full bg-gray-950/50 border border-white/5 rounded-3xl p-6 h-48 focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none text-lg text-white font-medium outline-none"/>
                    </div>

                    <div className="space-y-4">
                       <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 px-1">Quick Suggestions</label>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                         {SUGGESTED_PROMPTS.map((p, i) => (
                           <button key={i} onClick={() => setGenPrompt(p)} className="text-left px-4 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-[11px] font-medium text-gray-400 border border-transparent hover:border-white/10 transition-all truncate">
                             {p}
                           </button>
                         ))}
                       </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-gray-900/50 backdrop-blur border border-white/5 rounded-[40px] p-8 shadow-2xl space-y-8">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 px-1">Engine</label>
                      <div className="flex bg-gray-950 p-1.5 rounded-2xl border border-white/5">
                        <button onClick={() => setGenModel('gemini-2.5-flash-image')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${genModel === 'gemini-2.5-flash-image' ? 'bg-indigo-600 text-white shadow-xl' : 'text-gray-500 hover:bg-white/5'}`}>Nano Banana</button>
                        <button onClick={() => setGenModel('gemini-3-pro-image-preview')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${genModel === 'gemini-3-pro-image-preview' ? 'bg-indigo-600 text-white shadow-xl' : 'text-gray-500 hover:bg-white/5'}`}>Pro Engine</button>
                      </div>
                      <p className="text-[9px] text-gray-500 font-bold text-center px-4 leading-relaxed">
                        {genModel === 'gemini-2.5-flash-image' ? "Lightweight & fast. Great for quick drafts." : "Maximum quality & detail. Requires API Key selection."}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 px-1">Aspect Ratio</label>
                        <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value as any)} className="w-full bg-gray-950 border border-white/5 rounded-2xl p-3.5 text-xs font-bold text-white outline-none cursor-pointer focus:border-indigo-500/50 transition-colors">
                          {Object.values(AspectRatio).map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 px-1">Resolution</label>
                        <div className="flex bg-gray-950 p-1.5 rounded-2xl border border-white/5">
                           {Object.values(ImageResolution).map(r => (
                             <button key={r} onClick={() => setImageSize(r)} className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${imageSize === r ? 'bg-gray-800 text-white' : 'text-gray-600 hover:text-gray-400'}`}>{r}</button>
                           ))}
                        </div>
                      </div>
                    </div>

                    <button onClick={handleGenerate} disabled={isGenerating || !genPrompt} className="w-full py-6 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-[30px] font-black uppercase tracking-[0.2em] text-[12px] text-white shadow-2xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3">
                      {isGenerating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <><IconWand className="w-5 h-5"/> Generate Magic</>}
                    </button>
                  </div>
                </div>
              </div>

              {generatedImages.length > 0 && (
                <div className="space-y-8 animate-fade-in pt-8">
                   <div className="flex items-center gap-4"><div className="h-px flex-1 bg-white/5"></div><span className="text-[10px] font-black uppercase tracking-widest text-gray-600">Generated Results</span><div className="h-px flex-1 bg-white/5"></div></div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {generatedImages.map((src, i) => (
                        <div key={i} className="group relative rounded-[40px] overflow-hidden border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.4)] bg-gray-900 transition-all hover:scale-[1.02]">
                          <img src={src} className="w-full h-auto object-cover" alt="AI Generated Output"/>
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-4 transition-all duration-300">
                             <button onClick={() => downloadImage(src, `magic-${Date.now()}.png`)} className="px-8 py-4 bg-white text-black rounded-[24px] font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:scale-110 active:scale-95 transition-all">
                               <IconDownload className="w-4 h-4" /> Save Asset
                             </button>
                          </div>
                        </div>
                      ))}
                   </div>
                </div>
              )}
            </div>
          </div>
        )}

        {mode === AppMode.EDIT && (
          <div className="flex-1 flex flex-col relative overflow-hidden">
              {layers.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center items-center p-6 space-y-12">
                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 blur-[100px] rounded-full -z-10 animate-pulse"></div>
                   <div className="text-center space-y-4 max-w-md">
                      <div className="inline-flex p-6 rounded-[40px] bg-indigo-500/10 border border-indigo-500/20"><IconWand className="w-16 h-16 text-indigo-400" /></div>
                      <h2 className="text-4xl font-black tracking-tight">Magic Canvas</h2>
                      <p className="text-gray-400 text-lg">Start your project by adding an image or taking a fresh shot.</p>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
                        <label className="flex flex-col items-center justify-center p-10 bg-gray-900/50 backdrop-blur rounded-[40px] cursor-pointer hover:bg-gray-800 transition-all border border-gray-800 hover:border-indigo-500/30 shadow-2xl group">
                          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><IconUpload className="w-8 h-8 text-indigo-400" /></div>
                          <span className="font-black uppercase text-xs tracking-widest text-white">Upload File</span>
                          <input type="file" className="hidden" accept="image/*" onChange={handleEditFileChange} />
                        </label>
                        <button onClick={() => startCamera('environment')} className="flex flex-col items-center justify-center p-10 bg-gray-900/50 backdrop-blur rounded-[40px] hover:bg-gray-800 transition-all border border-gray-800 hover:border-purple-500/30 shadow-2xl group">
                          <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><IconCamera className="w-8 h-8 text-purple-400" /></div>
                          <span className="font-black uppercase text-xs tracking-widest text-white">Camera</span>
                        </button>
                   </div>
                   {hasSavedSession && <button onClick={loadSession} className="py-4 px-10 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 text-gray-300 font-bold transition-all">Restore Session</button>}
                </div>
              ) : (
                <>
                  <div ref={containerRef} onWheel={handleWheel} className="flex-1 bg-[#0c0c0e] relative overflow-hidden flex items-center justify-center touch-none select-none w-full" style={{ cursor: isCropping ? 'crosshair' : (brushType === 'pan' ? 'grab' : 'crosshair') }}>
                    <div style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, transformOrigin: 'center center', transition: isPanning ? 'none' : 'transform 0.1s ease-out' }}>
                       <div className="relative" style={{ width: canvasSize.width, height: canvasSize.height }}>
                           <canvas ref={canvasRef} onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp} onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp} className="shadow-2xl border border-gray-800 bg-black absolute inset-0" />
                          {isCropping && cropRect && <div className="absolute border-2 border-indigo-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.8)]" style={{left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h}} />}
                       </div>
                    </div>
                    {isEditing && <ProcessingOverlay text="AI Woven Magic..."/>}
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 p-2 bg-black/60 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl z-20">
                      <button onClick={handleZoomIn} className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-white transition-colors"><IconZoomIn className="w-5 h-5"/></button>
                      <button onClick={handleZoomOut} className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-white transition-colors"><IconZoomOut className="w-5 h-5"/></button>
                      <button onClick={handleResetZoom} className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-indigo-400 border-t border-white/5 mt-2"><div className="w-1.5 h-1.5 rounded-full bg-current"/></button>
                    </div>
                    <div className={`absolute right-6 top-6 z-30 transition-all ${showLayerPanel ? 'w-80' : 'w-auto'}`}>
                        {!showLayerPanel && <button onClick={() => setShowLayerPanel(true)} className="p-4 bg-black/80 backdrop-blur border border-white/10 rounded-2xl text-white shadow-xl hover:scale-105 active:scale-95 transition-all"><IconLayers className="w-6 h-6"/></button>}
                        {showLayerPanel && (
                           <div className="bg-[#0f0f11]/95 backdrop-blur-2xl border border-white/10 rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[70vh]">
                                <div className="p-5 border-b border-white/10 flex justify-between items-center"><h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Layers</h3><button onClick={() => setShowLayerPanel(false)} className="text-gray-500 hover:text-white"><IconX className="w-4 h-4"/></button></div>
                                <div className="overflow-y-auto flex-col-reverse flex p-4 gap-3">
                                    {layers.map((l, i) => (
                                        <div 
                                          key={l.id} 
                                          draggable
                                          onDragStart={() => setDraggedLayerIndex(i)}
                                          onDragOver={(e) => e.preventDefault()}
                                          onDrop={() => handleLayerDrop(i)}
                                          onDragEnd={() => setDraggedLayerIndex(null)}
                                          onClick={() => setActiveLayerId(l.id)} 
                                          className={`p-3 rounded-2xl flex items-center gap-4 cursor-pointer border transition-all ${activeLayerId === l.id ? 'bg-indigo-600/10 border-indigo-500/40 shadow-xl' : 'bg-gray-900/40 border-transparent hover:bg-white/5'} ${draggedLayerIndex === i ? 'opacity-40 scale-95 border-indigo-500/50' : ''}`}
                                        >
                                            <div className="p-1 text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing">
                                                <IconMove className="w-4 h-4" />
                                            </div>
                                            <button onClick={e => { e.stopPropagation(); handleToggleVisibility(l.id); }} className={`p-1 transition-colors ${l.visible ? 'text-indigo-400' : 'text-gray-700'}`}>{l.visible ? <IconEye className="w-4 h-4"/> : <IconEyeOff className="w-4 h-4" />}</button>
                                            <LayerThumbnail layer={l}/>
                                            <div className="flex-1 min-w-0"><p className="text-xs font-black truncate text-gray-200">{l.name}</p><p className="text-[8px] font-black uppercase text-gray-600 tracking-tighter">{l.blendMode}</p></div>
                                            {activeLayerId === l.id && <div className="flex flex-col gap-1"><button onClick={e => { e.stopPropagation(); handleMoveLayer(i, 'up'); }} className="text-gray-500 hover:text-white" disabled={i===layers.length-1}><IconArrowUp className="w-3.5 h-3.5"/></button><button onClick={e => { e.stopPropagation(); handleMoveLayer(i, 'down'); }} className="text-gray-500 hover:text-white" disabled={i===0}><IconArrowDown className="w-3.5 h-3.5"/></button></div>}
                                            {activeLayerId === l.id && layers.length > 1 && <button onClick={e => { e.stopPropagation(); handleDeleteLayer(l.id); }} className="text-gray-600 hover:text-red-400 p-1"><IconTrash className="w-3.5 h-3.5"/></button>}
                                        </div>
                                    ))}
                                </div>
                                <div className="p-4 border-t border-white/10 grid grid-cols-2 gap-3 bg-white/5">
                                    <button onClick={handleAddLayer} className="py-3 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest">Layer</button>
                                    <label className="py-3 bg-indigo-600/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center justify-center gap-2 cursor-pointer transition-colors hover:bg-indigo-600/20"><IconImage className="w-4 h-4"/> Image<input type="file" className="hidden" accept="image/*" onChange={handleAddImageLayer}/></label>
                                </div>
                           </div>
                        )}
                    </div>
                    <div ref={toolbarRef} onPointerDown={handleDragStart} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onPointerCancel={handleDragEnd} style={{ transform: `translate(${toolbarPos.x}px, ${toolbarPos.y}px)` }} className={`absolute left-6 top-6 w-auto bg-black/90 backdrop-blur-xl rounded-[32px] border border-white/10 shadow-2xl flex flex-col gap-2 cursor-grab active:cursor-grabbing z-30 transition-all ${isToolbarMinimized ? 'p-2' : 'p-4'}`}>
                        <div className="flex justify-between items-center gap-4" onPointerDown={e => e.stopPropagation()}>
                           <div className="p-1 opacity-40" onPointerDown={handleDragStart}><IconMove className="w-4 h-4 text-gray-400" /></div>
                           <div className="flex gap-2"><button onClick={saveSession} className="text-gray-500 hover:text-emerald-400 transition-colors"><IconSave className="w-4 h-4" /></button><button onClick={() => setIsToolbarMinimized(!isToolbarMinimized)} className="text-gray-500 hover:text-white">{isToolbarMinimized ? <IconMaximize className="w-4 h-4"/> : <IconMinimize className="w-4 h-4" />}</button></div>
                        </div>
                        {!isToolbarMinimized && (
                          <div onPointerDown={e => e.stopPropagation()} className="space-y-4 w-64 animate-fade-in custom-scrollbar overflow-y-auto max-h-[80vh]">
                            <div className="grid grid-cols-4 gap-2">
                              <BrushBtn icon={IconHand} active={brushType === 'pan'} onClick={() => setBrushType('pan')}/>
                              <BrushBtn icon={IconPen} active={brushType === 'pen'} onClick={() => setBrushType('pen')}/>
                              <BrushBtn icon={IconEraser} active={brushType === 'eraser'} onClick={() => setBrushType('eraser')}/>
                              <button onClick={() => setShowToolsMenu(!showToolsMenu)} className={`p-2.5 rounded-xl transition-all ${showToolsMenu ? 'bg-indigo-600 text-white' : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700'}`}><IconCrop className="w-5 h-5"/></button>
                            </div>
                            {showToolsMenu && (
                                <div className="grid grid-cols-4 gap-2 p-2 bg-white/5 rounded-2xl animate-fade-in">
                                    <button onClick={() => { setIsCropping(true); setShowToolsMenu(false); }} className="p-2 bg-gray-900 rounded-xl text-gray-400"><IconCrop className="w-5 h-5"/></button>
                                    <button onClick={openResizeDialog} className="p-2 bg-gray-900 rounded-xl text-gray-400"><IconScaling className="w-5 h-5"/></button>
                                    <button onClick={() => handleRotateCanvas(-90)} className="p-2 bg-gray-900 rounded-xl text-gray-400"><IconRotateCcw className="w-5 h-5"/></button>
                                    <button onClick={() => handleRotateCanvas(90)} className="p-2 bg-gray-900 rounded-xl text-gray-400"><IconRotateCw className="w-5 h-5"/></button>
                                </div>
                            )}
                            <div className="grid grid-cols-4 gap-2">
                                <BrushBtn icon={IconSpray} active={brushType === 'spray'} onClick={() => setBrushType('spray')}/>
                                <BrushBtn icon={IconMarker} active={brushType === 'marker'} onClick={() => setBrushType('marker')}/>
                                <button onClick={handleClearLayer} className="p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20"><IconTrash className="w-5 h-5"/></button>
                                <button onClick={() => setShowBrushSettings(!showBrushSettings)} className={`p-2.5 rounded-xl transition-all ${showBrushSettings ? 'bg-indigo-600 text-white' : 'bg-gray-800/60 text-gray-400'}`}><IconSliders className="w-5 h-5"/></button>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between px-0.5"><span className="text-[9px] font-black uppercase text-gray-500">Size</span><span className="text-[10px] font-bold text-indigo-400">{brushSize}px</span></div>
                                <input type="range" min="2" max="150" value={brushSize} onChange={e => setBrushSize(parseInt(e.target.value))} className="w-full h-1 bg-gray-800 rounded appearance-none cursor-pointer accent-indigo-500"/>
                            </div>
                            {showBrushSettings && (
                                <div className="space-y-2 animate-fade-in">
                                    <div className="rounded-2xl border border-white/5 overflow-hidden">
                                        <button onClick={() => toggleSection('shape')} className="w-full px-3 py-2 flex justify-between items-center bg-white/5 text-[9px] font-black uppercase text-gray-400 tracking-wider">Brush Shape{collapsedSections.shape ? <IconChevronRight className="w-3 h-3"/> : <IconChevronDown className="w-3 h-3"/>}</button>
                                        {!collapsedSections.shape && <div className="p-3 bg-black/20 flex gap-1 bg-gray-900/50 p-1 rounded-xl m-2">{['round', 'square', 'textured'].map(s => <button key={s} onClick={() => setBrushShape(s as any)} className={`flex-1 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${brushShape === s ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500'}`}>{s}</button>)}</div>}
                                    </div>
                                    <div className="rounded-2xl border border-white/5 overflow-hidden">
                                        <button onClick={() => toggleSection('symmetry')} className="w-full px-3 py-2 flex justify-between items-center bg-white/5 text-[9px] font-black uppercase text-gray-400 tracking-wider">Symmetry{collapsedSections.symmetry ? <IconChevronRight className="w-3 h-3"/> : <IconChevronDown className="w-3 h-3"/>}</button>
                                        {!collapsedSections.symmetry && (
                                            <div className="p-3 bg-black/20 space-y-4">
                                                <div className="grid grid-cols-2 gap-1 bg-gray-900/50 p-1 rounded-xl">
                                                    {['none', 'vertical', 'horizontal', 'radial'].map(s => (
                                                        <button key={s} onClick={() => setSymmetry(s as any)} className={`py-1.5 text-[8px] font-black uppercase rounded-lg transition-all ${symmetry === s ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}>{s}</button>
                                                    ))}
                                                </div>
                                                {symmetry === 'radial' && (
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between px-0.5"><span className="text-[8px] font-black uppercase text-gray-500">Radial Slices</span><span className="text-[9px] font-bold text-indigo-400">{radialCount}</span></div>
                                                        <input type="range" min="2" max="12" value={radialCount} onChange={e => setRadialCount(parseInt(e.target.value))} className="w-full h-1 bg-gray-800 rounded accent-indigo-500"/>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="rounded-2xl border border-white/5 overflow-hidden">
                                        <button onClick={() => toggleSection('advanced')} className="w-full px-3 py-2 flex justify-between items-center bg-white/5 text-[9px] font-black uppercase text-gray-400 tracking-wider">Dynamics{collapsedSections.advanced ? <IconChevronRight className="w-3 h-3"/> : <IconChevronDown className="w-3 h-3"/>}</button>
                                        {!collapsedSections.advanced && <div className="p-3 bg-black/20 space-y-4">{[{l:'Flow',v:brushFlow,s:setBrushFlow},{l:'Jitter',v:brushJitter,s:setBrushJitter},{l:'Falloff',v:brushFalloff,s:setBrushFalloff}].map(item => <div key={item.l} className="space-y-1"><div className="flex justify-between px-0.5"><span className="text-[8px] font-black uppercase text-gray-500">{item.l}</span><span className="text-[9px] font-bold text-indigo-400">{item.v}</span></div><input type="range" min="0" max="100" value={item.v} onChange={e => item.s(parseInt(e.target.value))} className="w-full h-1 bg-gray-800 rounded accent-indigo-500"/></div>)}</div>}
                                    </div>
                                    <div className="rounded-2xl border border-white/5 overflow-hidden">
                                        <button onClick={() => toggleSection('colors')} className="w-full px-3 py-2 flex justify-between items-center bg-white/5 text-[9px] font-black uppercase text-gray-400 tracking-wider">Colors{collapsedSections.colors ? <IconChevronRight className="w-3 h-3"/> : <IconChevronDown className="w-3 h-3"/>}</button>
                                        {!collapsedSections.colors && <div className="p-3 bg-black/20 grid grid-cols-5 gap-2">{['#FFFFFF', '#000000', '#FF0055', '#00E5FF', '#FFD700', '#32CD32', '#FF4500', '#9370DB', '#FF69B4', '#8B4513'].map(c => <button key={c} onClick={() => setBrushColor(c)} className={`w-8 h-8 rounded-xl border border-white/10 hover:scale-110 transition-all ${brushColor === c ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-black scale-110' : ''}`} style={{background: c}}/>)}</div>}
                                    </div>
                                </div>
                            )}
                            <button onClick={handleRemoveBackground} className="w-full p-4 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 rounded-[22px] flex items-center justify-center gap-2 border border-indigo-500/20 transition-all active:scale-95 group font-black text-[10px] uppercase tracking-widest"><IconScissors className="w-4 h-4 group-hover:rotate-12 transition-transform" /> Auto Remove BG</button>
                            <div className="flex gap-3"><button onClick={handleUndo} disabled={historyStep <= 0} className="flex-1 py-3 bg-gray-900 rounded-2xl text-gray-500 disabled:opacity-20 flex justify-center"><IconUndo className="w-4 h-4"/></button><button onClick={handleRedo} disabled={historyStep >= history.length - 1} className="flex-1 py-3 bg-gray-900 rounded-2xl text-gray-500 disabled:opacity-20 flex justify-center"><IconRedo className="w-4 h-4"/></button></div>
                          </div>
                        )}
                    </div>
                    {!isCropping && (
                      <div className="absolute bottom-24 md:bottom-12 left-0 right-0 z-40 px-6 flex justify-center pointer-events-none">
                        <div className="w-full max-w-2xl pointer-events-auto">
                           <div className="relative group">
                              <div className="absolute -inset-1 bg-indigo-500/10 rounded-[32px] blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
                              <div className="relative flex items-center gap-4 bg-gray-950/90 backdrop-blur-2xl border border-white/10 rounded-[30px] p-2.5 pl-4 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
                                 <button onClick={() => {setLayers([]); setHistory([]); setHistoryStep(-1);}} className="w-10 h-10 flex items-center justify-center rounded-2xl text-gray-500 hover:text-red-400 transition-colors"><IconX className="w-5 h-5"/></button>
                                 <div className="h-6 w-px bg-white/10"></div>
                                 <input type="text" value={editPrompt} onChange={e => setEditPrompt(e.target.value)} placeholder="Describe magic change..." className="flex-1 bg-transparent border-none outline-none text-white font-bold text-sm md:text-base"/>
                                 <button onClick={handleMagicEdit} disabled={isEditing || !editPrompt} className={`h-11 px-8 rounded-[22px] font-black uppercase tracking-widest text-[10px] text-white shadow-xl transition-all flex items-center gap-3 ${isEditing || !editPrompt ? 'bg-gray-800 text-gray-600' : 'bg-indigo-600 hover:bg-indigo-500 active:scale-95'}`}>{isEditing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <><span className="hidden sm:inline">Apply Magic</span><IconWand className="w-4.5 h-4.5"/></>}</button>
                              </div>
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                   {editedImages.length > 0 && (
                      <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur flex items-center justify-center p-6 animate-fade-in">
                        <div className="bg-[#0c0c0e] rounded-[40px] p-8 max-w-2xl w-full border border-white/10 relative">
                           <button onClick={() => setEditedImages([])} className="absolute -top-4 -right-4 p-3 bg-gray-900 rounded-2xl text-white shadow-xl transition-all hover:rotate-90"><IconX className="w-5 h-5"/></button>
                           <h2 className="text-2xl font-black uppercase mb-8 text-white">Magic Result</h2>
                           <div className="grid grid-cols-1 gap-6">
                              {editedImages.map((src, i) => (
                                <div key={i} className="relative rounded-[32px] overflow-hidden group bg-black shadow-2xl">
                                  <img src={src} className="w-full max-h-[50vh] object-contain" alt="AI Edited Result"/><div className="absolute bottom-6 left-6 right-6 flex gap-4 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0"><button onClick={() => handleApplyResult(src)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-2xl flex items-center justify-center gap-3 hover:bg-indigo-500 transition-all active:scale-95"><IconCheck className="w-5 h-5"/> Add as Layer</button><button onClick={() => downloadImage(src, 'magic.png')} className="py-4 px-6 bg-white/10 backdrop-blur-md text-white rounded-2xl border border-white/20"><IconDownload className="w-5 h-5"/></button></div>
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

        {mode === AppMode.GALLERY && (
          <div className="flex-1 overflow-y-auto p-6 animate-fade-in pb-32">
            <div className="max-w-6xl mx-auto"><h2 className="text-3xl font-black tracking-tight mb-8 text-white">Magic Gallery</h2>
              {galleryItems.length === 0 ? <div className="text-center py-32 text-gray-500"><IconHistory className="w-16 h-16 mx-auto mb-4 opacity-20" /><p>Your creations will appear here.</p></div> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">{galleryItems.map(item => (
                <div key={item.id} className="group relative bg-gray-900/50 rounded-[32px] overflow-hidden border border-white/5 shadow-xl transition-all hover:scale-[1.02] hover:shadow-indigo-500/5"><img src={item.src} className="w-full h-64 object-cover" alt="Gallery item" /><div className="p-6"><div className="flex justify-between items-start mb-3"><span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${item.type === 'generated' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-purple-500/20 text-purple-400'}`}>{item.type}</span><span className="text-[10px] text-gray-600 font-bold">{new Date(item.timestamp).toLocaleDateString()}</span></div><p className="text-sm text-gray-300 font-medium line-clamp-2">{item.prompt}</p></div><div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4"><button onClick={() => downloadImage(item.src, 'gallery.png')} className="p-4 bg-white/10 backdrop-blur rounded-full text-white"><IconDownload className="w-6 h-6"/></button><button onClick={() => { if(confirm('Delete?')) deleteItem(item.id).then(loadGallery); }} className="p-4 bg-red-500/20 rounded-full text-red-400"><IconTrash className="w-6 h-6"/></button></div></div>
              ))}</div>}
            </div>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-lg border-t border-white/5 md:hidden z-40 pb-safe">
        <div className="flex justify-around p-4"><NavBtn active={mode === AppMode.GENERATE} onClick={() => setMode(AppMode.GENERATE)} icon={<IconWand />} label="Create" /><NavBtn active={mode === AppMode.EDIT} onClick={() => setMode(AppMode.EDIT)} icon={<IconPen />} label="Editor" /><NavBtn active={mode === AppMode.GALLERY} onClick={() => setMode(AppMode.GALLERY)} icon={<IconHistory />} label="Gallery" /></div>
      </div>
      <div className="hidden md:flex fixed left-8 top-1/2 -translate-y-1/2 flex-col gap-6 bg-[#0c0c0e]/80 backdrop-blur-2xl border border-white/10 p-3 rounded-[32px] shadow-2xl z-50"><NavBtn active={mode === AppMode.GENERATE} onClick={() => setMode(AppMode.GENERATE)} icon={<IconWand />} label="Create" vertical /><NavBtn active={mode === AppMode.EDIT} onClick={() => setMode(AppMode.EDIT)} icon={<IconPen />} label="Editor" vertical /><NavBtn active={mode === AppMode.GALLERY} onClick={() => setMode(AppMode.GALLERY)} icon={<IconHistory />} label="Gallery" vertical /></div>
    </div>
  );
};

export default App;
