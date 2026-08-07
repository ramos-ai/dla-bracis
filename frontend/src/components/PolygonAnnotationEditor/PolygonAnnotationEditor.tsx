import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Eraser, EyeOff, Hand, RotateCcw, Square, ZoomIn, ZoomOut } from 'lucide-react';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { Icon } from '../Icons/Icons';
import { getImageFromFs } from '../../services/GridFsService';
import {
  AnnotationWorkspace,
  AnnotationRailButton,
  AnnotationSideSection,
  Tag,
} from '../dla';
import { cn } from '../../lib/utils';interface Point {
  x: number;
  y: number;
}

interface Rectangle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  categoryId: number;
}


type AnnotationTool = 'hand' | 'rectangle' | 'eraser';

interface COCOAnnotation {
  category_id: number;
  segmentation: number[][]; // [[x1, y1, x2, y2, ...]]
  area: number;
  bbox: number[]; // [x, y, width, height]
  iscrowd: number;
}

export interface PolygonAnnotationEditorHandle {
  /** Salva as anotações atuais e resolve quando terminar. Retorna true se havia anotações para salvar. */
  saveNow: () => Promise<boolean>;
  /** Retorna o número de anotações atuais */
  getAnnotationCount: () => number;
}

interface PolygonAnnotationEditorProps {
  fileId: string;
  datasetId: string;
  labels: string[]; // Lista de labels disponíveis
  existingAnnotations?: COCOAnnotation[];
  /** When isExplicitSave is false (e.g. auto-save after eraser), parent should not show success toast nor close modal. */
  onSave: (annotations: COCOAnnotation[], isExplicitSave?: boolean) => Promise<void>;
  onCancel?: () => void;
  /** Preservar ferramenta e classe ao mudar de imagem (Salvar e Próxima) */
  initialTool?: AnnotationTool;
  initialSelectedLabel?: string;
  onToolChange?: (tool: AnnotationTool) => void;
  onSelectedLabelChange?: (label: string) => void;
  /** Navegação entre imagens */
  showNavigation?: boolean;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  isLastImage?: boolean;
  nextButtonLabel?: string;
  /** Callback para finalizar quando é a última imagem */
  onFinalize?: () => void;
  /** Informação de progresso */
  currentIndex?: number;
  totalImages?: number;
}

// Cores distintas por classe (para não confundir)
const CLASS_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#E91E63', '#795548',
  '#3F51B5', '#009688', '#CDDC39', '#FF5722', '#607D8B', '#673AB7', '#8BC34A', '#FFC107'
];

/** Tamanho máximo padronizado do canvas (evita rolagem excessiva) */
const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 540;

const PolygonAnnotationEditor = forwardRef<PolygonAnnotationEditorHandle, PolygonAnnotationEditorProps>(({
  fileId,
  labels,
  existingAnnotations = [],
  onSave,
  onCancel,
  initialTool = 'hand',
  initialSelectedLabel = '',
  onToolChange,
  onSelectedLabelChange,
  showNavigation = false,
  canGoPrevious = false,
  canGoNext = true,
  onPrevious,
  onNext,
  isLastImage = false,
  nextButtonLabel,
  onFinalize,
  currentIndex,
  totalImages,
}, ref) => {
  const { alert: showAlert } = useAlertConfirm();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const baseScaleRef = useRef<number>(1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [rectangles, setRectangles] = useState<Rectangle[]>([]);
  const [currentTool, setCurrentTool] = useState<AnnotationTool>(initialTool);
  const [currentRectangle, setCurrentRectangle] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>(initialSelectedLabel);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const rectanglesRef = useRef<Rectangle[]>([]);
  const currentRectangleRef = useRef<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const selectedLabelRef = useRef<string>('');
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 4;
  const ZOOM_STEP = 0.25;

  useEffect(() => {
    rectanglesRef.current = rectangles;
  }, [rectangles]);
  useEffect(() => {
    currentRectangleRef.current = currentRectangle;
  }, [currentRectangle]);
  useEffect(() => {
    selectedLabelRef.current = selectedLabel;
  }, [selectedLabel]);

  // Reset apenas quando fileId muda (não quando initialTool/initialSelectedLabel mudam - quebraria ao trocar ferramenta)
  useEffect(() => {
    setRectangles([]);
    setCurrentRectangle(null);
    setSelectedLabel(initialSelectedLabel);
    setCurrentTool(initialTool);
    setIsDrawing(false);
    setHoveredAnnotationId(null);
    setImageLoaded(false);
    setPan({ x: 0, y: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só resetar ao mudar imagem, não ao sincronizar tool/label
  }, [fileId]);

  // Load existing annotations - runs after reset
  useEffect(() => {
    // Only load if we have a fileId and image is loaded
    if (!fileId || !imageLoaded) {
      return;
    }
    
    // Always reset first, then load new annotations
    setRectangles([]);
    
    if (existingAnnotations && existingAnnotations.length > 0) {
      const loadedRectangles: Rectangle[] = [];
      
      existingAnnotations.forEach((ann, idx) => {
        const bbox = ann.bbox || [];
        
        // Only load rectangles (using bbox)
        if (bbox.length === 4) {
          loadedRectangles.push({
            id: `rect-${idx}`,
            x: bbox[0],
            y: bbox[1],
            width: bbox[2],
            height: bbox[3],
            label: labels[ann.category_id - 1] || `Category ${ann.category_id}`,
            categoryId: ann.category_id
          });
        }
      });
      
      setRectangles(loadedRectangles);
    }
  }, [existingAnnotations, labels, fileId, imageLoaded]);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      const baseScale = Math.min(
        VIEW_WIDTH / img.naturalWidth,
        VIEW_HEIGHT / img.naturalHeight,
        1
      );
      baseScaleRef.current = baseScale;
      const scale = baseScale;
      const imgViewW = img.naturalWidth * scale;
      const imgViewH = img.naturalHeight * scale;
      setPan({ x: (VIEW_WIDTH - imgViewW) / 2, y: (VIEW_HEIGHT - imgViewH) / 2 });
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error('Error loading image');
      showAlert('Erro ao carregar imagem');
    };
    img.src = getImageFromFs(fileId);
  }, [fileId]);

  // Desenho com viewport fixo: zoom só na imagem (lupa), pan pelo utilizador
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageRef.current;
    const baseScale = baseScaleRef.current;
    const scale = baseScale * zoom;
    const panX = pan.x;
    const panY = pan.y;

    canvas.width = VIEW_WIDTH;
    canvas.height = VIEW_HEIGHT;

    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

    const invScale = 1 / scale;
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    };
    if (showAnnotations) {
      rectangles.forEach((rect) => {
        const isHovered = hoveredAnnotationId === rect.id;
        const color = CLASS_COLORS[rect.categoryId % CLASS_COLORS.length];
        ctx.strokeStyle = isHovered ? '#000' : color;
        ctx.lineWidth = (isHovered ? 4 : 2) * invScale;
        ctx.fillStyle = isHovered ? 'rgba(255,255,0,0.35)' : hexToRgba(color, 0.25);
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.fillStyle = '#000';
        ctx.font = `${14 * invScale}px Arial`;
        ctx.fillText(rect.label, rect.x + 5 * invScale, rect.y - 5 * invScale);
      });
    }

    if (currentRectangle) {
      const rectX = Math.min(currentRectangle.startX, currentRectangle.endX);
      const rectY = Math.min(currentRectangle.startY, currentRectangle.endY);
      const rectW = Math.abs(currentRectangle.endX - currentRectangle.startX);
      const rectH = Math.abs(currentRectangle.endY - currentRectangle.startY);
      ctx.strokeStyle = '#FF5722';
      ctx.lineWidth = 2 * invScale;
      ctx.setLineDash([5 * invScale, 5 * invScale]);
      ctx.strokeRect(rectX, rectY, rectW, rectH);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 87, 34, 0.2)';
      ctx.fillRect(rectX, rectY, rectW, rectH);
    }
    ctx.restore();
  }, [rectangles, currentRectangle, hoveredAnnotationId, showAnnotations, zoom, pan]);

  useEffect(() => {
    if (imageLoaded) {
      drawCanvas();
    }
  }, [imageLoaded, drawCanvas]);

  // Redraw canvas when annotations change
  useEffect(() => {
    if (imageLoaded) {
      drawCanvas();
    }
  }, [rectangles, imageLoaded, drawCanvas]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) return null;
    const img = imageRef.current;
    const rect = canvas.getBoundingClientRect();
    const baseScale = baseScaleRef.current;
    const scale = baseScale * zoom;
    const panX = pan.x;
    const panY = pan.y;
    const displayToViewX = VIEW_WIDTH / rect.width;
    const displayToViewY = VIEW_HEIGHT / rect.height;
    const canvasX = (e.clientX - rect.left) * displayToViewX;
    const canvasY = (e.clientY - rect.top) * displayToViewY;
    let x = (canvasX - panX) / scale;
    let y = (canvasY - panY) / scale;
    // Clamp to image bounds so annotations never fall in the white area
    x = Math.max(0, Math.min(img.naturalWidth, x));
    y = Math.max(0, Math.min(img.naturalHeight, y));
    return { x, y };
  };

  const getViewCoordsFromEvent = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const displayToViewX = VIEW_WIDTH / rect.width;
    const displayToViewY = VIEW_HEIGHT / rect.height;
    return {
      x: (e.clientX - rect.left) * displayToViewX,
      y: (e.clientY - rect.top) * displayToViewY
    };
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) return;
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, e.deltaY > 0 ? zoom - ZOOM_STEP : zoom + ZOOM_STEP));
    const scale = baseScaleRef.current * zoom;
    const newScale = baseScaleRef.current * newZoom;
    const { x: canvasX, y: canvasY } = getViewCoordsFromEvent(e);
    const centerImageX = (canvasX - pan.x) / scale;
    const centerImageY = (canvasY - pan.y) / scale;
    setZoom(newZoom);
    setPan({
      x: canvasX - centerImageX * newScale,
      y: canvasY - centerImageY * newScale
    });
  };

  const handleResetZoom = () => {
    setZoom(1);
    if (!imageRef.current) return;
    const baseScale = baseScaleRef.current;
    const imgViewW = imageRef.current.naturalWidth * baseScale;
    const imgViewH = imageRef.current.naturalHeight * baseScale;
    setPan({ x: (VIEW_WIDTH - imgViewW) / 2, y: (VIEW_HEIGHT - imgViewH) / 2 });
  };

  const handleZoomButtons = (delta: number) => {
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + delta));
    const scale = baseScaleRef.current * zoom;
    const newScale = baseScaleRef.current * newZoom;
    const centerImageX = (VIEW_WIDTH / 2 - pan.x) / scale;
    const centerImageY = (VIEW_HEIGHT / 2 - pan.y) / scale;
    setZoom(newZoom);
    setPan({
      x: VIEW_WIDTH / 2 - centerImageX * newScale,
      y: VIEW_HEIGHT / 2 - centerImageY * newScale
    });
  };


  const isPointInRectangle = (point: Point, rect: Rectangle): boolean => {
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
           point.y >= rect.y && point.y <= rect.y + rect.height;
  };


  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const point = getCanvasCoordinates(e);
    if (!point) return;

    if (currentTool === 'hand') {
      setIsPanning(true);
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (currentTool === 'eraser') {
      const clickedRect = rectangles.find(rect => isPointInRectangle(point, rect));
      if (clickedRect) {
        const newRectangles = rectangles.filter(r => r.id !== clickedRect.id);
        setRectangles(newRectangles);
        setHoveredAnnotationId(null);
        setTimeout(async () => {
          await saveAnnotationsAutomatically(newRectangles);
        }, 100);
      } else {
        setIsPanning(true);
        lastPanRef.current = { x: e.clientX, y: e.clientY };
      }
      return;
    }

    if (currentTool === 'rectangle' && selectedLabel && !currentRectangle) {
      setCurrentRectangle({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
      setIsDrawing(true);
      return;
    }

    if (currentTool === 'rectangle' && currentRectangle) return;

    // Retângulo sem classe selecionada: não fazer nada (não usar como mão; usar a ferramenta Mão para pan)
    if (currentTool === 'rectangle' && !selectedLabel) return;

    setIsPanning(true);
    lastPanRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    if (currentTool === 'rectangle' && currentRectangle && isDrawing) {
      const point = getCanvasCoordinates(e);
      if (!point || !selectedLabel) return;

      const categoryId = labels.indexOf(selectedLabel) + 1;
      const newRect: Rectangle = {
        id: `rect-${Date.now()}`,
        x: Math.min(currentRectangle.startX, currentRectangle.endX),
        y: Math.min(currentRectangle.startY, currentRectangle.endY),
        width: Math.abs(currentRectangle.endX - currentRectangle.startX),
        height: Math.abs(currentRectangle.endY - currentRectangle.startY),
        label: selectedLabel,
        categoryId
      };
      
      // Only add if rectangle has minimum size
      if (newRect.width > 5 && newRect.height > 5) {
        const nextRects = [...rectangles, newRect];
        setRectangles(nextRects);
        setTimeout(() => saveAnnotationsAutomatically(nextRects), 100);
      }
      
      setCurrentRectangle(null);
      setIsDrawing(false);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (e.clientX - lastPanRef.current.x) * (VIEW_WIDTH / rect.width);
      const dy = (e.clientY - lastPanRef.current.y) * (VIEW_HEIGHT / rect.height);
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      return;
    }

    const point = getCanvasCoordinates(e);
    if (!point) return;

    if (currentTool === 'hand') {
      canvasRef.current!.style.cursor = 'grab';
      drawCanvas();
      return;
    }

    if (currentTool === 'eraser') {
      const hoveredRect = rectangles.find(rect => isPointInRectangle(point, rect));
      const hoveredId = hoveredRect ? hoveredRect.id : null;
      
      setHoveredAnnotationId(hoveredId);
      canvasRef.current!.style.cursor = hoveredId ? 'pointer' : 'default';
      drawCanvas();
      return;
    }

    // Rectangle tool: update rectangle while drawing
    if (currentTool === 'rectangle' && currentRectangle) {
      setCurrentRectangle({
        ...currentRectangle,
        endX: point.x,
        endY: point.y
      });
      canvasRef.current!.style.cursor = 'crosshair';
      drawCanvas();
      return;
    }

    if (currentTool === 'rectangle') {
      canvasRef.current!.style.cursor = selectedLabel ? 'crosshair' : 'default';
    } else {
      canvasRef.current!.style.cursor = 'default';
    }
  };

  const handleCancelCurrent = () => {
    setCurrentRectangle(null);
    setIsDrawing(false);
  };

  // Helper function to convert current annotations to COCO format and save
  const saveAnnotationsAutomatically = useCallback(async (rectsToSave: Rectangle[] = rectangles) => {
    const cocoAnnotations: COCOAnnotation[] = [];

    // Convert rectangles to COCO format
    rectsToSave.forEach(rect => {
      const segmentation = [
        rect.x, rect.y,
        rect.x + rect.width, rect.y,
        rect.x + rect.width, rect.y + rect.height,
        rect.x, rect.y + rect.height
      ];

      cocoAnnotations.push({
        category_id: rect.categoryId,
        segmentation: [segmentation],
        area: rect.width * rect.height,
        bbox: [rect.x, rect.y, rect.width, rect.height],
        iscrowd: 0
      });
    });

    try {
      await onSave(cocoAnnotations, false); // auto-save: não mostrar sucesso nem fechar modal
    } catch (error: unknown) {
      console.error('Erro ao salvar anotações automaticamente:', error);
      throw error;
    }
  }, [rectangles, onSave]);

  useImperativeHandle(ref, () => ({
    saveNow: async () => {
      const existingRects = [...(rectanglesRef.current ?? [])];
      const inProgress = currentRectangleRef.current;
      const label = selectedLabelRef.current;
      let rectsToSave = existingRects;
      if (inProgress && label && labels.includes(label)) {
        const categoryId = labels.indexOf(label) + 1;
        const w = Math.abs(inProgress.endX - inProgress.startX);
        const h = Math.abs(inProgress.endY - inProgress.startY);
        if (w > 5 && h > 5) {
          rectsToSave = [...existingRects, {
            id: `rect-save-${Date.now()}`,
            x: Math.min(inProgress.startX, inProgress.endX),
            y: Math.min(inProgress.startY, inProgress.endY),
            width: w,
            height: h,
            label,
            categoryId
          }];
        }
      }
      await saveAnnotationsAutomatically(rectsToSave);
      return rectsToSave.length > 0;
    },
    getAnnotationCount: () => rectanglesRef.current?.length ?? 0
  }), [labels, saveAnnotationsAutomatically]);

  // Estado de carregamento da imagem (não bloqueia toda a UI)
  const isImageReady = imageLoaded && imageRef.current;

  const tools = [
    { id: 'hand', icon: Hand, label: 'Mão' },
    { id: 'rectangle', icon: Square, label: 'Caixa' },
    { id: 'eraser', icon: Eraser, label: 'Borracha' },
  ];

  const handleToolChange = (id: string) => {
    const tool = id as AnnotationTool;
    setCurrentTool(tool);
    onToolChange?.(tool);
    handleCancelCurrent();
  };

  return (
    <AnnotationWorkspace
      className="h-full min-h-0"
      tools={tools}
      activeTool={currentTool}
      onToolChange={handleToolChange}
      railExtras={
        <>
          <AnnotationRailButton
            title="Aproximar"
            onClick={() => handleZoomButtons(ZOOM_STEP)}
          >
            <ZoomIn className="size-4" strokeWidth={1.75} />
          </AnnotationRailButton>
          <AnnotationRailButton
            title="Afastar"
            onClick={() => handleZoomButtons(-ZOOM_STEP)}
          >
            <ZoomOut className="size-4" strokeWidth={1.75} />
          </AnnotationRailButton>
          <AnnotationRailButton
            title={showAnnotations ? 'Ocultar marcações' : 'Mostrar marcações'}
            active={!showAnnotations}
            onClick={() => setShowAnnotations(!showAnnotations)}
          >
            <EyeOff className="size-4" strokeWidth={1.75} />
          </AnnotationRailButton>
          <AnnotationRailButton title="Redefinir zoom" onClick={handleResetZoom}>
            <RotateCcw className="size-4" strokeWidth={1.75} />
          </AnnotationRailButton>
        </>
      }
      canvas={
        <div ref={containerRef} className="flex max-h-full max-w-full flex-col items-center justify-center">
          {!isImageReady ? (
            <div
              className="flex items-center justify-center rounded-md bg-muted text-sm text-muted-foreground"
              style={{ width: Math.min(VIEW_WIDTH, 720), height: Math.min(VIEW_HEIGHT, 480) }}
            >
              Carregando imagem…
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseUp={handleCanvasMouseUp}
              onMouseMove={handleCanvasMouseMove}
              onWheel={handleWheel}
              className="block max-h-full max-w-full rounded-md"
              style={{
                width: 'auto',
                height: 'auto',
                maxWidth: '100%',
                maxHeight: '100%',
                cursor: isPanning
                  ? 'grabbing'
                  : currentTool === 'hand'
                    ? 'grab'
                    : currentTool === 'rectangle' && currentRectangle
                      ? 'crosshair'
                      : currentTool === 'rectangle' && selectedLabel
                        ? 'crosshair'
                        : currentTool === 'eraser'
                          ? 'grab'
                          : 'default',
                userSelect: 'none',
                background: '#111',
              }}
            />
          )}
        </div>
      }
      fileLabel={fileId.slice(-12)}
      currentIndex={showNavigation ? currentIndex : undefined}
      totalImages={showNavigation ? totalImages : undefined}
      onPrevious={onPrevious}
      onNext={isLastImage && onFinalize ? onFinalize : onNext}
      canGoPrevious={canGoPrevious}
      canGoNext={canGoNext}
      isLastImage={isLastImage}
      nextButtonLabel={nextButtonLabel}
      sidePanel={
        <>
          <AnnotationSideSection title="Classes">
            <div className="space-y-1.5">
              {labels.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  disabled={currentTool === 'eraser' || currentTool === 'hand'}
                  onClick={() => {
                    setSelectedLabel(label);
                    onSelectedLabelChange?.(label);
                    handleCancelCurrent();
                    if (currentTool !== 'rectangle') {
                      setCurrentTool('rectangle');
                      onToolChange?.('rectangle');
                    }
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs font-medium transition-colors duration-150 disabled:opacity-50',
                    selectedLabel === label
                      ? 'border-secondary bg-accent text-accent-foreground'
                      : 'border-border text-muted-foreground hover:border-secondary/60',
                  )}
                >
                  {label}
                  <span className="num text-[10px] opacity-70">{i + 1}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
              Zoom {(zoom * 100).toFixed(0)}% · {rectangles.length} objeto(s)
            </p>
          </AnnotationSideSection>

          <AnnotationSideSection title="Objetos marcados">
            {rectangles.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum objeto nesta imagem.</p>
            ) : (
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {rectangles.map((rect) => (
                  <li
                    key={rect.id}
                    onMouseEnter={() => setHoveredAnnotationId(rect.id)}
                    onMouseLeave={() => setHoveredAnnotationId(null)}
                    className={cn(
                      'flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs',
                      hoveredAnnotationId === rect.id && 'bg-muted',
                    )}
                  >
                    <Tag tone="primary">{rect.label}</Tag>
                    <div className="flex items-center gap-2">
                      <span className="num text-muted-foreground">
                        {Math.round(rect.width)}×{Math.round(rect.height)}
                      </span>
                      <button
                        type="button"
                        title="Remover"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          const next = rectangles.filter((r) => r.id !== rect.id);
                          setRectangles(next);
                          setTimeout(() => saveAnnotationsAutomatically(next), 100);
                        }}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AnnotationSideSection>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full rounded-md border border-border px-4 py-2 text-xs font-semibold transition-colors hover:border-secondary"
            >
              Cancelar
            </button>
          )}
        </>
      }
    />
  );
});

PolygonAnnotationEditor.displayName = 'PolygonAnnotationEditor';

export default PolygonAnnotationEditor;
