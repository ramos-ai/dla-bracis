import { useState, useRef, useCallback, RefObject } from 'react';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 5;
export const ZOOM_STEP = 0.25;

interface Point {
  x: number;
  y: number;
}

interface UseCanvasZoomPanOptions {
  viewWidth: number;
  viewHeight: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  imageRef: RefObject<HTMLImageElement | null>;
  baseScaleRef: RefObject<number>;
}

interface UseCanvasZoomPanReturn {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: Point;
  setPan: React.Dispatch<React.SetStateAction<Point>>;
  isPanning: boolean;
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  lastPanRef: RefObject<Point>;
  handleWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  handleResetZoom: () => void;
  handleZoomButtons: (delta: number) => void;
  getViewCoordsFromEvent: (e: { clientX: number; clientY: number }) => Point;
  handlePanStart: (e: React.MouseEvent) => void;
  handlePanMove: (e: React.MouseEvent) => void;
  handlePanEnd: () => void;
}

/**
 * Hook for managing canvas zoom and pan functionality.
 * Extracts common logic from PolygonAnnotationEditor and SegmentationAnnotationEditor.
 */
export function useCanvasZoomPan({
  viewWidth,
  viewHeight,
  canvasRef,
  imageRef,
  baseScaleRef,
}: UseCanvasZoomPanOptions): UseCanvasZoomPanReturn {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanRef = useRef<Point>({ x: 0, y: 0 });

  const getViewCoordsFromEvent = useCallback((e: { clientX: number; clientY: number }): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const displayToViewX = viewWidth / rect.width;
    const displayToViewY = viewHeight / rect.height;
    return {
      x: (e.clientX - rect.left) * displayToViewX,
      y: (e.clientY - rect.top) * displayToViewY
    };
  }, [canvasRef, viewWidth, viewHeight]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
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
  }, [canvasRef, imageRef, baseScaleRef, zoom, pan, getViewCoordsFromEvent]);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    if (!imageRef.current) return;
    const baseScale = baseScaleRef.current;
    const imgViewW = imageRef.current.naturalWidth * baseScale;
    const imgViewH = imageRef.current.naturalHeight * baseScale;
    setPan({ x: (viewWidth - imgViewW) / 2, y: (viewHeight - imgViewH) / 2 });
  }, [imageRef, baseScaleRef, viewWidth, viewHeight]);

  const handleZoomButtons = useCallback((delta: number) => {
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + delta));
    const scale = baseScaleRef.current * zoom;
    const newScale = baseScaleRef.current * newZoom;
    const centerImageX = (viewWidth / 2 - pan.x) / scale;
    const centerImageY = (viewHeight / 2 - pan.y) / scale;
    
    setZoom(newZoom);
    setPan({
      x: viewWidth / 2 - centerImageX * newScale,
      y: viewHeight / 2 - centerImageY * newScale
    });
  }, [baseScaleRef, zoom, pan, viewWidth, viewHeight]);

  const handlePanStart = useCallback((e: React.MouseEvent) => {
    setIsPanning(true);
    lastPanRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - lastPanRef.current.x) * (viewWidth / rect.width);
    const dy = (e.clientY - lastPanRef.current.y) * (viewHeight / rect.height);
    lastPanRef.current = { x: e.clientX, y: e.clientY };
    
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, [isPanning, canvasRef, viewWidth, viewHeight]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  return {
    zoom,
    setZoom,
    pan,
    setPan,
    isPanning,
    setIsPanning,
    lastPanRef,
    handleWheel,
    handleResetZoom,
    handleZoomButtons,
    getViewCoordsFromEvent,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
  };
}
