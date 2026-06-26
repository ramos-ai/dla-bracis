import React from "react";
import "./InlineLoader.scss";

interface InlineLoaderProps {
  /** Mensagem exibida ao lado do spinner (default: "Carregando...") */
  message?: string;
}

/**
 * Loader inline para uso em blocos de conteúdo, fallback de Suspense ou botões.
 * Não cobre a página; ocupa apenas o espaço do conteúdo.
 */
const InlineLoader: React.FC<InlineLoaderProps> = ({ message = "Carregando..." }) => {
  return (
    <div className="inline-loader" role="status" aria-live="polite" aria-label={message}>
      <span className="inline-loader__spinner" />
      <span className="inline-loader__message">{message}</span>
    </div>
  );
};

export default InlineLoader;
