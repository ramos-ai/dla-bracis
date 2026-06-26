import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { resolveContentImageUrl } from '../MarkdownEditor/MarkdownEditor';

interface MarkdownViewerProps {
  content: string;
  /** Max height for scroll (e.g. "60vh" or "400px"). When set, content is scrollable. */
  maxHeight?: string;
  className?: string;
}

const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  maxHeight = '60vh',
  className = '',
}) => {
  const wrapperStyle: React.CSSProperties = maxHeight
    ? { maxHeight, overflowY: 'auto', paddingRight: '0.5rem' }
    : {};

  return (
    <div
      className={`markdown-viewer ${className}`}
      style={wrapperStyle}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt, ...props }) => (
            <img
              src={src ? resolveContentImageUrl(src) : undefined}
              alt={alt ?? ''}
              {...props}
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          ),
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownViewer;
