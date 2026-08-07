import React, { useRef, useEffect, useState } from 'react';
import { getImageFromFs } from '../../services/GridFsService';
import './AnnotationViewer.scss';

interface COCOAnnotation {
  category_id: number;
  segmentation: number[][];
  area: number;
  bbox: number[]; // [x, y, width, height]
  iscrowd: number;
}

interface AnnotationViewerProps {
  fileId: string;
  studentAnnotations: COCOAnnotation[];
  correctAnnotations: COCOAnnotation[];
  labels: string[]; 
  iouThreshold?: number; 
  enableManualCorrection?: boolean; // Se true, permite correção manual
  manualCorrections?: Record<string, boolean>; // { annotationIdx: true/false }
  onManualCorrectionChange?: (corrections: Record<string, boolean>) => void;
  maxWidth?: number; 
  maxHeight?: number;
}

const AnnotationViewer: React.FC<AnnotationViewerProps> = ({
  fileId,
  studentAnnotations,
  correctAnnotations,
  labels,
  iouThreshold = 0.85,
  enableManualCorrection = false,
  manualCorrections = {},
  maxWidth = 800,
  maxHeight = 600
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  // Load image
  useEffect(() => {
    if (!fileId) return;

    const loadImage = async () => {
      try {
        const imageUrl = await getImageFromFs(fileId);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          imageRef.current = img;
          setImageSize({ width: img.width, height: img.height });
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

  // Check if bbox1 is completely inside bbox2
  const isBboxInside = (bbox1: number[], bbox2: number[]): boolean => {
    const [x1_min, y1_min, w1, h1] = bbox1;
    const [x2_min, y2_min, w2, h2] = bbox2;
    
    const x1_max = x1_min + w1;
    const y1_max = y1_min + h1;
    const x2_max = x2_min + w2;
    const y2_max = y2_min + h2;
    
    // Check if bbox1 is completely inside bbox2
    return x1_min >= x2_min && y1_min >= y2_min && x1_max <= x2_max && y1_max <= y2_max;
  };

  // Calculate IoU between two bounding boxes
  // Format: [x_min, y_min, width, height]
  // Special handling: if one bbox is completely inside the other, use coverage ratio instead
  const calculateIoU = (bbox1: number[], bbox2: number[]): number => {
    if (!bbox1 || !bbox2 || bbox1.length !== 4 || bbox2.length !== 4) {
      console.log('[DEBUG AnnotationViewer] Invalid bbox in calculateIoU:', { bbox1, bbox2 });
      return 0;
    }
    
    const [x1_min, y1_min, w1, h1] = bbox1;
    const [x2_min, y2_min, w2, h2] = bbox2;
    
    // Ensure non-negative dimensions
    if (w1 <= 0 || h1 <= 0 || w2 <= 0 || h2 <= 0) {
      console.log('[DEBUG AnnotationViewer] Invalid bbox dimensions:', { bbox1, bbox2 });
      return 0;
    }
    
    const area1 = w1 * h1;
    const area2 = w2 * h2;
    
    // Check if bbox1 is completely inside bbox2
    const bbox1InsideBbox2 = isBboxInside(bbox1, bbox2);
    // Check if bbox2 is completely inside bbox1
    const bbox2InsideBbox1 = isBboxInside(bbox2, bbox1);
    
    if (bbox1InsideBbox2) {
      // Student annotation is inside correct annotation
      // Use coverage: how much of the correct annotation is covered
      // This is area1 / area2 (student area / correct area)
      const coverage = area1 / area2;
      console.log('[DEBUG AnnotationViewer] bbox1 is inside bbox2, using coverage:', coverage);
      return coverage;
    } else if (bbox2InsideBbox1) {
      // Correct annotation is inside student annotation
      // Use coverage: how much of the student annotation covers the correct one
      // This is area2 / area1 (correct area / student area)
      const coverage = area2 / area1;
      console.log('[DEBUG AnnotationViewer] bbox2 is inside bbox1, using coverage:', coverage);
      return coverage;
    }
    
    // Normal IoU calculation for overlapping boxes
    const x1_max = x1_min + w1;
    const y1_max = y1_min + h1;
    const x2_max = x2_min + w2;
    const y2_max = y2_min + h2;
    
    // Calculate intersection
    const inter_x_min = Math.max(x1_min, x2_min);
    const inter_y_min = Math.max(y1_min, y2_min);
    const inter_x_max = Math.min(x1_max, x2_max);
    const inter_y_max = Math.min(y1_max, y2_max);
    
    if (inter_x_max <= inter_x_min || inter_y_max <= inter_y_min) {
      return 0;
    }
    
    const interArea = (inter_x_max - inter_x_min) * (inter_y_max - inter_y_min);
    
    // Calculate union
    const unionArea = area1 + area2 - interArea;
    
    if (unionArea <= 0) {
      return 0;
    }
    
    const iou = interArea / unionArea;
    return Math.max(0, Math.min(1, iou)); // Ensure between 0 and 1
  };

  // Find matching annotations (for explanation)
  type Match = {
    studentIdx: number;
    correctIdx: number;
    iou: number;
  };

  type BestMatch = {
    correctIdx: number;
    iou: number;
  };

  const findMatches = (): Match[] => {
    // If manual corrections exist, use them instead of automatic matching
    if (enableManualCorrection && Object.keys(manualCorrections).length > 0) {
      const matches: Match[] = [];
      const usedCorrect = new Set<number>();
      
      console.log('[DEBUG AnnotationViewer] Using manual corrections:', manualCorrections);
      
      // For each student annotation, check if it's marked as correct in manual corrections
      studentAnnotations.forEach((studentAnn, studentIdx) => {
        const annotationKey = studentIdx.toString();
        const isManuallyCorrect = manualCorrections[annotationKey] === true;
        
        if (isManuallyCorrect) {
          // Find a matching correct annotation (same category, not yet used)
          let matchedCorrectIdx = -1;
          
          for (let correctIdx = 0; correctIdx < correctAnnotations.length; correctIdx++) {
            if (usedCorrect.has(correctIdx)) continue;
            
            const correctAnn = correctAnnotations[correctIdx];
            if (studentAnn.category_id === correctAnn.category_id) {
              matchedCorrectIdx = correctIdx;
              usedCorrect.add(correctIdx);
              break;
            }
          }
          
          if (matchedCorrectIdx >= 0) {
            // Calculate IoU for display purposes
            const correctAnn = correctAnnotations[matchedCorrectIdx];
            const iou = calculateIoU(studentAnn.bbox, correctAnn.bbox);
            
            matches.push({
              studentIdx,
              correctIdx: matchedCorrectIdx,
              iou: iou
            });
            
            console.log(`[DEBUG AnnotationViewer] Manual match: student[${studentIdx}] <-> correct[${matchedCorrectIdx}], IoU=${iou.toFixed(3)}`);
          }
        }
      });
      
      console.log('[DEBUG AnnotationViewer] Final matches (manual):', matches);
      return matches;
    }
    
    // Automatic matching (original logic)
    const matches: Match[] = [];
    const usedCorrect = new Set<number>();
    
    console.log('[DEBUG AnnotationViewer] Finding matches (automatic):', {
      studentCount: studentAnnotations.length,
      correctCount: correctAnnotations.length,
      iouThreshold,
      studentAnnotations: studentAnnotations.map(a => ({ category_id: a.category_id, bbox: a.bbox })),
      correctAnnotations: correctAnnotations.map(a => ({ category_id: a.category_id, bbox: a.bbox }))
    });
    
    studentAnnotations.forEach((studentAnn, studentIdx) => {
      let bestMatch: BestMatch | null = null;
      let bestIoU = 0;
      
      if (!studentAnn.bbox || studentAnn.bbox.length !== 4) {
        console.log(`[DEBUG AnnotationViewer] Student annotation ${studentIdx} has invalid bbox:`, studentAnn.bbox);
        return;
      }
      
      correctAnnotations.forEach((correctAnn, correctIdx) => {
        // Skip if this correct annotation is already matched
        if (usedCorrect.has(correctIdx)) {
          console.log(`[DEBUG AnnotationViewer] Correct annotation ${correctIdx} already matched, skipping`);
          return;
        }
        
        if (!correctAnn.bbox || correctAnn.bbox.length !== 4) {
          console.log(`[DEBUG AnnotationViewer] Correct annotation ${correctIdx} has invalid bbox:`, correctAnn.bbox);
          return;
        }
        
        // Category must match
        if (studentAnn.category_id !== correctAnn.category_id) {
          console.log(`[DEBUG AnnotationViewer] Category mismatch: student[${studentIdx}].category_id=${studentAnn.category_id} !== correct[${correctIdx}].category_id=${correctAnn.category_id}`);
          return;
        }
        
        const iou = calculateIoU(studentAnn.bbox, correctAnn.bbox);
        console.log(`[DEBUG AnnotationViewer] Comparing student[${studentIdx}] vs correct[${correctIdx}]: IoU=${iou.toFixed(3)}, threshold=${iouThreshold}, category=${studentAnn.category_id}, bbox1=[${studentAnn.bbox.join(', ')}], bbox2=[${correctAnn.bbox.join(', ')}]`);
        
        // Track best IoU even if below threshold (for debugging)
        if (iou > bestIoU) {
          bestIoU = iou;
        }
        
        // Only consider matches that meet the threshold
        if (iou >= iouThreshold) {
          if (bestMatch === null || iou > bestMatch.iou) {
            bestMatch = { correctIdx, iou };
            console.log(`[DEBUG AnnotationViewer] New best match for student[${studentIdx}]: correct[${correctIdx}], IoU=${iou.toFixed(3)}`);
          }
        }
      });
      
      if (bestMatch !== null) {
        // TypeScript guard: bestMatch is definitely BestMatch here
        const matchData: BestMatch = bestMatch;
        const matchCorrectIdx = matchData.correctIdx;
        const matchIou = matchData.iou;
        
        console.log(`[DEBUG AnnotationViewer] ✓ MATCH FOUND: student[${studentIdx}] <-> correct[${matchCorrectIdx}], IoU=${matchIou.toFixed(3)}`);
        
        matches.push({
          studentIdx,
          correctIdx: matchCorrectIdx,
          iou: matchIou
        });
        usedCorrect.add(matchCorrectIdx);
      } else {
        console.log(`[DEBUG AnnotationViewer] ✗ NO MATCH for student[${studentIdx}]: bestIoU=${bestIoU.toFixed(3)} < threshold=${iouThreshold}`);
      }
    });
    
    console.log('[DEBUG AnnotationViewer] Final matches (automatic):', matches);
    return matches;
  };

  const matches = findMatches();

  // Draw annotations on canvas
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current || !imageSize) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / imageSize.width;
    const scaleY = canvas.height / imageSize.height;

    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    };

    // Cores distintas: referência (professor) = vermelho; aluno = verde
    const CORRECT_COLOR = '#F44336';   // vermelho - anotações corretas / professor
    const STUDENT_COLOR = '#4CAF50';   // verde - anotações do aluno
    const STUDENT_UNMATCHED_COLOR = '#8BC34A'; // verde claro tracejado quando sem correspondência

    // Draw correct annotations (referência / professor) — vermelho
    correctAnnotations.forEach((ann) => {
      if (!ann.bbox || ann.bbox.length !== 4) return;
      const [x, y, width, height] = ann.bbox;
      const scaledX = x * scaleX;
      const scaledY = y * scaleY;
      const scaledWidth = width * scaleX;
      const scaledHeight = height * scaleY;
      ctx.strokeStyle = CORRECT_COLOR;
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
      ctx.fillStyle = hexToRgba(CORRECT_COLOR, 0.2);
      ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
      const label = labels[ann.category_id - 1] || `Categoria ${ann.category_id}`;
      ctx.fillStyle = CORRECT_COLOR;
      ctx.font = 'bold 14px Arial';
      ctx.fillText(`Ref: ${label}`, scaledX + 5, scaledY - 5);
    });

    // Draw student annotations — verde (tracejado se não correspondido)
    studentAnnotations.forEach((ann, idx) => {
      if (!ann.bbox || ann.bbox.length !== 4) return;
      const [x, y, width, height] = ann.bbox;
      const scaledX = x * scaleX;
      const scaledY = y * scaleY;
      const scaledWidth = width * scaleX;
      const scaledHeight = height * scaleY;
      const match = matches.find(m => m.studentIdx === idx);
      const isMatched = !!match;
      const color = isMatched ? STUDENT_COLOR : STUDENT_UNMATCHED_COLOR;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(isMatched ? [] : [5, 5]);
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
      ctx.fillStyle = hexToRgba(color, 0.2);
      ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
      const label = labels[ann.category_id - 1] || `Categoria ${ann.category_id}`;
      ctx.fillStyle = color;
      ctx.font = 'bold 14px Arial';
      const labelText = isMatched ? `Aluno: ${label}` : `Aluno: ${label} (?)`;
      ctx.fillText(labelText, scaledX + 5, scaledY + scaledHeight + 18);
      if (match) {
        ctx.font = '12px Arial';
        ctx.fillText(`IoU: ${(match.iou * 100).toFixed(1)}%`, scaledX + 5, scaledY + scaledHeight + 35);
      }
    });
  };

  useEffect(() => {
    if (imageLoaded) {
      drawCanvas();
    }
  }, [imageLoaded, studentAnnotations, correctAnnotations, matches]);

  // Tamanho padrão de visualização (igual ao editor): fit em maxWidth×maxHeight, proporção mantida
  const STANDARD_VIEW_MAX_WIDTH = maxWidth;
  const STANDARD_VIEW_MAX_HEIGHT = maxHeight;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSize) return;

    const scale = Math.min(
      STANDARD_VIEW_MAX_WIDTH / imageSize.width,
      STANDARD_VIEW_MAX_HEIGHT / imageSize.height,
      1
    );
    const canvasWidth = imageSize.width * scale;
    const canvasHeight = imageSize.height * scale;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    if (imageLoaded) {
      drawCanvas();
    }
  }, [imageSize, imageLoaded]);

  if (!fileId) {
    return <div>Nenhuma imagem selecionada</div>;
  }

  return (
    <div className="annotation-viewer">
      <div className="annotation-viewer__canvas-container">
        <canvas
          ref={canvasRef}
          className="annotation-viewer__canvas"
          style={{ border: '1px solid #ddd', borderRadius: '4px' }}
        />
      </div>
      
      <div className="annotation-viewer__legend" style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '20px', height: '20px', border: '2px solid #4caf50', backgroundColor: 'rgba(76, 175, 80, 0.2)' }}></div>
            <span style={{ fontSize: '0.9rem' }}>Anotações do aluno (verde)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '20px', height: '20px', border: '2px solid #f44336', backgroundColor: 'rgba(244, 67, 54, 0.2)' }}></div>
            <span style={{ fontSize: '0.9rem' }}>Anotações corretas (vermelho)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '20px', height: '20px', border: '2px dashed #8bc34a', backgroundColor: 'rgba(139, 195, 74, 0.2)' }}></div>
            <span style={{ fontSize: '0.9rem' }}>Sem correspondência (tracejado)</span>
          </div>
        </div>
      </div>

      <div className="annotation-viewer__explanation" style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
        <h4 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem' }}>Explicação da Avaliação:</h4>
        <div style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
          <p style={{ margin: '0.25rem 0' }}>
            <strong>Critério de correção:</strong> IoU (Intersection over Union) ≥ {(iouThreshold * 100).toFixed(0)}% e mesma categoria.
          </p>
          <p style={{ margin: '0.25rem 0' }}>
            <strong>Anotações do aluno:</strong> {studentAnnotations.length} marcação(ões) em verde.
          </p>
          <p style={{ margin: '0.25rem 0' }}>
            <strong>Anotações corretas:</strong> {correctAnnotations.length} marcação(ões) em vermelho.
          </p>
          <p style={{ margin: '0.25rem 0' }}>
            <strong>Correspondências encontradas:</strong> {matches.length} de {correctAnnotations.length} esperadas.
          </p>
          {matches.length > 0 && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#fff', borderRadius: '4px' }}>
              <strong>Detalhes das correspondências:</strong>
              <ul style={{ margin: '0.25rem 0', paddingLeft: '1.5rem' }}>
                {matches.map((match, idx) => {
                  const studentAnn = studentAnnotations[match.studentIdx];
                  const label = labels[studentAnn.category_id - 1] || `Categoria ${studentAnn.category_id}`;
                  return (
                    <li key={idx} style={{ margin: '0.25rem 0' }}>
                      {label}: IoU = {(match.iou * 100).toFixed(1)}% ✓
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {studentAnnotations.length > matches.length && (
            <p style={{ margin: '0.5rem 0', color: '#f44336' }}>
              ⚠️ {studentAnnotations.length - matches.length} anotação(ões) do aluno não correspondem às corretas.
            </p>
          )}
          {correctAnnotations.length > matches.length && (
            <p style={{ margin: '0.5rem 0', color: '#f44336' }}>
              ⚠️ {correctAnnotations.length - matches.length} anotação(ões) correta(s) não foram marcadas pelo aluno.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnnotationViewer;
