import React, { memo } from 'react';
import { getImageFromFs } from '../../services/GridFsService';

interface MediaViewerProps {
  fileId: string;
  /** Limita tamanho da imagem (ex.: classificação no labeller) para não exigir scroll */
  constrainSize?: boolean;
  /** Força um tamanho padrão fixo para a imagem (útil para rotulação) */
  standardSize?: boolean;
}

const MediaViewer: React.FC<MediaViewerProps> = ({ fileId, constrainSize, standardSize }) => {
  const mediaUrl = getImageFromFs(fileId);

  // Standard size for labelling tasks - fixed dimensions
  if (standardSize) {
    return (
      <div className="media-viewer media-viewer--standard" style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        width: '100%',
        minHeight: '400px',
        maxHeight: '500px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        <div className="media-viewer__content" style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <img
            src={mediaUrl}
            className="media-viewer__image"
            style={{ 
              width: '100%',
              height: '450px',
              objectFit: 'contain',
              borderRadius: '8px'
            }}
            alt=""
          />
        </div>
      </div>
    );
  }

  return (
    <div className="media-viewer" style={constrainSize ? { maxHeight: '70vh', overflow: 'auto', display: 'flex', justifyContent: 'center' } : undefined}>
      <div className="media-viewer__content">
        <div className="media-viewer__box_image">
          <img
            src={mediaUrl}
            className="media-viewer__image"
            style={constrainSize ? { maxWidth: '100%', maxHeight: '70vh', width: 'auto', height: 'auto', objectFit: 'contain' } : undefined}
            alt=""
          />
        </div>
      </div>
    </div>
  );
};

export default memo(MediaViewer);
