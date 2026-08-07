import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "../../lib/utils";

export type DlaModalSize = "sm" | "md" | "lg" | "xl" | "xxl";

const sizeClass: Record<DlaModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-[1200px]",
  xxl: "max-w-[1400px]",
};

/**
 * Studio-styled modal. Prefer this for new UI.
 * Compatible with legacy callers via `isOpen` alias.
 */
export function DlaModal({
  open,
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = "lg",
  closeOnBackdropClick = true,
  footer,
}: {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  size?: DlaModalSize;
  closeOnBackdropClick?: boolean;
  footer?: ReactNode;
}) {
  const visible = open ?? isOpen ?? false;

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[1050] flex items-start justify-center overflow-y-auto bg-foreground/40 p-3 backdrop-blur-[2px] md:p-6"
    >
      <button
        aria-label="fechar"
        tabIndex={-1}
        type="button"
        onClick={() => {
          if (closeOnBackdropClick) onClose();
        }}
        className="absolute inset-0 cursor-default"
      />
      <div
        className={cn(
          "relative my-auto w-full rounded-lg border border-border bg-surface shadow-lg",
          sizeClass[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate font-display text-sm font-semibold">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors duration-150 hover:border-secondary hover:text-foreground"
            aria-label="fechar"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </header>
        <div className="p-5">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Alias matching Studio export name */
export const Modal = DlaModal;
