
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
  IconSliders, IconCrop, IconRotateCw, IconRotateCcw, IconScaling
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

// Helper function to create a new layer
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
            ctx.clearRect(0,0, canvas.width, canvas.height);
            // Draw a checkerboard background first
            const s = 4;
            for(let x=0; x<canvas.width; x+=s) {
                for(let y=0; y<canvas.height; y+=s) {
                    ctx.fillStyle = (x/s + y/s) % 2 === 0 ? '#333' : '#444';
                    ctx.fillRect(x,y,s,s);
                }
            }
            // Draw the source canvas scaled down
            ctx.drawImage(layer.canvas, 0, 0, canvas.width, canvas.height);
        }
    }); 

    return <canvas ref={canvasRef} width={40} height={40} className="w-8 h-8 rounded border border-white/10 bg-gray-800 object-cover flex-shrink-0" />;
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.GENERATE);
  
  // -- Generation State --
  const [genPrompt, setGenPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [imageSize, setImageSize] = useState<ImageResolution>(ImageResolution.RES_1K);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // -- Editing State --
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedImages, setEditedImages] = useState<string[]>([]);
  
  // Layer System
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 }); 
  
  // Layer Blend Preview
  const [previewBlendMode, setPreviewBlendMode] = useState<GlobalCompositeOperation | null>(null);
  const [showBlendMenu, setShowBlendMenu] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); 
  const replaceInputRef = useRef<HTMLInputElement>(null); 
  
  // Undo/Redo History
  const [history, setHistory] = useState<HistoryState[]>([]);
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
  const [brushShape, setBrushShape] = useState<'round' | 'square' | 'textured'>('round');
  const [brushJitter, setBrushJitter] = useState(0); 
  const [brushFlow, setBrushFlow] = useState(100); 
  const [brushFalloff, setBrushFalloff] = useState(0); 
  const [showBrushSettings, setShowBrushSettings] = useState(false);

  // Texture Cache
  const brushTipCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Transform Tools State
  const [isCropping, setIsCropping] = useState(false);
  const [cropRect, setCropRect] = useState<{x:number, y:number, w:number, h:number} | null>(null);
  const [cropInteraction, setCropInteraction] = useState<string | null>(null);
  const cropStartRef = useRef<{x: number, y: number, rect: {x:number, y:number, w:number, h:number}}>({x:0,y:0, rect:{x:0,y:0,w:0,h:0}});

  const [showResizeDialog, setShowResizeDialog] = useState(false);
  const [resizeWidth, setResizeWidth] = useState(0);
  const [resizeHeight, setResizeHeight] = useState(0);
  const [keepAspect, setKeepAspect] = useState(true);

  const [showToolsMenu, setShowToolsMenu] = useState(false);

  const lastDrawPointRef = useRef<{x: number, y: number} | null>(null);
  const strokeDistanceRef = useRef(0);

  // Performance Optimization Refs
  const rafIdRef = useRef<number | null>(null);
  const needsCompositeRef = useRef<boolean>(false);

  // Zoom & Pan State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef<{ dist: number; center: {x:number, y:number}; startScale: number; startTranslate: {x:number, y:number}; startCoords: {x:number, y:number} } | null>(null);

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

  const downloadImage = (src: string, filename: string) => {
    const link = document.createElement('a');
    link.href = src;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Optimization: Textured Brush Tip Cache ---
  useEffect(() => {
    if (brushShape === 'textured') {
      const size = Math.max(1, brushSize);
      const canvas = document.createElement('canvas');
      canvas.width = size * 2;
      canvas.height = size * 2;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const radius = size / 2;
        const density = Math.max(10, size * 2);
        const center = size;
        ctx.fillStyle = brushColor;
        for (let i = 0; i < density; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * radius;
            const dx = Math.cos(angle) * r;
            const dy = Math.sin(angle) * r;
            ctx.globalAlpha = Math.random(); 
            ctx.fillRect(center + dx, center + dy, 1, 1); 
        }
      }
      brushTipCanvasRef.current = canvas;
    }
  }, [brushShape, brushSize, brushColor]);

  // --- Optimization: Throttled Composite Rendering ---
  const renderCompositeCanvas = useCallback(() => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas) return;
    const ctx = mainCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    
    // Draw layers from bottom to top
    layers.forEach(layer => {
      if (layer.visible) {
        ctx.globalAlpha = layer.opacity;
        
        // Use preview blend mode if active, otherwise use layer's blend mode
        if (layer.id === activeLayerId && previewBlendMode) {
             ctx.globalCompositeOperation = previewBlendMode;
        } else {
             ctx.globalCompositeOperation = layer.blendMode;
        }

        ctx.drawImage(layer.canvas, 0, 0);
      }
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    needsCompositeRef.current = false;
  }, [layers, activeLayerId, previewBlendMode]);

  useEffect(() => {
    const loop = () => {
      if (needsCompositeRef.current) {
        renderCompositeCanvas();
      }
      rafIdRef.current = requestAnimationFrame(loop);
    };
    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [renderCompositeCanvas]);

  // Trigger composite when layers array or UI state changes
  useEffect(() => {
    needsCompositeRef.current = true;
  }, [layers, canvasSize, previewBlendMode, activeLayerId]);

  useEffect(() => {
    setShowBlendMenu(false);
    setPreviewBlendMode(null);
  }, [activeLayerId]);


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

  const initEditorWithImage = (src: string) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      const maxDim = 2048; 
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const width = Math.floor(img.width * scale);
      const height = Math.floor(img.height * scale);
      
      setCanvasSize({ width, height });
      
      // Update Main Canvas Size
      if (canvasRef.current) {
        canvasRef.current.width = width;
        canvasRef.current.height = height;
      }

      // Create Background Layer
      const bgLayer = createLayer('Background', width, height);
      const ctx = bgLayer.canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      
      setLayers([bgLayer]);
      setActiveLayerId(bgLayer.id);
      
      // Reset history
      setHistory([]);
      setHistoryStep(-1);
      
      // Save initial state. Need to pass width/height explicitly for first save.
      setTimeout(() => saveHistory([bgLayer], width, height), 100);
      
      setTransform({ x: 0, y: 0, scale: 1 });
    };
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
           initEditorWithImage(ev.target.result as string);
        }
      };
      reader.readAsDataURL(file);
      setEditedImages([]);
    }
  };

  // Add Image as Layer (Blend/Composite)
  const handleAddImageLayer = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          const src = ev.target.result as string;
          
          if (layers.length === 0) {
            initEditorWithImage(src);
          } else {
             // Add as new layer
             const img = new Image();
             img.src = src;
             img.onload = () => {
                const newLayer = createLayer(`Image ${layers.length + 1}`, canvasSize.width, canvasSize.height);
                const ctx = newLayer.canvas.getContext('2d');
                
                // Fit image to canvas (contain)
                const imgRatio = img.width / img.height;
                const canvasRatio = canvasSize.width / canvasSize.height;
                let drawWidth, drawHeight, offsetX, offsetY;

                if (imgRatio > canvasRatio) {
                    drawWidth = canvasSize.width;
                    drawHeight = canvasSize.width / imgRatio;
                    offsetX = 0;
                    offsetY = (canvasSize.height - drawHeight) / 2;
                } else {
                    drawHeight = canvasSize.height;
                    drawWidth = canvasSize.height * imgRatio;
                    offsetY = 0;
                    offsetX = (canvasSize.width - drawWidth) / 2;
                }

                ctx?.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
                
                const newLayers = [...layers, newLayer];
                setLayers(newLayers);
                setActiveLayerId(newLayer.id);
                saveHistory(newLayers);
             };
          }
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleReplaceLayerContent = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0] && activeLayerId) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (ev) => {
             const src = ev.target?.result as string;
             if (src) {
                 const img = new Image();
                 img.src = src;
                 img.onload = () => {
                     const currentLayers = [...layers];
                     const activeLayerIndex = currentLayers.findIndex(l => l.id === activeLayerId);
                     if (activeLayerIndex > -1) {
                         const activeLayer = currentLayers[activeLayerIndex];
                         const ctx = activeLayer.canvas.getContext('2d');
                         ctx?.clearRect(0, 0, activeLayer.canvas.width, activeLayer.canvas.height);
                         
                         const imgRatio = img.width / img.height;
                         const canvasRatio = canvasSize.width / canvasSize.height;
                         let drawWidth, drawHeight, offsetX, offsetY;
                         if (imgRatio > canvasRatio) {
                            drawWidth = canvasSize.width;
                            drawHeight = canvasSize.width / imgRatio;
                            offsetX = 0;
                            offsetY = (canvasSize.height - drawHeight) / 2;
                        } else {
                            drawHeight = canvasSize.height;
                            drawWidth = canvasSize.height * imgRatio;
                            offsetY = 0;
                            offsetX = (canvasSize.width - drawWidth) / 2;
                        }
                        ctx?.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
                        setLayers(currentLayers);
                        needsCompositeRef.current = true;
                        saveHistory(currentLayers);
                     }
                 }
             }
          }
          reader.readAsDataURL(file);
      }
      if (replaceInputRef.current) replaceInputRef.current.value = '';
  };

  // Session Management
  const saveSession = () => {
    if (!canvasRef.current) return;
    try {
      // For session, we simplify and just save the composite image
      // A full layer save would require serializing multiple canvases
      const sessionData = {
        image: canvasRef.current.toDataURL(),
        prompt: editPrompt,
        brushColor,
        brushSize,
        brushType,
        brushShape,
        brushJitter,
        brushFlow,
        brushFalloff,
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
        setBrushShape(session.brushShape || 'round');
        setBrushJitter(session.brushJitter || 0);
        setBrushFlow(session.brushFlow || 100);
        setBrushFalloff(session.brushFalloff || 0);
        setTransform(session.transform || { x: 0, y: 0, scale: 1 });
        initEditorWithImage(session.image); 
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
        initEditorWithImage(dataUrl);
        setEditedImages([]);
        stopCamera();
      }
    }
  };

  // Undo/Redo Logic for Layers
  const saveHistory = (currentLayers: Layer[] = layers, w: number = canvasSize.width, h: number = canvasSize.height) => {
    // Snapshot all layers
    const layerSnapshots: LayerSnapshot[] = currentLayers.map(l => {
      const ctx = l.canvas.getContext('2d');
      return {
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        blendMode: l.blendMode,
        imageData: ctx!.getImageData(0, 0, l.canvas.width, l.canvas.height)
      };
    });
    
    // Store size in history too
    const historyState: HistoryState = {
        layers: layerSnapshots,
        size: { width: w, height: h }
    };

    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(historyState);
    
    if (newHistory.length > 10) { // Limit history depth
      newHistory.shift();
    } else {
      setHistoryStep(prev => prev + 1);
    }
    setHistory(newHistory);
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      restoreHistoryStep(newStep);
      setHistoryStep(newStep);
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      const newStep = historyStep + 1;
      restoreHistoryStep(newStep);
      setHistoryStep(newStep);
    }
  };

  const restoreHistoryStep = (stepIndex: number) => {
    const state = history[stepIndex];
    if (!state) return;

    // Restore canvas size
    setCanvasSize(state.size);
    if (canvasRef.current) {
        canvasRef.current.width = state.size.width;
        canvasRef.current.height = state.size.height;
    }

    // Reconstruct layers from snapshot
    const restoredLayers: Layer[] = state.layers.map(s => {
      const layer = createLayer(s.name, state.size.width, state.size.height);
      layer.id = s.id;
      layer.visible = s.visible;
      layer.opacity = s.opacity;
      layer.blendMode = s.blendMode;
      const ctx = layer.canvas.getContext('2d');
      if (ctx) {
        if (s.imageData.width !== state.size.width || s.imageData.height !== state.size.height) {
            layer.canvas.width = s.imageData.width;
            layer.canvas.height = s.imageData.height;
        }
        ctx.putImageData(s.imageData, 0, 0);
      }
      return layer;
    });

    setLayers(restoredLayers);
    // Ensure active layer is valid
    if (restoredLayers.length > 0 && !restoredLayers.find(l => l.id === activeLayerId)) {
        setActiveLayerId(restoredLayers[restoredLayers.length - 1].id);
    }
  };

  // --- Layer Properties Change ---
  const handleLayerOpacityChange = (id: string, opacity: number) => {
    const newLayers = layers.map(l => l.id === id ? { ...l, opacity } : l);
    setLayers(newLayers);
  };
  
  const handleLayerOpacityCommit = (id: string, opacity: number) => {
     const newLayers = layers.map(l => l.id === id ? { ...l, opacity } : l);
     saveHistory(newLayers);
  };

  const handleLayerBlendChange = (id: string, blendMode: GlobalCompositeOperation) => {
    const newLayers = layers.map(l => l.id === id ? { ...l, blendMode } : l);
    setLayers(newLayers);
    setShowBlendMenu(false);
    setPreviewBlendMode(null);
    saveHistory(newLayers);
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

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (layers.length === 0 || !canvasRef.current || !containerRef.current) return;
    
    const scaleAmount = -e.deltaY * 0.0015;
    const newScale = Math.min(Math.max(0.1, transform.scale * (1 + scaleAmount)), 20);

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const containerCenterX = rect.width / 2;
    const containerCenterY = rect.height / 2;
    
    const baseX = containerCenterX - (canvasRef.current.offsetWidth / 2);
    const baseY = containerCenterY - (canvasRef.current.offsetHeight / 2);

    const deltaX = x - baseX;
    const deltaY = y - baseY;

    const newTx = deltaX - (deltaX - transform.x) * (newScale / transform.scale);
    const newTy = deltaY - (deltaY - transform.y) * (newScale / transform.scale);

    setTransform({
        x: newTx,
        y: newTy,
        scale: newScale
    });
  };

  // --- Drawing & Interaction Logic ---
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

  const sprayPaint = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size: number, flow: number) => {
    ctx.fillStyle = color;
    const density = Math.floor(size * (flow / 20)); 
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

  const drawTexturedPoint = (ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number) => {
    if (!brushTipCanvasRef.current) return;
    const size = brushSize;
    ctx.globalAlpha = alpha;
    ctx.drawImage(brushTipCanvasRef.current, x - size, y - size);
    ctx.globalAlpha = 1.0;
  };

  const getDistance = (t1: React.Touch, t2: React.Touch) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  const getCenter = (t1: React.Touch, t2: React.Touch) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 });

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isDraggingToolbar) return;

    if ('touches' in e && e.touches.length === 2) {
       const dist = getDistance(e.touches[0], e.touches[1]);
       const center = getCenter(e.touches[0], e.touches[1]);
       const rect = containerRef.current?.getBoundingClientRect();
       if (rect) {
          pinchRef.current = {
              dist,
              center,
              startScale: transform.scale,
              startTranslate: { x: transform.x, y: transform.y },
              startCoords: { x: center.x - rect.left, y: center.y - rect.top }
          };
       }
       return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isCropping) {
        const { x, y } = getCanvasPoint(e, canvas);
        const handleSize = 30 / transform.scale; 
        
        if (cropRect) {
            const corners = [
                { id: 'nw', cx: cropRect.x, cy: cropRect.y },
                { id: 'ne', cx: cropRect.x + cropRect.w, cy: cropRect.y },
                { id: 'sw', cx: cropRect.x, cy: cropRect.y + cropRect.h },
                { id: 'se', cx: cropRect.x + cropRect.w, cy: cropRect.y + cropRect.h },
            ];

            let hit = false;
            for (const c of corners) {
                if (Math.hypot(x - c.cx, y - c.cy) < handleSize) {
                    setCropInteraction(c.id);
                    cropStartRef.current = { x, y, rect: { ...cropRect } };
                    hit = true;
                    break;
                }
            }

            if (!hit) {
                if (x >= cropRect.x && x <= cropRect.x + cropRect.w && y >= cropRect.y && y <= cropRect.y + cropRect.h) {
                    setCropInteraction('move');
                    cropStartRef.current = { x, y, rect: { ...cropRect } };
                } else {
                     setCropInteraction('create');
                     setCropRect({ x, y, w: 0, h: 0 });
                     cropStartRef.current = { x, y, rect: { x, y, w:0, h:0 } };
                }
            }
        } else {
            setCropInteraction('create');
            setCropRect({ x, y, w: 0, h: 0 });
            cropStartRef.current = { x, y, rect: { x, y, w:0, h:0 } };
        }
        return;
    }

    if (brushType === 'pan') {
      setIsPanning(true);
      const clientX = ('touches' in e) ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = ('touches' in e) ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      panStartRef.current = { x: clientX - transform.x, y: clientY - transform.y };
      return;
    }

    if (!activeLayerId) {
        alert("Please select a layer to draw on.");
        return;
    }

    const activeLayer = layers.find(l => l.id === activeLayerId);
    if (!activeLayer || !activeLayer.visible) return;

    setIsDrawing(true);
    strokeDistanceRef.current = 0; 
    const ctx = activeLayer.canvas.getContext('2d');
    if (!ctx) return;
    
    let { x, y } = getCanvasPoint(e, canvas);
    
    if (brushJitter > 0) {
      x += (Math.random() - 0.5) * brushJitter;
      y += (Math.random() - 0.5) * brushJitter;
    }

    ctx.lineWidth = brushSize;
    ctx.lineCap = brushShape === 'square' ? 'square' : 'round';
    ctx.lineJoin = brushShape === 'square' ? 'bevel' : 'round';
    ctx.strokeStyle = brushColor;
    ctx.fillStyle = brushColor;

    let alpha = 1.0;
    if (brushType === 'marker') alpha = 0.5;
    if (brushType !== 'spray') alpha *= (brushFlow / 100);
    
    ctx.globalAlpha = alpha;
    
    if (brushType === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = (brushFlow / 100); 
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }

    if (brushType === 'spray') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      sprayPaint(ctx, x, y, brushColor, brushSize, brushFlow);
    } else if (brushShape === 'textured') {
         drawTexturedPoint(ctx, x, y, alpha);
         lastDrawPointRef.current = { x, y };
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y);
      lastDrawPointRef.current = { x, y };
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    needsCompositeRef.current = true;
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (pinchRef.current && 'touches' in e && e.touches.length === 2) {
       e.preventDefault();
       const dist = getDistance(e.touches[0], e.touches[1]);
       const center = getCenter(e.touches[0], e.touches[1]);
       
       const scaleFactor = dist / pinchRef.current.dist;
       const newScale = Math.min(Math.max(0.1, pinchRef.current.startScale * scaleFactor), 20);

       const dx = center.x - pinchRef.current.center.x;
       const dy = center.y - pinchRef.current.center.y;
       
       setTransform(prev => ({
           scale: newScale,
           x: prev.x + dx,
           y: prev.y + dy
       }));

       pinchRef.current.center = center;
       pinchRef.current.dist = dist; 
       pinchRef.current.startScale = newScale; 
       return;
    }

    if (isCropping && cropInteraction && cropRect) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { x, y } = getCanvasPoint(e, canvas);
        const start = cropStartRef.current;
        const dx = x - start.x;
        const dy = y - start.y;
        
        let newRect = { ...start.rect };

        if (cropInteraction === 'create') {
            newRect.w = dx;
            newRect.h = dy;
        } else if (cropInteraction === 'move') {
            newRect.x += dx;
            newRect.y += dy;
        } else if (cropInteraction === 'se') {
            newRect.w += dx;
            newRect.h += dy;
        } else if (cropInteraction === 'sw') {
            newRect.x += dx;
            newRect.w -= dx;
            newRect.h += dy;
        } else if (cropInteraction === 'ne') {
            newRect.y += dy;
            newRect.w += dx;
            newRect.h -= dy;
        } else if (cropInteraction === 'nw') {
            newRect.x += dx;
            newRect.y += dy;
            newRect.w -= dx;
            newRect.h -= dy;
        }

        let finalX = newRect.x;
        let finalY = newRect.y;
        let finalW = newRect.w;
        let finalH = newRect.h;

        if (finalW < 0) {
            finalX += finalW;
            finalW = Math.abs(finalW);
        }
        if (finalH < 0) {
            finalY += finalH;
            finalH = Math.abs(finalH);
        }

        setCropRect({ x: finalX, y: finalY, w: finalW, h: finalH });
        return;
    }

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
    
    const activeLayer = layers.find(l => l.id === activeLayerId);
    if (!activeLayer) return;
    const ctx = activeLayer.canvas.getContext('2d');
    if (!ctx) return;
    
    const mainCanvas = canvasRef.current;
    if (!mainCanvas) return;

    let { x, y } = getCanvasPoint(e, mainCanvas);

    if (brushJitter > 0) {
       x += (Math.random() - 0.5) * brushJitter;
       y += (Math.random() - 0.5) * brushJitter;
    }
    
    if (lastDrawPointRef.current) {
        const dx = x - lastDrawPointRef.current.x;
        const dy = y - lastDrawPointRef.current.y;
        strokeDistanceRef.current += Math.sqrt(dx*dx + dy*dy);
    }

    let alpha = 1.0;
    if (brushType === 'marker') alpha = 0.5;
    if (brushType !== 'spray') alpha *= (brushFlow / 100);

    if (brushFalloff > 0) {
        const maxDist = 3000 / (brushFalloff * 0.5 || 1); 
        const fade = Math.max(0, 1 - (strokeDistanceRef.current / maxDist));
        alpha *= fade;
    }
    
    ctx.globalAlpha = alpha;

    if (brushType === 'spray') {
      sprayPaint(ctx, x, y, brushColor, brushSize, brushFlow);
      ctx.beginPath(); 
      ctx.moveTo(x, y);
    } else if (brushShape === 'textured') {
         if (lastDrawPointRef.current) {
            const last = lastDrawPointRef.current;
            const dist = Math.hypot(x - last.x, y - last.y);
            const angle = Math.atan2(y - last.y, x - last.x);
            // Smaller step for textured stroke feel
            const step = Math.max(1, brushSize / 8); 
            
            for (let i = 0; i < dist; i += step) {
                 const px = last.x + Math.cos(angle) * i;
                 const py = last.y + Math.sin(angle) * i;
                 drawTexturedPoint(ctx, px, py, alpha);
            }
         }
         lastDrawPointRef.current = { x, y };
    } else {
      const p1 = lastDrawPointRef.current;
      if (p1) {
         ctx.lineCap = brushShape === 'square' ? 'square' : 'round';
         ctx.lineJoin = brushShape === 'square' ? 'bevel' : 'round';
         
         const mid = { x: (p1.x + x) / 2, y: (p1.y + y) / 2 };
         ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
         ctx.stroke();
         lastDrawPointRef.current = { x, y };
      }
    }
    needsCompositeRef.current = true;
  };

  const handlePointerUp = () => {
    pinchRef.current = null;
    
    if (isCropping) {
        setCropInteraction(null);
        return;
    }

    if (isPanning) {
      setIsPanning(false);
    }
    if (isDrawing) {
      setIsDrawing(false);
      lastDrawPointRef.current = null;
      strokeDistanceRef.current = 0;
      const activeLayer = layers.find(l => l.id === activeLayerId);
      const ctx = activeLayer?.canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.globalAlpha = 1;
      }
      saveHistory(); 
    }
  };

  // --- Transformation Logic ---

  const handleRotateCanvas = (degrees: number) => {
     const newW = canvasSize.height;
     const newH = canvasSize.width;
     
     const newLayers = layers.map(l => {
         const newCanvas = document.createElement('canvas');
         newCanvas.width = newW;
         newCanvas.height = newH;
         const ctx = newCanvas.getContext('2d');
         if (ctx) {
             ctx.save();
             ctx.translate(newW / 2, newH / 2);
             ctx.rotate(degrees * Math.PI / 180);
             ctx.drawImage(l.canvas, -l.canvas.width/2, -l.canvas.height/2);
             ctx.restore();
         }
         return { ...l, canvas: newCanvas };
     });

     setCanvasSize({ width: newW, height: newH });
     if (canvasRef.current) {
         canvasRef.current.width = newW;
         canvasRef.current.height = newH;
     }
     setLayers(newLayers);
     needsCompositeRef.current = true;
     saveHistory(newLayers, newW, newH);
  };

  const applyCrop = () => {
      if (!cropRect || cropRect.w === 0 || cropRect.h === 0) {
          setIsCropping(false);
          setCropRect(null);
          return;
      }

      const newW = Math.round(cropRect.w);
      const newH = Math.round(cropRect.h);
      const cropX = Math.round(cropRect.x);
      const cropY = Math.round(cropRect.y);

      const newLayers = layers.map(l => {
          const newCanvas = document.createElement('canvas');
          newCanvas.width = newW;
          newCanvas.height = newH;
          const ctx = newCanvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(l.canvas, cropX, cropY, newW, newH, 0, 0, newW, newH);
          }
          return { ...l, canvas: newCanvas };
      });

      setCanvasSize({ width: newW, height: newH });
      if (canvasRef.current) {
          canvasRef.current.width = newW;
          canvasRef.current.height = newH;
      }
      setLayers(newLayers);
      needsCompositeRef.current = true;
      saveHistory(newLayers, newW, newH);
      
      setIsCropping(false);
      setCropRect(null);
      setCropInteraction(null);
  };

  const openResizeDialog = () => {
      setResizeWidth(canvasSize.width);
      setResizeHeight(canvasSize.height);
      setShowResizeDialog(true);
  };

  const applyResize = () => {
      const newW = Math.round(resizeWidth);
      const newH = Math.round(resizeHeight);
      
      if (newW <= 0 || newH <= 0) return;

      const newLayers = layers.map(l => {
         const newCanvas = document.createElement('canvas');
         newCanvas.width = newW;
         newCanvas.height = newH;
         const ctx = newCanvas.getContext('2d');
         if (ctx) {
             ctx.imageSmoothingEnabled = true;
             ctx.imageSmoothingQuality = 'high';
             ctx.drawImage(l.canvas, 0, 0, newW, newH);
         }
         return { ...l, canvas: newCanvas };
      });

      setCanvasSize({ width: newW, height: newH });
      if (canvasRef.current) {
          canvasRef.current.width = newW;
          canvasRef.current.height = newH;
      }
      setLayers(newLayers);
      needsCompositeRef.current = true;
      saveHistory(newLayers, newW, newH);
      setShowResizeDialog(false);
  };

  // --- Layer Management ---
  const handleAddLayer = () => {
    if (!canvasRef.current) return;
    const newLayer = createLayer(`Layer ${layers.length + 1}`, canvasSize.width, canvasSize.height);
    const newLayers = [...layers, newLayer];
    setLayers(newLayers);
    setActiveLayerId(newLayer.id);
    saveHistory(newLayers);
  };

  const handleDeleteLayer = (id: string) => {
    if (layers.length <= 1) return;
    const newLayers = layers.filter(l => l.id !== id);
    setLayers(newLayers);
    if (activeLayerId === id) {
        setActiveLayerId(newLayers[newLayers.length - 1].id);
    }
    saveHistory(newLayers);
  };

  const handleToggleVisibility = (id: string) => {
    const newLayers = layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l);
    setLayers(newLayers);
    saveHistory(newLayers);
  };

  const handleMoveLayer = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index < layers.length - 1) {
        const newLayers = [...layers];
        [newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]];
        setLayers(newLayers);
        saveHistory(newLayers);
    } else if (direction === 'down' && index > 0) {
        const newLayers = [...layers];
        [newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]];
        setLayers(newLayers);
        saveHistory(newLayers);
    }
  };

  const handleClearLayer = () => {
      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (activeLayer) {
          const ctx = activeLayer.canvas.getContext('2d');
          ctx?.clearRect(0,0, activeLayer.canvas.width, activeLayer.canvas.height);
          needsCompositeRef.current = true;
          saveHistory();
      }
  };


  const handleMagicEdit = async () => {
    if (!canvasRef.current || !editPrompt) return;
    setIsEditing(true);
    try {
      const base64Canvas = canvasRef.current.toDataURL('image/png');
      const results = await editImage(base64Canvas, editPrompt);
      setEditedImages(results);
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
    } catch (e) {
      alert("Failed to remove background.");
    } finally {
      setIsEditing(false);
    }
  };

  const handleApplyResult = (src: string) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
        const newLayer = createLayer(`Magic Result ${layers.length}`, canvasSize.width, canvasSize.height);
        const ctx = newLayer.canvas.getContext('2d');
        const imgRatio = img.width / img.height;
        const canvasRatio = canvasSize.width / canvasSize.height;
        let drawWidth, drawHeight, offsetX, offsetY;
        if (imgRatio > canvasRatio) {
            drawWidth = canvasSize.width;
            drawHeight = canvasSize.width / imgRatio;
            offsetX = 0;
            offsetY = (canvasSize.height - drawHeight) / 2;
        } else {
            drawHeight = canvasSize.height;
            drawWidth = canvasSize.height * imgRatio;
            offsetY = 0;
            offsetX = (canvasSize.width - drawWidth) / 2;
        }
        ctx?.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        const newLayers = [...layers, newLayer];
        setLayers(newLayers);
        setActiveLayerId(newLayer.id);
        saveHistory(newLayers);
        setEditedImages([]);
    };
  };

  const handleDeleteHistory = async (id: string) => {
    if (confirm("Delete this image?")) {
      await deleteItem(id);
      loadGallery();
    }
  };

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

  const activeLayer = layers.find(l => l.id === activeLayerId);

  return (
    <div className="fixed inset-0 bg-black text-gray-100 flex flex-col font-sans touch-manipulation">
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

      {showResizeDialog && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur flex items-center justify-center p-4">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                  <h3 className="text-lg font-bold text-white mb-4">Resize Image</h3>
                  <div className="space-y-4">
                      <div className="flex gap-4">
                          <div className="flex-1">
                              <label className="text-xs text-gray-400 uppercase font-bold">Width</label>
                              <input 
                                type="number" 
                                value={resizeWidth}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    setResizeWidth(val);
                                    if(keepAspect && canvasSize.width > 0) {
                                        setResizeHeight(Math.round(val * (canvasSize.height / canvasSize.width)));
                                    }
                                }}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
                              />
                          </div>
                          <div className="flex-1">
                              <label className="text-xs text-gray-400 uppercase font-bold">Height</label>
                              <input 
                                type="number" 
                                value={resizeHeight}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    setResizeHeight(val);
                                    if(keepAspect && canvasSize.height > 0) {
                                        setResizeWidth(Math.round(val * (canvasSize.width / canvasSize.height)));
                                    }
                                }}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
                              />
                          </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={keepAspect} onChange={(e) => setKeepAspect(e.target.checked)} className="rounded bg-gray-700 border-gray-600 text-indigo-500 focus:ring-indigo-500" />
                          <span className="text-sm text-gray-300">Lock Aspect Ratio</span>
                      </label>
                      <div className="flex gap-2 pt-2">
                          <button onClick={() => setShowResizeDialog(false)} className="flex-1 py-2 bg-gray-800 rounded-lg text-gray-300 hover:bg-gray-700">Cancel</button>
                          <button onClick={applyResize} className="flex-1 py-2 bg-indigo-600 rounded-lg text-white font-bold hover:bg-indigo-500">Apply</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

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

      <main className="flex-1 flex flex-col min-h-0 relative w-full">
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

        {mode === AppMode.EDIT && (
          <div className="flex-1 flex flex-col relative overflow-hidden animate-fade-in">
              {layers.length === 0 ? (
                <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-center">
                   <div className="max-w-lg mx-auto w-full pb-24 space-y-4">
                     <div className="bg-gray-900 p-8 rounded-3xl border border-gray-800 text-center shadow-2xl">
                       <h2 className="text-3xl font-bold mb-2">Magic Canvas</h2>
                       <p className="text-gray-400 mb-8">Start by choosing a source</p>
                       <div className="grid grid-cols-2 gap-4">
                          <label className="flex flex-col items-center justify-center h-40 bg-gray-800 rounded-2xl cursor-pointer hover:bg-gray-700 transition-all border border-gray-700 hover:border-indigo-500 group">
                            <IconUpload className="w-10 h-10 mb-3 text-indigo-500 group-hover:scale-110 transition-transform" />
                            <span className="font-semibold text-sm">Open File</span>
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
                  <div 
                    ref={containerRef}
                    onWheel={handleWheel}
                    className="flex-1 bg-[#121212] relative overflow-hidden flex items-center justify-center touch-none select-none w-full"
                    style={{ cursor: isCropping ? (cropInteraction && cropInteraction !== 'create' && cropInteraction !== 'move' ? 'move' : 'crosshair') : (brushType === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair') }}
                  >
                    <div 
                      style={{ 
                        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                        transformOrigin: '0 0',
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        marginLeft: -(canvasSize.width * 0.5),
                        marginTop: -(canvasSize.height * 0.5),
                        transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                      }}
                    >
                       <div className="relative" style={{ width: canvasSize.width, height: canvasSize.height }}>
                           <canvas 
                            ref={canvasRef}
                            width={canvasSize.width}
                            height={canvasSize.height}
                            onMouseDown={handlePointerDown}
                            onMouseMove={handlePointerMove}
                            onMouseUp={handlePointerUp}
                            onMouseLeave={handlePointerUp}
                            onTouchStart={handlePointerDown}
                            onTouchMove={handlePointerMove}
                            onTouchEnd={handlePointerUp}
                            className="shadow-2xl border border-gray-800 bg-gray-900 absolute inset-0"
                            style={{ maxWidth: 'unset' }} 
                          />
                          {isCropping && cropRect && (
                              <div 
                                className="absolute pointer-events-none border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]"
                                style={{
                                    left: cropRect.x,
                                    top: cropRect.y,
                                    width: cropRect.w,
                                    height: cropRect.h
                                }}
                              >
                                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
                                      {[...Array(9)].map((_, i) => <div key={i} className="border-r border-b border-white last:border-0 [&:nth-child(3n)]:border-r-0 [&:nth-child(n+7)]:border-b-0"></div>)}
                                  </div>
                                  <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-gray-500 shadow-sm"></div>
                                  <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-gray-500 shadow-sm"></div>
                                  <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-gray-500 shadow-sm"></div>
                                  <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-gray-500 shadow-sm"></div>
                              </div>
                          )}
                       </div>
                    </div>

                    {isEditing && <ProcessingOverlay text="Weaving Magic..." />}
                    
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 p-1.5 bg-black/60 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl z-20">
                      <button onClick={handleZoomIn} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                        <IconZoomIn className="w-5 h-5" />
                      </button>
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

                    <div 
                      onWheel={(e) => e.stopPropagation()}
                      className={`absolute right-4 top-4 z-30 transition-all ${showLayerPanel ? 'w-72' : 'w-auto'}`}
                    >
                        {!showLayerPanel && (
                             <button onClick={() => setShowLayerPanel(true)} className="p-3 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl text-white shadow-xl hover:bg-white/10">
                                <IconLayers className="w-5 h-5" />
                             </button>
                        )}
                        {showLayerPanel && (
                           <div className="bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[60vh]">
                                <div className="p-3 border-b border-white/10 flex justify-between items-center bg-white/5">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                        <IconLayers className="w-4 h-4" /> Layers
                                    </h3>
                                    <button onClick={() => setShowLayerPanel(false)} className="text-gray-500 hover:text-white"><IconX className="w-4 h-4"/></button>
                                </div>
                                
                                {activeLayer && (
                                  <div className="p-3 border-b border-white/10 bg-white/5 space-y-3">
                                      <div className="space-y-1">
                                          <div className="flex justify-between items-center">
                                              <label className="text-[10px] font-bold text-gray-500 uppercase">Opacity</label>
                                              <span className="text-xs font-mono text-gray-300">{Math.round(activeLayer.opacity * 100)}%</span>
                                          </div>
                                          <input 
                                            type="range" min="0" max="1" step="0.01" 
                                            value={activeLayer.opacity}
                                            onChange={(e) => handleLayerOpacityChange(activeLayer.id, parseFloat(e.target.value))}
                                            onMouseUp={(e) => handleLayerOpacityCommit(activeLayer.id, parseFloat((e.target as HTMLInputElement).value))}
                                            onTouchEnd={(e) => handleLayerOpacityCommit(activeLayer.id, parseFloat((e.target as HTMLInputElement).value))}
                                            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                          />
                                      </div>
                                      
                                      <div className="space-y-1 relative">
                                          <label className="text-[10px] font-bold text-gray-500 uppercase">Blend Mode</label>
                                          <div className="relative">
                                              <button 
                                                onClick={() => setShowBlendMenu(!showBlendMenu)}
                                                className="w-full bg-gray-800 border border-gray-600 text-xs text-white rounded px-3 py-1.5 flex justify-between items-center hover:bg-gray-700 transition-colors"
                                              >
                                                  <span>{BLEND_MODES.find(m => m.value === (previewBlendMode || activeLayer.blendMode))?.label}</span>
                                                  <IconArrowDown className="w-3 h-3 text-gray-400"/>
                                              </button>
                                              {showBlendMenu && (
                                                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50 max-h-48 overflow-y-auto">
                                                      {BLEND_MODES.map(mode => (
                                                          <div
                                                              key={mode.value}
                                                              className={`px-3 py-2 text-xs cursor-pointer flex justify-between items-center ${activeLayer.blendMode === mode.value ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                                                              onClick={() => handleLayerBlendChange(activeLayer.id, mode.value)}
                                                              onMouseEnter={() => setPreviewBlendMode(mode.value)}
                                                              onMouseLeave={() => setPreviewBlendMode(null)}
                                                          >
                                                              {mode.label}
                                                              {activeLayer.blendMode === mode.value && <IconCheck className="w-3 h-3" />}
                                                          </div>
                                                      ))}
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                       <label className="flex items-center gap-2 text-xs text-gray-400 hover:text-white cursor-pointer py-1">
                                         <IconUpload className="w-3 h-3" /> Replace Content
                                         <input 
                                            type="file" 
                                            ref={replaceInputRef}
                                            accept="image/*" 
                                            className="hidden" 
                                            onChange={handleReplaceLayerContent} 
                                          />
                                      </label>
                                  </div>
                                )}
                                <div className="overflow-y-auto flex-col-reverse flex p-2 gap-2">
                                    {layers.map((layer, index) => (
                                        <div 
                                            key={layer.id} 
                                            onClick={() => setActiveLayerId(layer.id)}
                                            className={`p-2 rounded-lg flex items-center gap-2 cursor-pointer border transition-all ${activeLayerId === layer.id ? 'bg-indigo-900/50 border-indigo-500/50' : 'bg-gray-800/50 border-transparent hover:bg-gray-800'}`}
                                        >
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleToggleVisibility(layer.id); }}
                                                className={`p-1 rounded hover:bg-white/10 ${layer.visible ? 'text-gray-300' : 'text-gray-600'}`}
                                            >
                                                {layer.visible ? <IconEye className="w-4 h-4" /> : <IconEyeOff className="w-4 h-4" />}
                                            </button>
                                            <LayerThumbnail layer={layer} />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-medium text-gray-200 truncate select-none">{layer.name}</p>
                                              <p className="text-[10px] text-gray-500 truncate">{BLEND_MODES.find(m => m.value === layer.blendMode)?.label}</p>
                                            </div>
                                            {activeLayerId === layer.id && (
                                                <div className="flex flex-col gap-0.5">
                                                   <button onClick={(e) => { e.stopPropagation(); handleMoveLayer(index, 'up'); }} className="text-gray-500 hover:text-white disabled:opacity-30" disabled={index === layers.length - 1}><IconArrowUp className="w-3 h-3" /></button>
                                                   <button onClick={(e) => { e.stopPropagation(); handleMoveLayer(index, 'down'); }} className="text-gray-500 hover:text-white disabled:opacity-30" disabled={index === 0}><IconArrowDown className="w-3 h-3" /></button>
                                                </div>
                                            )}
                                             {activeLayerId === layer.id && layers.length > 1 && (
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteLayer(layer.id); }} className="text-gray-500 hover:text-red-400 ml-1">
                                                    <IconTrash className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="p-2 border-t border-white/10 grid grid-cols-2 gap-2">
                                    <button onClick={handleAddLayer} className="py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-300 flex items-center justify-center gap-2 transition-colors">
                                        <IconPlus className="w-4 h-4" /> Add Layer
                                    </button>
                                    <label className="py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold text-gray-300 flex items-center justify-center gap-2 transition-colors cursor-pointer">
                                        <IconImage className="w-4 h-4" /> Add Image
                                        <input 
                                          ref={fileInputRef}
                                          type="file" 
                                          accept="image/*" 
                                          className="hidden" 
                                          onChange={handleAddImageLayer} 
                                        />
                                    </label>
                                </div>
                           </div>
                        )}
                    </div>

                    <div 
                        ref={toolbarRef}
                        onPointerDown={handleDragStart}
                        onPointerMove={handleDragMove}
                        onPointerUp={handleDragEnd}
                        onPointerCancel={handleDragEnd}
                        onWheel={(e) => e.stopPropagation()}
                        style={{ transform: `translate(${toolbarPos.x}px, ${toolbarPos.y}px)` }}
                        className={`absolute left-4 top-4 w-auto bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl flex flex-col gap-2 cursor-grab active:cursor-grabbing touch-none z-30 transition-all ${isToolbarMinimized ? 'p-2' : 'p-3'}`}
                    >
                        <div className="flex justify-between items-center px-1 gap-2" onPointerDown={(e) => e.stopPropagation()}>
                           <div className="p-1 cursor-grab active:cursor-grabbing" onPointerDown={handleDragStart}>
                              <IconMove className="w-4 h-4 text-gray-500" />
                           </div>
                           <div className="flex items-center gap-1">
                             <div className="relative group">
                               <button onClick={saveSession} className="text-gray-400 hover:text-green-400">
                                  <IconSave className="w-4 h-4" />
                               </button>
                             </div>
                             <div className="relative group">
                               <button onClick={() => setIsToolbarMinimized(!isToolbarMinimized)} className="text-gray-400 hover:text-white">
                                  {isToolbarMinimized ? <IconMaximize className="w-4 h-4"/> : <IconMinimize className="w-4 h-4" />}
                               </button>
                             </div>
                           </div>
                        </div>

                        {!isToolbarMinimized && !isCropping && (
                          <div onPointerDown={(e) => e.stopPropagation()} className="space-y-4 animate-fade-in w-64">
                            <div className="grid grid-cols-4 gap-2">
                              <BrushBtn type="pan" icon={IconHand} active={brushType === 'pan'} onClick={() => setBrushType('pan')} label="Pan" />
                              <BrushBtn type="pen" icon={IconPen} active={brushType === 'pen'} onClick={() => setBrushType('pen')} label="Pen" />
                              <BrushBtn type="eraser" icon={IconEraser} active={brushType === 'eraser'} onClick={() => setBrushType('eraser')} label="Eraser" />
                              
                              <div className="col-span-1 relative group w-full">
                                <button 
                                  onClick={() => setShowToolsMenu(!showToolsMenu)} 
                                  className={`w-full p-2.5 rounded-lg transition-all flex items-center justify-center ${showToolsMenu ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                                >
                                  <IconCrop className="w-5 h-5" />
                                </button>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 backdrop-blur text-white text-[10px] font-medium rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                  Edit Tools
                                </div>
                              </div>
                            </div>

                            {showToolsMenu && (
                                <div className="grid grid-cols-4 gap-2 p-2 bg-white/5 rounded-xl border border-white/5 animate-fade-in">
                                    <button onClick={() => { setIsCropping(true); setShowToolsMenu(false); }} className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white flex justify-center" title="Crop">
                                        <IconCrop className="w-5 h-5" />
                                    </button>
                                    <button onClick={openResizeDialog} className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white flex justify-center" title="Resize">
                                        <IconScaling className="w-5 h-5" />
                                    </button>
                                    <button onClick={() => handleRotateCanvas(-90)} className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white flex justify-center" title="Rotate Left">
                                        <IconRotateCcw className="w-5 h-5" />
                                    </button>
                                    <button onClick={() => handleRotateCanvas(90)} className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white flex justify-center" title="Rotate Right">
                                        <IconRotateCw className="w-5 h-5" />
                                    </button>
                                </div>
                            )}

                            <div className="grid grid-cols-4 gap-2">
                                <BrushBtn type="spray" icon={IconSpray} active={brushType === 'spray'} onClick={() => setBrushType('spray')} label="Spray" />
                                <BrushBtn type="marker" icon={IconMarker} active={brushType === 'marker'} onClick={() => setBrushType('marker')} label="Marker" />
                                <div className="col-span-1 relative group w-full">
                                    <button onClick={handleClearLayer} className="w-full p-2.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center">
                                    <IconTrash className="w-5 h-5" />
                                    </button>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 backdrop-blur text-white text-[10px] font-medium rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                    Clear
                                    </div>
                                </div>
                                <div className="col-span-1 relative group w-full">
                                    <button 
                                    onClick={() => setShowBrushSettings(!showBrushSettings)} 
                                    className={`w-full p-2.5 rounded-lg transition-all flex items-center justify-center ${showBrushSettings ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                                    >
                                    <IconSliders className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] uppercase font-bold text-gray-500">
                                   <span>Size</span>
                                   <span>{brushSize}px</span>
                                </div>
                                <input 
                                  type="range" min="2" max="100" value={brushSize} 
                                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                  className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                             </div>

                             {showBrushSettings && (
                                <div className="p-3 bg-white/5 rounded-xl space-y-3 animate-fade-in border border-white/5">
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] uppercase font-bold text-gray-500">
                                            <span>Brush Shape</span>
                                        </div>
                                        <select 
                                            value={brushShape} 
                                            onChange={(e) => setBrushShape(e.target.value as any)}
                                            className="w-full bg-gray-600 rounded-lg p-1 text-xs text-white border-none focus:ring-0"
                                        >
                                            <option value="round">Round</option>
                                            <option value="square">Square</option>
                                            <option value="textured">Textured</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] uppercase font-bold text-gray-500">
                                            <span>Flow</span>
                                            <span>{brushFlow}%</span>
                                        </div>
                                        <input 
                                            type="range" min="1" max="100" value={brushFlow}
                                            onChange={(e) => setBrushFlow(parseInt(e.target.value))}
                                            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] uppercase font-bold text-gray-500">
                                            <span>Jitter</span>
                                            <span>{brushJitter}</span>
                                        </div>
                                        <input 
                                            type="range" min="0" max="50" value={brushJitter}
                                            onChange={(e) => setBrushJitter(parseInt(e.target.value))}
                                            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-pink-500"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] uppercase font-bold text-gray-500">
                                            <span>Falloff</span>
                                            <span>{brushFalloff}</span>
                                        </div>
                                        <input 
                                            type="range" min="0" max="100" value={brushFalloff}
                                            onChange={(e) => setBrushFalloff(parseInt(e.target.value))}
                                            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        />
                                    </div>
                                </div>
                             )}

                            <button 
                                onClick={handleRemoveBackground}
                                className="w-full p-3 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-lg flex items-center justify-center gap-2 border border-indigo-500/30 transition-all"
                            >
                                <IconScissors className="w-4 h-4" />
                                <span className="text-xs font-bold">Remove BG</span>
                            </button>

                            <div className="h-px bg-white/10"></div>
                            
                            <div className="flex justify-between gap-1">
                               <div className="relative group flex-1">
                                 <button onClick={handleUndo} disabled={historyStep <= 0} className="w-full p-2 text-gray-400 hover:text-white disabled:opacity-30 flex justify-center"><IconUndo /></button>
                               </div>
                               <div className="relative group flex-1">
                                 <button onClick={handleRedo} disabled={historyStep >= history.length - 1} className="w-full p-2 text-gray-400 hover:text-white disabled:opacity-30 flex justify-center"><IconRedo /></button>
                               </div>
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
                        
                        {isCropping && (
                            <div onPointerDown={(e) => e.stopPropagation()} className="w-64 space-y-3 animate-fade-in">
                                <div className="text-center text-xs font-bold text-white uppercase tracking-wider mb-2">Crop Mode</div>
                                <div className="text-center text-[10px] text-gray-400 mb-2">Drag handles to adjust crop area</div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => { setIsCropping(false); setCropRect(null); setCropInteraction(null); }}
                                        className="flex-1 py-2 bg-gray-800 rounded-lg text-gray-300 font-bold hover:bg-gray-700"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={applyCrop}
                                        disabled={!cropRect || cropRect.w === 0}
                                        className="flex-1 py-2 bg-indigo-600 rounded-lg text-white font-bold hover:bg-indigo-500 disabled:opacity-50"
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        )}

                        {isToolbarMinimized && (
                           <div className="flex justify-center py-2" onPointerDown={(e) => e.stopPropagation()}>
                              <div className="w-6 h-6 rounded-full" style={{background: brushColor, border: '1px solid white'}}></div>
                           </div>
                        )}
                    </div>

                    {!isCropping && (
                      <div className="absolute bottom-24 md:bottom-8 left-0 right-0 z-40 px-4 flex justify-center pointer-events-none">
                        <div className="w-full max-w-2xl pointer-events-auto">
                           <div className="relative group">
                              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full opacity-20 group-hover:opacity-50 blur transition duration-500"></div>
                              <div className="relative flex items-center gap-2 bg-gray-950/80 backdrop-blur-2xl border border-white/10 rounded-full p-2 pl-2 shadow-2xl">
                                 <button 
                                   onClick={() => {setLayers([]); setHistory([]); setHistoryStep(-1);}} 
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
                    )}
                  </div>

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
                                        <IconCheck className="w-4 h-4" /> Add as Layer
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

      <div className="fixed bottom-0 left-0 right-0 bg-gray-950/90 backdrop-blur-lg border-t border-gray-800 md:hidden z-40 pb-safe">
        <div className="flex justify-around p-3">
          <NavBtn active={mode === AppMode.GENERATE} onClick={() => setMode(AppMode.GENERATE)} icon={<IconWand />} label="Create" />
          <NavBtn active={mode === AppMode.EDIT} onClick={() => setMode(AppMode.EDIT)} icon={<IconPen />} label="Editor" />
          <NavBtn active={mode === AppMode.GALLERY} onClick={() => setMode(AppMode.GALLERY)} icon={<IconHistory />} label="Gallery" />
        </div>
      </div>

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
