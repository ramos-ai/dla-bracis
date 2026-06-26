import React, { useRef, useEffect, useState } from 'react';
import { getImageFromFs } from '../../services/GridFsService';
import { Icon } from '../Icons/Icons';

interface ClassificationViewerProps {
  fileId: string;
  studentLabels: string[];
  correctLabels: string[];
  maxWidth?: number;
  maxHeight?: number;
}

const ClassificationViewer: React.FC<ClassificationViewerProps> = ({
  fileId,
  studentLabels,
  correctLabels,
  maxWidth = 300,
  maxHeight = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!fileId) return;

    const loadImage = async () => {
      try {
        const imageUrl = getImageFromFs(fileId);
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

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current || !imageSize) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSize) return;

    const scale = Math.min(
      maxWidth / imageSize.width,
      maxHeight / imageSize.height,
      1
    );
    const canvasWidth = imageSize.width * scale;
    const canvasHeight = imageSize.height * scale;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    if (imageLoaded) {
      drawCanvas();
    }
  }, [imageSize, imageLoaded, maxWidth, maxHeight]);

  const studentLabel = studentLabels.length > 0 ? studentLabels[0] : null;
  const correctLabel = correctLabels.length > 0 ? correctLabels[0] : null;

  const isCorrect = studentLabel !== null && correctLabel !== null && 
    studentLabels.some(sl => correctLabels.includes(sl));

  if (!fileId) {
    return <div>Nenhuma imagem selecionada</div>;
  }

  return (
    <div style={{ 
      border: '1px solid #e0e0e0', 
      borderRadius: '8px', 
      padding: '0.75rem',
      backgroundColor: '#fff',
    }}>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <canvas
          ref={canvasRef}
          style={{ 
            border: '1px solid #ddd', 
            borderRadius: '4px',
            maxWidth: '100%',
          }}
        />
        
        <div style={{ 
          width: '100%',
          padding: '0.5rem',
          backgroundColor: isCorrect ? '#e8f5e9' : '#ffebee',
          borderRadius: '4px',
          textAlign: 'center',
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: '0.5rem',
            marginBottom: '0.25rem',
          }}>
            {isCorrect ? (
              <Icon name="check" size={20} />
            ) : (
              <Icon name="close" size={20} />
            )}
            <span style={{ 
              fontWeight: 600, 
              color: isCorrect ? '#2e7d32' : '#c62828',
              fontSize: '0.9rem',
            }}>
              {isCorrect ? 'Correto' : 'Incorreto'}
            </span>
          </div>
          
          <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
            <div>
              <strong>Sua resposta:</strong>{' '}
              <span style={{ color: studentLabel ? '#333' : '#999' }}>
                {studentLabel || 'Não respondido'}
              </span>
            </div>
            <div>
              <strong>Resposta correta:</strong>{' '}
              <span style={{ color: '#333' }}>
                {correctLabel || 'Não definido'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassificationViewer;
