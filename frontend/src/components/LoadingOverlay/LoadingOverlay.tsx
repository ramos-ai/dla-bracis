import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useLayout } from "../../contexts/LayoutContext";
import "./LoadingOverlay.scss";

interface LoadingOverlayProps {
  /** Mensagem exibida abaixo do spinner (default: "Carregando...") */
  message?: string;
}

/**
 * Overlay de carregamento, centralizado. Com sidebar visível, cobre só a área de
 * conteúdo (não a sidebar) para evitar piscada quando o loading some.
 */
const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = "Carregando..." }) => {
  const { sidebarWidth } = useLayout();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const overlay = (
    <div
      className="loading-overlay"
      role="status"
      aria-live="polite"
      aria-label={message}
      style={
        sidebarWidth > 0
          ? { left: sidebarWidth, width: `calc(100vw - ${sidebarWidth}px)` }
          : undefined
      }
    >
      <div className="loading-overlay__inner">
        <div className="loading-overlay__spinner" />
        <p className="loading-overlay__message">{message}</p>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

export default LoadingOverlay;
