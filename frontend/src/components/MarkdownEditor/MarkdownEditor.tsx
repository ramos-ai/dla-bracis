import React, { useRef, useCallback } from 'react';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import { uploadContentImage } from '../../services/GridFsService';
import { baseURL } from '../../services/api';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  minHeight?: number;
  'data-color-mode'?: 'light' | 'dark';
}

/** Resolve image URL for markdown: relative paths use API origin so images load (e.g. when API is on another port/domain). */
export const resolveContentImageUrl = (src: string): string => {
  if (!src) return src;
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return src;
  }
  const origin = baseURL.startsWith('http') ? new URL(baseURL).origin : window.location.origin;
  return src.startsWith('/') ? `${origin}${src}` : `${origin}/${src}`;
};

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder = 'Escreva em Markdown. Você pode colar imagens ou usar o botão para inserir.',
  label = 'Conteúdo',
  minHeight = 280,
  'data-color-mode': dataColorMode = 'light',
}) => {
  const { alert: showAlert } = useAlertConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const insertImageMarkdown = useCallback(
    (url: string, alt = 'imagem') => {
      const markdown = `\n![${alt}](${url})\n`;
      onChange(value + markdown);
    },
    [value, onChange]
  );

  const handleUploadImage = useCallback(
    async (file: File) => {
      try {
        const { url } = await uploadContentImage(file);
        insertImageMarkdown(url);
      } catch (err) {
        console.error('Erro ao enviar imagem:', err);
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Falha ao enviar imagem.';
        showAlert(msg);
      }
    },
    [insertImageMarkdown]
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.files;
      if (!items?.length) return;
      const file = items[0];
      if (!file.type.startsWith('image/')) return;
      e.preventDefault();
      handleUploadImage(file);
    },
    [handleUploadImage]
  );

  const onImageButtonClick = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleUploadImage(file);
    }
    e.target.value = '';
  };

  return (
    <div className="markdown-editor-field" onPaste={onPaste}>
      {label && (
        <label className="markdown-editor-field__label" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
          {label}
        </label>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onImageButtonClick}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.875rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: '#f5f5f5',
              cursor: 'pointer',
            }}
          >
            Inserir imagem
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
          <span style={{ fontSize: '0.8rem', color: '#666' }}>
            Ou cole uma imagem (Ctrl+V) no editor.
          </span>
        </div>
        <div className="markdown-editor-field__editor" data-color-mode={dataColorMode} style={{ minHeight: `${minHeight}px`, width: '100%' }}>
          <MDEditor
            value={value}
            onChange={(v) => onChange(v ?? '')}
            preview="live"
            height={minHeight}
            visibleDragbar={false}
            textareaProps={{ placeholder }}
          />
        </div>
      </div>
    </div>
  );
};

export default MarkdownEditor;
