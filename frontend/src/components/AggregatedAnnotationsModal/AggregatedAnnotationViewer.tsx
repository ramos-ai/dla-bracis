import React, { useRef, useEffect, useState } from 'react';
import { getImageFromFs } from '../../services/GridFsService';
import type { AggregatedAnnotation } from '../../services/ExercisesService';

const CLASS_COLORS = [
  '#E65100', '#00838F', '#6A1B9A', '#BF360C', '#33691E',
  '#F9A825', '#AD1457', '#00695C', '#4E342E', '#283593',
  '#558B2F', '#DD2C00', '#37474F', '#7B1FA2', '#689F38', '#FF8F00'
];

interface AggregatedAnnotationViewerProps {
  fileId: string;
  annotations: AggregatedAnnotation[];
  taskType: 'detection' | 'segmentation';
  labels: string[];
  maxWidth?: number;
  maxHeight?: number;
}

const AggregatedAnnotationViewer: React.FC<AggregatedAnnotationViewerProps> = ({
  fileId,
  annotations,
  taskType,
  labels,
  maxWidth = 800,
  maxHeight = 600
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!fileId) return;

    const loadImage = async () => {
      try {
        const imageUrl = await getImageFromFs(fileId);
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          imageRef.current = img;
          setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
          setImageLoaded(true);
        };

        img.onerror = () => {
          console.error('Error loading image');
          setImageLoaded(false);
        };

        img.src = imageUrl;
      } catch (error) {
        console.error('Error fetching image:', error);
        setImageLoaded(false);
      }
    };

    loadImage();
  }, [fileId]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current || !imageSize) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgW = imageSize.width;
    const imgH = imageSize.height;

    const scale = Math.min(maxWidth / imgW, maxHeight / imgH, 1);
    const cw = Math.round(imgW * scale);
    const ch = Math.round(imgH * scale);

    canvas.width = cw;
    canvas.height = ch;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(imageRef.current, 0, 0, cw, ch);

    if (taskType === 'detection') {
      drawDetectionAnnotations(ctx, cw, ch, imgW, imgH);
    } else {
      drawSegmentationAnnotations(ctx, cw, ch);
    }
  };

  const drawDetectionAnnotations = (
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    imgW: number,
    imgH: number
  ) => {
    const scaleX = cw / imgW;
    const scaleY = ch / imgH;

    annotations.forEach((ann) => {
      if (ann.type !== 'bbox' || !ann.bbox) return;

      const [x, y, w, h] = ann.bbox;
      const sx = x * scaleX;
      const sy = y * scaleY;
      const sw = w * scaleX;
      const sh = h * scaleY;

      const color = CLASS_COLORS[ann.label_index % CLASS_COLORS.length];

      ctx.globalAlpha = 0.06;
      ctx.fillStyle = color;
      ctx.fillRect(sx, sy, sw, sh);

      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);

      ctx.globalAlpha = 1;
    });
  };

  const drawSegmentationAnnotations = (
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number
  ) => {
    annotations.forEach((ann) => {
      if (ann.type !== 'polygon' || !ann.polygon || ann.polygon.length < 6) return;

      const polygon = ann.polygon;
      const color = CLASS_COLORS[ann.label_index % CLASS_COLORS.length];

      const pts: number[] = [];
      for (let i = 0; i < polygon.length; i += 2) {
        const px = polygon[i];
        const py = polygon[i + 1];
        const isNormalized = px <= 1 && py <= 1;
        if (isNormalized) {
          pts.push(px * cw, py * ch);
        } else {
          pts.push(px, py);
        }
      }

      ctx.globalAlpha = 0.05;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) {
        ctx.lineTo(pts[i], pts[i + 1]);
      }
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.globalAlpha = 1;
    });
  };

  useEffect(() => {
    if (imageLoaded) {
      drawCanvas();
    }
  }, [imageLoaded, annotations, taskType]);

  if (!imageLoaded) {
    return (
      <div className="aggregated-viewer__loading">
        Carregando imagem...
      </div>
    );
  }

  return (
    <div className="aggregated-viewer">
      <canvas ref={canvasRef} className="aggregated-viewer__canvas" />
      <div className="aggregated-viewer__legend">
        <span className="aggregated-viewer__legend-title">Classes:</span>
        {labels.map((label, idx) => (
          <span key={label} className="aggregated-viewer__legend-item">
            <span
              className="aggregated-viewer__legend-color"
              style={{ backgroundColor: CLASS_COLORS[idx % CLASS_COLORS.length] }}
            />
            {label}
          </span>
        ))}
      </div>
      <div className="aggregated-viewer__info">
        {annotations.length} marcações de {new Set(annotations.map(a => a.user_id)).size} alunos
      </div>
    </div>
  );
};

export default AggregatedAnnotationViewer;
