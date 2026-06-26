import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import Button from '../Fields/Button';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { Icon } from '../Icons/Icons';
import { getImageFromFs } from '../../services/GridFsService';

interface Point {
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

  const navButtonStyle: React.CSSProperties = {
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: '2px solid #e0e0e0',
    backgroundColor: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    transition: 'all 0.2s ease',
    flexShrink: 0,
  };

  const navButtonDisabledStyle: React.CSSProperties = {
    ...navButtonStyle,
    opacity: 0.4,
    cursor: 'not-allowed',
    boxShadow: 'none',
  };

  return (
    <div className="polygon-annotation-editor" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Toolbar */}
      <div style={{ flexShrink: 0, padding: '0.5rem 1rem', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: '8px 8px 0 0', marginBottom: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', rowGap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <Button
              onClick={() => { setCurrentTool('hand'); onToolChange?.('hand'); handleCancelCurrent(); }}
              variant={currentTool === 'hand' ? 'primary' : 'secondary'}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Icon name="hand" size={14} /> Mão
            </Button>
            <Button
              onClick={() => { setCurrentTool('rectangle'); onToolChange?.('rectangle'); handleCancelCurrent(); }}
              variant={currentTool === 'rectangle' ? 'primary' : 'secondary'}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Icon name="rectangle" size={14} /> Retângulo
            </Button>
            <Button
              onClick={() => { setCurrentTool('eraser'); onToolChange?.('eraser'); handleCancelCurrent(); }}
              variant={currentTool === 'eraser' ? 'danger' : 'secondary'}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Icon name="eraser" size={14} /> Borracha
            </Button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <label htmlFor="label-select" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Classe:</label>
            <select
              id="label-select"
              value={selectedLabel}
              onChange={(e) => { const v = e.target.value; setSelectedLabel(v); onSelectedLabelChange?.(v); handleCancelCurrent(); }}
              disabled={currentTool === 'eraser' || currentTool === 'hand'}
              style={{ padding: '0.35rem', fontSize: '0.85rem', minWidth: '120px', borderRadius: '4px', border: '1px solid #ddd', backgroundColor: (currentTool === 'eraser' || currentTool === 'hand') ? '#f5f5f5' : 'white' }}
            >
              <option value="">-- Selecione --</option>
              {labels.map((label, idx) => (<option key={idx} value={label}>{label}</option>))}
            </select>
          </div>
          <Button
            onClick={() => setShowAnnotations(!showAnnotations)}
            variant={showAnnotations ? 'secondary' : 'primary'}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            {showAnnotations ? <><Icon name="eye" size={14} /> Ocultar</> : <><Icon name="eyeSlash" size={14} /> Mostrar</>}
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Button onClick={() => handleZoomButtons(-ZOOM_STEP)} variant="secondary" style={{ padding: '0.2rem 0.4rem', minWidth: '28px', fontSize: '0.85rem' }}>−</Button>
            <span style={{ minWidth: '2.5rem', textAlign: 'center', fontSize: '0.8rem' }}>{(zoom * 100).toFixed(0)}%</span>
            <Button onClick={() => handleZoomButtons(ZOOM_STEP)} variant="secondary" style={{ padding: '0.2rem 0.4rem', minWidth: '28px', fontSize: '0.85rem' }}>+</Button>
            <Button onClick={handleResetZoom} variant="secondary" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}>Reset</Button>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '0.8rem', fontWeight: '600', color: '#666' }}>
            {rectangles.length} objeto(s)
            {showNavigation && currentIndex !== undefined && totalImages !== undefined && (
              <span style={{ marginLeft: '0.75rem', color: '#1976d2' }}>
                Imagem {currentIndex + 1}/{totalImages}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Área principal: setas + canvas */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem', width: '100%' }}>
        {/* Seta esquerda */}
        {showNavigation && (
          <button
            onClick={onPrevious}
            disabled={!canGoPrevious}
            style={canGoPrevious ? navButtonStyle : navButtonDisabledStyle}
            title="Imagem anterior"
            type="button"
          >
            <Icon name="arrowLeft" size={24} />
          </button>
        )}

        {/* Canvas container */}
        <div
          ref={containerRef}
          className="polygon-annotation-editor__canvas-container"
          style={{
            flexShrink: 0,
            padding: '0.5rem',
            backgroundColor: '#fafafa',
            border: '1px solid #e0e0e0',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
          }}
        >
          {!isImageReady ? (
            <div
              style={{
                width: VIEW_WIDTH,
                height: VIEW_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#e8e8e8',
                borderRadius: '8px',
                border: '2px solid #ddd',
              }}
            >
              <span style={{ color: '#666', fontSize: '0.9rem' }}>Carregando imagem...</span>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseUp={handleCanvasMouseUp}
              onMouseMove={handleCanvasMouseMove}
              onWheel={handleWheel}
              style={{
                border: '2px solid #ddd',
                borderRadius: '8px',
                cursor: isPanning ? 'grabbing' : currentTool === 'hand' ? 'grab' : (currentTool === 'rectangle' && currentRectangle) ? 'crosshair' : (currentTool === 'rectangle' && selectedLabel) ? 'crosshair' : currentTool === 'eraser' ? 'grab' : 'default',
                userSelect: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                display: 'block',
                maxWidth: '100%',
                background: '#e8e8e8',
              }}
            />
          )}
        </div>

        {/* Seta direita */}
        {showNavigation && (
          <button
            onClick={isLastImage && onFinalize ? onFinalize : onNext}
            disabled={!canGoNext && !isLastImage}
            style={(canGoNext || isLastImage) ? navButtonStyle : navButtonDisabledStyle}
            title={isLastImage ? (nextButtonLabel || 'Finalizar') : 'Próxima imagem'}
            type="button"
          >
            {isLastImage ? (
              <Icon name="check" size={24} />
            ) : (
              <Icon name="arrowRight" size={24} />
            )}
          </button>
        )}
      </div>

      {/* Lista de anotações compacta */}
      <div style={{ marginTop: '0.75rem', maxHeight: '150px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <strong style={{ fontSize: '0.9rem' }}>Anotações ({rectangles.length})</strong>
        </div>
        {rectangles.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', fontSize: '0.85rem', margin: 0 }}>Nenhuma anotação criada ainda.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {rectangles.map((rect) => (
              <div
                key={rect.id}
                onMouseEnter={() => setHoveredAnnotationId(rect.id)}
                onMouseLeave={() => setHoveredAnnotationId(null)}
                style={{
                  padding: '0.35rem 0.5rem',
                  backgroundColor: hoveredAnnotationId === rect.id ? '#fff9c4' : '#f5f5f5',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  borderLeft: `3px solid ${CLASS_COLORS[rect.categoryId % CLASS_COLORS.length]}`,
                  fontSize: '0.8rem',
                }}
              >
                <span>{rect.label} <span style={{ color: '#666' }}>{Math.round(rect.width)}×{Math.round(rect.height)}</span></span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = rectangles.filter(r => r.id !== rect.id);
                    setRectangles(next);
                    setTimeout(() => saveAnnotationsAutomatically(next), 100);
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: '#1976d2' }}
                  title="Remover"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {onCancel && (
        <div className="polygon-annotation-editor__footer" style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
          <Button onClick={onCancel} variant="secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
            <Icon name="close" size={14} /> Cancelar
          </Button>
        </div>
      )}
    </div>
  );
});

PolygonAnnotationEditor.displayName = 'PolygonAnnotationEditor';

export default PolygonAnnotationEditor;
