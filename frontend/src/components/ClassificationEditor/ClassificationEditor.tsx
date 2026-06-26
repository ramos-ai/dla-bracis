import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '../Icons/Icons';
import { getImageFromFs } from '../../services/GridFsService';

const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 540;

interface ClassificationEditorProps {
  fileId: string;
  labels: string[];
  selectedLabels: string[];
  onLabelChange: (labels: string[]) => void;
  onSave: (labels: string[]) => Promise<void>;
  showNavigation?: boolean;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  isLastImage?: boolean;
  nextButtonLabel?: string;
  currentIndex?: number;
  totalImages?: number;
  isLoading?: boolean;
}

const ClassificationEditor: React.FC<ClassificationEditorProps> = ({
  fileId,
  labels,
  selectedLabels,
  onLabelChange,
  onSave,
  showNavigation = false,
  canGoPrevious = false,
  canGoNext = false,
  onPrevious,
  onNext,
  isLastImage = false,
  nextButtonLabel,
  currentIndex,
  totalImages,
  isLoading = false,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = VIEW_WIDTH;
    canvas.height = VIEW_HEIGHT;

    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    const scaleX = VIEW_WIDTH / img.naturalWidth;
    const scaleY = VIEW_HEIGHT / img.naturalHeight;
    const scale = Math.min(scaleX, scaleY);

    const imgW = img.naturalWidth * scale;
    const imgH = img.naturalHeight * scale;
    const offsetX = (VIEW_WIDTH - imgW) / 2;
    const offsetY = (VIEW_HEIGHT - imgH) / 2;

    ctx.drawImage(img, offsetX, offsetY, imgW, imgH);
  }, []);

  useEffect(() => {
    if (!fileId) return;
    
    setImageLoaded(false);
    setImageError(false);
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    
    img.onerror = () => {
      console.error('Error loading image:', fileId);
      setImageError(true);
    };
    
    img.src = getImageFromFs(fileId);
    
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [fileId]);

  useEffect(() => {
    if (imageLoaded) drawCanvas();
  }, [imageLoaded, drawCanvas]);

  const handleLabelSelect = async (label: string) => {
    const newLabels = [label];
    onLabelChange(newLabels);
    await onSave(newLabels);
  };

  const handlePrevious = () => {
    onPrevious?.();
  };

  const handleNext = () => {
    onNext?.();
  };

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
    <div className="classification-editor" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Toolbar */}
      <div style={{ flexShrink: 0, padding: '0.5rem 1rem', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: '8px 8px 0 0', marginBottom: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', rowGap: '0.5rem', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#666' }}>
            {selectedLabels.length > 0 ? (
              <span style={{ color: '#2e7d32' }}>
                Rótulo: {selectedLabels[0]}
              </span>
            ) : (
              <span style={{ color: '#666' }}>Nenhum rótulo selecionado</span>
            )}
          </div>
          {showNavigation && currentIndex !== undefined && totalImages !== undefined && (
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#1976d2' }}>
              Imagem {currentIndex + 1}/{totalImages}
            </span>
          )}
        </div>
      </div>

      {/* Área principal: setas + canvas */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem', width: '100%' }}>
        {/* Seta esquerda */}
        {showNavigation && (
          <button
            onClick={handlePrevious}
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
          className="classification-editor__canvas-container"
          style={{
            flexShrink: 0,
            padding: '0.5rem',
            backgroundColor: '#fafafa',
            border: '1px solid #e0e0e0',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
          }}
        >
          {imageError ? (
            <div style={{ width: VIEW_WIDTH, height: VIEW_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8e8e8', borderRadius: '8px', border: '2px solid #ddd' }}>
              <span style={{ color: '#999' }}>Erro ao carregar imagem</span>
            </div>
          ) : !imageLoaded ? (
            <div style={{ width: VIEW_WIDTH, height: VIEW_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8e8e8', borderRadius: '8px', border: '2px solid #ddd' }}>
              <span style={{ color: '#666', fontSize: '0.9rem' }}>Carregando imagem...</span>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              width={VIEW_WIDTH}
              height={VIEW_HEIGHT}
              style={{
                border: '2px solid #ddd',
                borderRadius: '8px',
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
            onClick={handleNext}
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

      {/* Lista de rótulos como tags */}
      <div style={{ marginTop: '0.75rem', maxHeight: '150px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#333' }}>Rótulos ({labels.length})</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {labels.filter((l) => l !== 'Sem rótulo / desconhecido').map((label, idx) => {
            const isSelected = selectedLabels.includes(label);
            return (
              <button
                key={idx}
                onClick={() => handleLabelSelect(label)}
                type="button"
                disabled={isLoading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: '16px',
                  border: isSelected ? '2px solid #1976d2' : '1px solid #ddd',
                  background: isSelected ? '#e3f2fd' : '#fff',
                  color: isSelected ? '#1976d2' : '#333',
                  fontWeight: isSelected ? 600 : 400,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isSelected && <Icon name="check" size={12} />}
                {label}
              </button>
            );
          })}
          <button
            onClick={() => handleLabelSelect('Sem rótulo / desconhecido')}
            type="button"
            disabled={isLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              borderRadius: '16px',
              border: selectedLabels.includes('Sem rótulo / desconhecido') ? '2px solid #1976d2' : '1px solid #ddd',
              background: selectedLabels.includes('Sem rótulo / desconhecido') ? '#e3f2fd' : '#fff',
              color: selectedLabels.includes('Sem rótulo / desconhecido') ? '#1976d2' : '#666',
              fontWeight: selectedLabels.includes('Sem rótulo / desconhecido') ? 600 : 400,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontStyle: 'italic',
              transition: 'all 0.15s',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {selectedLabels.includes('Sem rótulo / desconhecido') && <Icon name="check" size={12} />}
            Sem rótulo / desconhecido
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClassificationEditor;
