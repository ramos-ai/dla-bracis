import React, { useRef, useEffect, useState } from 'react';
import { getImageFromFs } from '../../services/GridFsService';
import type { SegmentationAnnotation } from '../../services/SegmentationService';
import type { SegmentationMatch } from '../../services/SegmentationService';

/** Cor dos polígonos de referência (professor). */
const REFERENCE_COLOR = '#1565C0';
/** Cores dos polígonos do aluno por classe (para distinguir do professor). */
const STUDENT_CLASS_COLORS = [
  '#E65100', '#00838F', '#6A1B9A', '#BF360C', '#33691E', '#F9A825', '#AD1457', '#00695C',
  '#4E342E', '#283593', '#558B2F', '#DD2C00', '#37474F', '#7B1FA2', '#689F38', '#FF8F00'
];

interface SegmentationAnnotationViewerProps {
  fileId: string;
  studentAnnotations: SegmentationAnnotation[];
  correctAnnotations: SegmentationAnnotation[];
  labels: string[];
  iouThreshold?: number;
  scoreMode?: 'recall' | 'f1';
  /** Score for this image (0-100), from evaluate API */
  imageScore?: number;
  /** Matches from evaluate API */
  matches?: SegmentationMatch[];
  maxWidth?: number;
  maxHeight?: number;
  /** Enable manual correction mode */
  enableManualCorrection?: boolean;
  /** Manual corrections: { annotationIdx: true/false } */
  manualCorrections?: Record<string, boolean>;
}

const SegmentationAnnotationViewer: React.FC<SegmentationAnnotationViewerProps> = ({
  fileId,
  studentAnnotations,
  correctAnnotations,
  labels,
  iouThreshold = 0.75,
  scoreMode = 'recall',
  imageScore,
  matches = [],
  maxWidth = 640,
  maxHeight = 480,
  enableManualCorrection = false,
  manualCorrections = {}
}) => {
  const STANDARD_VIEW_MAX_WIDTH = maxWidth;
  const STANDARD_VIEW_MAX_HEIGHT = maxHeight;
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
        img.onerror = () => setImageLoaded(false);
        img.src = imageUrl;
      } catch {
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
    const w = imageSize.width;
    const h = imageSize.height;
    const scale = Math.min(STANDARD_VIEW_MAX_WIDTH / w, STANDARD_VIEW_MAX_HEIGHT / h, 1);
    const cw = w * scale;
    const ch = h * scale;
    canvas.width = cw;
    canvas.height = ch;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(imageRef.current, 0, 0, cw, ch);

    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    };

    const drawPolygon = (polygon: number[], color: string, isDashed: boolean, label?: string) => {
      if (!polygon || polygon.length < 6) return;
      const pts: number[] = [];
      for (let i = 0; i < polygon.length; i += 2) {
        pts.push(polygon[i] * cw, polygon[i + 1] * ch);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(isDashed ? [6, 4] : []);
      ctx.fillStyle = hexToRgba(color, 0.25);
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (label) {
        const cx = pts.reduce((s, _, i) => s + (i % 2 === 0 ? pts[i] : 0), 0) / (pts.length / 2);
        const cy = pts.reduce((s, _, i) => s + (i % 2 === 1 ? pts[i] : 0), 0) / (pts.length / 2);
        ctx.fillStyle = color;
        ctx.font = 'bold 12px Arial';
        ctx.fillText(label, cx - 20, cy - 6);
      }
    };

    // Referência (professor): cor fixa azul para diferenciar do aluno
    correctAnnotations.forEach((ann) => {
      const labelName = labels[ann.class_id - 1] || `Classe ${ann.class_id}`;
      drawPolygon(ann.polygon, REFERENCE_COLOR, false, `Ref: ${labelName}`);
    });

    // Aluno: cores por classe (laranja/roxo/etc.) para diferenciar do professor
    // Consider manual corrections when determining if an annotation is matched
    const matchedStudentIdxs = new Set(matches.map(m => m.student_idx));
    
    // Add manually corrected annotations to matched set
    if (enableManualCorrection && Object.keys(manualCorrections).length > 0) {
      Object.entries(manualCorrections).forEach(([idxStr, isCorrect]) => {
        if (isCorrect) {
          matchedStudentIdxs.add(parseInt(idxStr, 10));
        }
      });
    }
    
    studentAnnotations.forEach((ann, idx) => {
      const color = STUDENT_CLASS_COLORS[(ann.class_id - 1) % STUDENT_CLASS_COLORS.length];
      const labelName = labels[ann.class_id - 1] || `Classe ${ann.class_id}`;
      const isMatched = matchedStudentIdxs.has(idx);
      const match = matches.find(m => m.student_idx === idx);
      const isManuallyCorrect = enableManualCorrection && manualCorrections[idx.toString()] === true;
      const iouText = match ? ` IoU ${(match.iou * 100).toFixed(1)}%` : (isManuallyCorrect ? ' (Manual ✓)' : '');
      drawPolygon(ann.polygon, color, !isMatched, `Aluno: ${labelName}${iouText}`);
    });
  };

  useEffect(() => {
    if (imageLoaded) drawCanvas();
  }, [imageLoaded, studentAnnotations, correctAnnotations, matches, imageSize, enableManualCorrection, manualCorrections]);

  if (!fileId) return <div>Nenhuma imagem selecionada</div>;

  const scoreText = imageScore !== undefined && imageScore !== null
    ? `Nota desta imagem: ${imageScore.toFixed(1)}%`
    : null;
  const modeText = scoreMode === 'f1' ? 'F1 (precisão e recall)' : 'Recall (objetos de referência encontrados)';

  return (
    <div className="segmentation-annotation-viewer">
      <div className="segmentation-annotation-viewer__canvas-container">
        <canvas
          ref={canvasRef}
          className="segmentation-annotation-viewer__canvas"
          style={{ border: '1px solid #ddd', borderRadius: '4px' }}
        />
      </div>
      <div className="segmentation-annotation-viewer__legend" style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: REFERENCE_COLOR, border: '1px solid #0D47A1' }} />
            <span style={{ fontSize: '0.9rem' }}>Referência (professor)</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: STUDENT_CLASS_COLORS[0], border: '1px solid #BF360C' }} />
            <span style={{ fontSize: '0.9rem' }}>Aluno (traço contínuo = correto; tracejado = sem correspondência)</span>
          </span>
        </div>
      </div>
      <div className="segmentation-annotation-viewer__explanation" style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
        <h4 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem' }}>Critérios de avaliação (segmentação)</h4>
        <div style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
          <p style={{ margin: '0.25rem 0' }}>
            <strong>IoU máscara:</strong> ≥ {(iouThreshold * 100).toFixed(0)}% (interseção sobre união dos polígonos).
          </p>
          <p style={{ margin: '0.25rem 0' }}>
            <strong>Modo de nota:</strong> {modeText}.
          </p>
          <p style={{ margin: '0.25rem 0' }}>
            <strong>Anotações do aluno:</strong> {studentAnnotations.length}. <strong>Referência:</strong> {correctAnnotations.length}.
          </p>
          <p style={{ margin: '0.25rem 0' }}>
            <strong>Correspondências:</strong> {matches.length} de {correctAnnotations.length} esperadas.
          </p>
          {scoreText && (
            <p style={{ margin: '0.5rem 0', fontWeight: 'bold', color: '#1565c0' }}>{scoreText}</p>
          )}
          {matches.length > 0 && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#fff', borderRadius: '4px' }}>
              <strong>Detalhes das correspondências:</strong>
              <ul style={{ margin: '0.25rem 0', paddingLeft: '1.5rem' }}>
                {matches.map((m, idx) => {
                  const studentAnn = studentAnnotations[m.student_idx];
                  const label = studentAnn ? (labels[studentAnn.class_id - 1] || `Classe ${studentAnn.class_id}`) : '-';
                  return (
                    <li key={idx}>{label}: IoU = {(m.iou * 100).toFixed(1)}% ✓</li>
                  );
                })}
              </ul>
            </div>
          )}
          {studentAnnotations.length > matches.length && (
            <p style={{ margin: '0.5rem 0', color: '#f44336' }}>
              ⚠️ {studentAnnotations.length - matches.length} polígono(s) do aluno sem correspondência.
            </p>
          )}
          {correctAnnotations.length > matches.length && (
            <p style={{ margin: '0.5rem 0', color: '#f44336' }}>
              ⚠️ {correctAnnotations.length - matches.length} polígono(s) de referência não marcados pelo aluno.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SegmentationAnnotationViewer;
