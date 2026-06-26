import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import Button from '../Fields/Button';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import { Icon } from '../Icons/Icons';
import { getImageFromFs } from '../../services/GridFsService';
import type { SegmentationAnnotation } from '../../services/SegmentationService';

interface Point {
  x: number;
  y: number;
}

interface PolygonShape {
  id: string;
  classId: number;
  label: string;
  polygon: number[]; // [x1,y1, x2,y2, ...] em coordenadas de imagem (pixels)
}

type AnnotationTool = 'hand' | 'polygon' | 'eraser';

export interface SegmentationAnnotationEditorHandle {
  /** Salva as anotações atuais e resolve quando terminar. Retorna true se havia anotações para salvar. */
  saveNow: () => Promise<boolean>;
  /** Retorna o número de anotações atuais */
  getAnnotationCount: () => number;
}

interface SegmentationAnnotationEditorProps {
  fileId: string;
  datasetId: string;
  labels: string[];
  existingAnnotations?: SegmentationAnnotation[];
  onSave: (annotations: SegmentationAnnotation[], isExplicitSave?: boolean) => Promise<void>;
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
  currentIndex?: number;
  totalImages?: number;
}

const CLASS_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#E91E63', '#795548',
  '#3F51B5', '#009688', '#CDDC39', '#FF5722', '#607D8B', '#673AB7', '#8BC34A', '#FFC107'
];


const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 540;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
/** Raio (em px de imagem) para considerar clique num vértice do polígono em construção (borracha apaga vértice). */
const VERTEX_HIT_RADIUS = 14;
/** Raio do círculo "Clique para fechar" e zona de clique no primeiro ponto (px em coordenadas de imagem). */
const CLOSE_POLYGON_HIT_RADIUS = 14;

function pointInPolygon(px: number, py: number, polygon: number[]): boolean {
  if (polygon.length < 6) return false;
  let inside = false;
  const n = polygon.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i * 2], yi = polygon[i * 2 + 1];
    const xj = polygon[j * 2], yj = polygon[j * 2 + 1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/** Índice do vértice (0-based) em currentPoints mais próximo de (px, py), ou -1 se nenhum dentro de radius. */
function findVertexIndex(px: number, py: number, currentPoints: number[], radius: number): number {
  if (currentPoints.length < 4) return -1;
  let bestIdx = -1;
  let bestDist = radius * radius;
  for (let i = 0; i < currentPoints.length; i += 2) {
    const dx = currentPoints[i] - px;
    const dy = currentPoints[i + 1] - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      bestIdx = i / 2;
    }
  }
  return bestIdx;
}

const SegmentationAnnotationEditor = forwardRef<SegmentationAnnotationEditorHandle, SegmentationAnnotationEditorProps>(({
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
  const polygonsRef = useRef<PolygonShape[]>([]);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [polygons, setPolygons] = useState<PolygonShape[]>([]);
  const [currentTool, setCurrentTool] = useState<AnnotationTool>(initialTool);
  const [currentPoints, setCurrentPoints] = useState<number[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<string>(initialSelectedLabel);
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    polygonsRef.current = polygons;
  }, [polygons]);

  // Reset apenas quando fileId muda (não quando initialTool/initialSelectedLabel mudam - isso quebraria ao trocar ferramenta)
  useEffect(() => {
    setPolygons([]);
    setCurrentPoints([]);
    setSelectedLabel(initialSelectedLabel);
    setCurrentTool(initialTool);
    setHoveredAnnotationId(null);
    setImageLoaded(false);
    setPan({ x: 0, y: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só resetar ao mudar imagem, não ao sincronizar tool/label
  }, [fileId]);

  useEffect(() => {
    if (!fileId || !imageLoaded || !imageRef.current) return;
    const img = imageRef.current;
    setPolygons([]);
    if (existingAnnotations && existingAnnotations.length > 0) {
      const loaded: PolygonShape[] = existingAnnotations.map((ann, idx) => {
        const classId = ann.class_id;
        const label = labels[classId - 1] || `Classe ${classId}`;
        const poly = ann.polygon || [];
        const pixelPoly: number[] = [];
        for (let i = 0; i < poly.length; i += 2) {
          pixelPoly.push((poly[i] ?? 0) * img.naturalWidth, (poly[i + 1] ?? 0) * img.naturalHeight);
        }
        return { id: `poly-${idx}`, classId, label, polygon: pixelPoly };
      });
      setPolygons(loaded);
    }
  }, [existingAnnotations, labels, fileId, imageLoaded]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      const baseScale = Math.min(VIEW_WIDTH / img.naturalWidth, VIEW_HEIGHT / img.naturalHeight, 1);
      baseScaleRef.current = baseScale;
      const imgViewW = img.naturalWidth * baseScale;
      const imgViewH = img.naturalHeight * baseScale;
      setPan({ x: (VIEW_WIDTH - imgViewW) / 2, y: (VIEW_HEIGHT - imgViewH) / 2 });
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error('Error loading image');
      showAlert('Erro ao carregar imagem');
    };
    img.src = getImageFromFs(fileId);
  }, [fileId]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) return null;
    const img = imageRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = baseScaleRef.current * zoom;
    const panX = pan.x, panY = pan.y;
    const displayToViewX = VIEW_WIDTH / rect.width, displayToViewY = VIEW_HEIGHT / rect.height;
    const canvasX = (e.clientX - rect.left) * displayToViewX;
    const canvasY = (e.clientY - rect.top) * displayToViewY;
    let x = (canvasX - panX) / scale;
    let y = (canvasY - panY) / scale;
    // Clamp to image bounds so points/annotations never fall in the white area
    x = Math.max(0, Math.min(img.naturalWidth, x));
    y = Math.max(0, Math.min(img.naturalHeight, y));
    return { x, y };
  };

  const getViewCoordsFromEvent = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (VIEW_WIDTH / rect.width),
      y: (e.clientY - rect.top) * (VIEW_HEIGHT / rect.height)
    };
  };

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = imageRef.current;
    const scale = baseScaleRef.current * zoom;
    const panX = pan.x, panY = pan.y;
    const invScale = 1 / scale;
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    };

    canvas.width = VIEW_WIDTH;
    canvas.height = VIEW_HEIGHT;
    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

    if (showAnnotations) {
      polygons.forEach((poly) => {
        const isHovered = hoveredAnnotationId === poly.id;
        const color = CLASS_COLORS[poly.classId % CLASS_COLORS.length];
        ctx.strokeStyle = isHovered ? '#000' : color;
        ctx.lineWidth = (isHovered ? 4 : 2) * invScale;
        ctx.fillStyle = hexToRgba(color, 0.3);
        if (poly.polygon.length >= 6) {
          ctx.beginPath();
          ctx.moveTo(poly.polygon[0], poly.polygon[1]);
          for (let i = 2; i < poly.polygon.length; i += 2) ctx.lineTo(poly.polygon[i], poly.polygon[i + 1]);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = '#000';
        ctx.font = `${12 * invScale}px Arial`;
        const cx = poly.polygon.reduce((s, _, i) => s + (i % 2 === 0 ? poly.polygon[i] : 0), 0) / (poly.polygon.length / 2);
        const cy = poly.polygon.reduce((s, _, i) => s + (i % 2 === 1 ? poly.polygon[i] : 0), 0) / (poly.polygon.length / 2);
        ctx.fillText(poly.label, cx - 20, cy - 8 * invScale);
      });
    }

    if (currentPoints.length >= 2) {
      ctx.strokeStyle = '#FF5722';
      ctx.lineWidth = 2 * invScale;
      ctx.setLineDash([5 * invScale, 5 * invScale]);
      ctx.beginPath();
      ctx.moveTo(currentPoints[0], currentPoints[1]);
      for (let i = 2; i < currentPoints.length; i += 2) ctx.lineTo(currentPoints[i], currentPoints[i + 1]);
      ctx.stroke();
      ctx.setLineDash([]);
      currentPoints.forEach((_, i) => {
        if (i % 2 === 0) {
          ctx.fillStyle = '#FF5722';
          ctx.beginPath();
          ctx.arc(currentPoints[i], currentPoints[i + 1], 5 * invScale, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      // Indicador "clique aqui para fechar": círculo no primeiro ponto quando há ≥3 pontos
      if (currentPoints.length >= 6) {
        const x0 = currentPoints[0], y0 = currentPoints[1];
        ctx.strokeStyle = 'rgba(33, 150, 243, 0.9)';
        ctx.lineWidth = 2 * invScale;
        ctx.setLineDash([4 * invScale, 4 * invScale]);
        ctx.beginPath();
        ctx.arc(x0, y0, CLOSE_POLYGON_HIT_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(33, 150, 243, 0.15)';
        ctx.fill();
        ctx.fillStyle = '#1565C0';
        ctx.font = `${11 * invScale}px Arial`;
        ctx.fillText('Clique para fechar', x0 + CLOSE_POLYGON_HIT_RADIUS + 4, y0 + 4 * invScale);
      }
    }
    ctx.restore();
  }, [polygons, currentPoints, hoveredAnnotationId, showAnnotations, zoom, pan]);

  useEffect(() => {
    if (imageLoaded) drawCanvas();
  }, [imageLoaded, drawCanvas]);

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (!canvasRef.current || !imageRef.current) return;
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, e.deltaY > 0 ? zoom - ZOOM_STEP : zoom + ZOOM_STEP));
    const scale = baseScaleRef.current * zoom;
    const newScale = baseScaleRef.current * newZoom;
    const { x: canvasX, y: canvasY } = getViewCoordsFromEvent(e);
    const centerImageX = (canvasX - pan.x) / scale, centerImageY = (canvasY - pan.y) / scale;
    setZoom(newZoom);
    setPan({ x: canvasX - centerImageX * newScale, y: canvasY - centerImageY * newScale });
  };

  const handleResetZoom = () => {
    setZoom(1);
    if (!imageRef.current) return;
    const baseScale = baseScaleRef.current;
    setPan({ x: (VIEW_WIDTH - imageRef.current.naturalWidth * baseScale) / 2, y: (VIEW_HEIGHT - imageRef.current.naturalHeight * baseScale) / 2 });
  };

  const handleZoomButtons = (delta: number) => {
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + delta));
    const scale = baseScaleRef.current * zoom;
    const newScale = baseScaleRef.current * newZoom;
    const centerImageX = (VIEW_WIDTH / 2 - pan.x) / scale, centerImageY = (VIEW_HEIGHT / 2 - pan.y) / scale;
    setZoom(newZoom);
    setPan({ x: VIEW_WIDTH / 2 - centerImageX * newScale, y: VIEW_HEIGHT / 2 - centerImageY * newScale });
  };

  const saveAnnotationsAutomatically = async (polysToSave: PolygonShape[] = polygons) => {
    if (!imageRef.current) return;
    const w = imageRef.current.naturalWidth, h = imageRef.current.naturalHeight;
    const annotations: SegmentationAnnotation[] = polysToSave.map((p) => ({
      class_id: p.classId,
      polygon: p.polygon.map((v, i) => (i % 2 === 0 ? v / w : v / h))
    }));
    try {
      await onSave(annotations, false);
    } catch (err) {
      console.error('Erro ao salvar anotações automaticamente:', err);
      throw err;
    }
  };

  useImperativeHandle(ref, () => ({
    saveNow: async () => {
      const polys = polygonsRef.current ?? [];
      await saveAnnotationsAutomatically(polys);
      return polys.length > 0;
    },
    getAnnotationCount: () => polygonsRef.current?.length ?? 0
  }), []);

  const handleClosePolygon = () => {
    if (currentPoints.length < 6 || !selectedLabel) return;
    const categoryId = labels.indexOf(selectedLabel) + 1;
    const newPoly: PolygonShape = {
      id: `poly-${Date.now()}`,
      classId: categoryId,
      label: selectedLabel,
      polygon: [...currentPoints]
    };
    const next = [...polygons, newPoly];
    setPolygons(next);
    setCurrentPoints([]);
    setTimeout(() => saveAnnotationsAutomatically(next), 100);
  };

  const handleCancelCurrent = () => {
    setCurrentPoints([]);
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
      const clickedPoly = polygons.find((p) => pointInPolygon(point.x, point.y, p.polygon));
      if (clickedPoly) {
        const next = polygons.filter((p) => p.id !== clickedPoly.id);
        setPolygons(next);
        setHoveredAnnotationId(null);
        setTimeout(() => saveAnnotationsAutomatically(next), 100);
        return;
      }
      if (currentPoints.length >= 4) {
        const vertexIdx = findVertexIndex(point.x, point.y, currentPoints, VERTEX_HIT_RADIUS);
        if (vertexIdx >= 0) {
          const next = [...currentPoints];
          next.splice(vertexIdx * 2, 2);
          setCurrentPoints(next.length >= 4 ? next : []);
          return;
        }
      }
      setIsPanning(true);
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (currentTool === 'polygon' && selectedLabel) {
      // Fechar polígono ao clicar perto do primeiro ponto (≥3 pontos já colocados)
      if (currentPoints.length >= 6) {
        const x0 = currentPoints[0], y0 = currentPoints[1];
        const dx = point.x - x0, dy = point.y - y0;
        if (dx * dx + dy * dy <= CLOSE_POLYGON_HIT_RADIUS * CLOSE_POLYGON_HIT_RADIUS) {
          handleClosePolygon();
          return;
        }
      }
      setCurrentPoints((prev) => [...prev, point.x, point.y]);
    }
    if (currentTool === 'polygon' && !selectedLabel) return;
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPanning) setIsPanning(false);
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
    if (currentTool === 'eraser') {
      const hovered = polygons.find((p) => pointInPolygon(point.x, point.y, p.polygon));
      setHoveredAnnotationId(hovered ? hovered.id : null);
      const overVertex = currentPoints.length >= 4 && findVertexIndex(point.x, point.y, currentPoints, VERTEX_HIT_RADIUS) >= 0;
      if (canvasRef.current) canvasRef.current.style.cursor = (hovered || overVertex) ? 'pointer' : 'default';
    } else if (currentTool === 'hand' && canvasRef.current) {
      canvasRef.current.style.cursor = 'grab';
    } else if (currentTool === 'polygon' && canvasRef.current) {
      canvasRef.current.style.cursor = selectedLabel ? 'crosshair' : 'default';
    }
  };

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
    <div className="segmentation-annotation-editor" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Toolbar */}
      <div style={{ flexShrink: 0, padding: '0.5rem 1rem', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: '8px 8px 0 0', marginBottom: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', rowGap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <Button onClick={() => { setCurrentTool('hand'); onToolChange?.('hand'); }} variant={currentTool === 'hand' ? 'primary' : 'secondary'} style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Icon name="hand" size={14} /> Mão</Button>
            <Button onClick={() => { setCurrentTool('polygon'); onToolChange?.('polygon'); }} variant={currentTool === 'polygon' ? 'primary' : 'secondary'} style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Icon name="polygon" size={14} /> Polígono</Button>
            <Button onClick={() => { setCurrentTool('eraser'); onToolChange?.('eraser'); }} variant={currentTool === 'eraser' ? 'danger' : 'secondary'} style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Icon name="eraser" size={14} /> Borracha</Button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <label htmlFor="seg-label-select" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Classe:</label>
            <select
              id="seg-label-select"
              value={selectedLabel}
              onChange={(e) => { const v = e.target.value; setSelectedLabel(v); onSelectedLabelChange?.(v); }}
              disabled={currentTool === 'eraser' || currentTool === 'hand'}
              style={{ padding: '0.35rem', fontSize: '0.85rem', minWidth: '120px', borderRadius: '4px', border: '1px solid #ddd', backgroundColor: (currentTool === 'eraser' || currentTool === 'hand') ? '#f5f5f5' : 'white' }}
            >
              <option value="">-- Selecione --</option>
              {labels.map((label, idx) => (<option key={idx} value={label}>{label}</option>))}
            </select>
          </div>
          <Button onClick={() => setShowAnnotations(!showAnnotations)} variant={showAnnotations ? 'secondary' : 'primary'} style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            {showAnnotations ? <><Icon name="eye" size={14} /> Ocultar</> : <><Icon name="eyeSlash" size={14} /> Mostrar</>}
          </Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Button onClick={() => handleZoomButtons(-ZOOM_STEP)} variant="secondary" style={{ padding: '0.2rem 0.4rem', minWidth: '28px', fontSize: '0.85rem' }}>−</Button>
            <span style={{ minWidth: '2.5rem', textAlign: 'center', fontSize: '0.8rem' }}>{(zoom * 100).toFixed(0)}%</span>
            <Button onClick={() => handleZoomButtons(ZOOM_STEP)} variant="secondary" style={{ padding: '0.2rem 0.4rem', minWidth: '28px', fontSize: '0.85rem' }}>+</Button>
            <Button onClick={handleResetZoom} variant="secondary" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}>Reset</Button>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '0.8rem', fontWeight: '600', color: '#666' }}>
            {polygons.length} polígono(s)
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
          className="segmentation-annotation-editor__canvas-container"
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
            <>
              <canvas
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseUp={handleCanvasMouseUp}
                onMouseMove={handleCanvasMouseMove}
                onWheel={handleWheel}
                style={{
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  cursor: isPanning ? 'grabbing' : currentTool === 'hand' ? 'grab' : currentTool === 'eraser' ? 'pointer' : selectedLabel ? 'crosshair' : 'default',
                  userSelect: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  display: 'block',
                  maxWidth: '100%',
                  background: '#e8e8e8',
                }}
              />
              {currentPoints.length >= 2 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                  <Button onClick={handleClosePolygon} disabled={currentPoints.length < 6} variant="primary" style={{ fontSize: '0.8rem' }}>
                    Fechar polígono ({currentPoints.length / 2} pts)
                  </Button>
                  <Button onClick={handleCancelCurrent} variant="danger" style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Icon name="close" size={14} /> Cancelar</Button>
                </div>
              )}
            </>
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
          <strong style={{ fontSize: '0.9rem' }}>Anotações ({polygons.length})</strong>
        </div>
        {polygons.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic', fontSize: '0.85rem', margin: 0 }}>Nenhum polígono. Use a ferramenta Polígono e selecione uma classe.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {polygons.map((p) => (
              <div
                key={p.id}
                onMouseEnter={() => setHoveredAnnotationId(p.id)}
                onMouseLeave={() => setHoveredAnnotationId(null)}
                style={{
                  padding: '0.35rem 0.5rem',
                  backgroundColor: hoveredAnnotationId === p.id ? '#fff9c4' : '#f5f5f5',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  borderLeft: `3px solid ${CLASS_COLORS[p.classId % CLASS_COLORS.length]}`,
                  fontSize: '0.8rem',
                }}
              >
                <span>{p.label}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = polygons.filter(x => x.id !== p.id);
                    setPolygons(next);
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
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
          <Button onClick={onCancel} variant="secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}><Icon name="close" size={14} /> Cancelar</Button>
        </div>
      )}
    </div>
  );
});

SegmentationAnnotationEditor.displayName = 'SegmentationAnnotationEditor';

export default SegmentationAnnotationEditor;
