import { X } from "lucide-react";
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { cn } from "../../lib/utils";

type ModalSize = "sm" | "md" | "lg" | "xl" | "xxl";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: ModalSize;
  closeOnBackdropClick?: boolean;
}

const sizeClass: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-[1200px]",
  xxl: "max-w-[1400px]",
};

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  closeOnBackdropClick = true,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || "Dialog"}
      className="fixed inset-0 z-[1050] flex items-start justify-center overflow-y-auto bg-foreground/40 p-3 backdrop-blur-[2px] md:p-6"
    >
      <button
        type="button"
        aria-label="fechar"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (closeOnBackdropClick) onClose();
        }}
      />
      <div
        className={cn(
          "relative my-auto w-full rounded-lg border border-border bg-surface shadow-lg",
          sizeClass[size],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
          {title ? (
            <h3 className="truncate font-display text-sm font-semibold text-foreground">{title}</h3>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="grid size-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors duration-150 hover:border-secondary hover:text-foreground"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
