import React, { useEffect, useRef, useState, memo } from 'react';
import { getImageFromFs } from '../../services/GridFsService';

interface ThumbnailProps {
  fileId: string;
  alt?: string;
  onClick?: () => void;
}

const Thumbnail: React.FC<ThumbnailProps> = ({ fileId, alt, onClick }) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setIsVisible(true);
      },
      { rootMargin: '100px', threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const imageUrl = isVisible ? getImageFromFs(fileId) : undefined;

  return (
    <div className="thumbnail" onClick={onClick} ref={containerRef}>
      <div className="thumbnail__backgroud_hover">
        <div className="thumbnail__box_image" onClick={onClick}>
          <img
            src={imageUrl}
            alt={alt}
            className="thumbnail__image"
            loading="lazy"
          />
        </div>
        <div className="thumbnail__actions" />
      </div>
    </div>
  );
};

export default memo(Thumbnail);
