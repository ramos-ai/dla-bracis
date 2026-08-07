import {
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export type AnnotationToolDef = {
  id: string;
  icon: LucideIcon;
  label: string;
};

type RailButtonProps = {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
};

function RailButton({ title, active, onClick, children, disabled }: RailButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-9 place-items-center rounded-md transition-colors duration-150 disabled:opacity-40",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Studio-style annotation chrome: vertical tool rail · canvas · right panel.
 * Fits one viewport when used under AppShell workspace mode.
 */
export function AnnotationWorkspace({
  tools,
  activeTool,
  onToolChange,
  railExtras,
  canvas,
  fileLabel,
  currentIndex,
  totalImages,
  onPrevious,
  onNext,
  canGoPrevious = false,
  canGoNext = false,
  isLastImage = false,
  nextButtonLabel,
  sidePanel,
  className,
}: {
  tools: AnnotationToolDef[];
  activeTool: string;
  onToolChange: (id: string) => void;
  railExtras?: ReactNode;
  canvas: ReactNode;
  fileLabel?: string;
  currentIndex?: number;
  totalImages?: number;
  onPrevious?: () => void;
  onNext?: () => void;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  isLastImage?: boolean;
  nextButtonLabel?: string;
  sidePanel?: ReactNode;
  className?: string;
}) {
  const showNav =
    typeof currentIndex === "number" &&
    typeof totalImages === "number" &&
    totalImages > 0 &&
    (onPrevious || onNext);

  return (
    <div
      className={cn(
        "annotation-workspace grid h-full min-h-0 w-full grid-cols-1 gap-3",
        "lg:grid-cols-[56px_minmax(0,1fr)_260px] lg:grid-rows-1",
        className,
      )}
      style={{ display: "grid" }}
    >
      {/* Tool rail */}
      <aside className="flex w-full shrink-0 gap-1.5 self-start rounded-lg border border-border bg-surface p-1.5 lg:w-auto lg:flex-col">
        {tools.map((tl) => (
          <RailButton
            key={tl.id}
            title={tl.label}
            active={activeTool === tl.id}
            onClick={() => onToolChange(tl.id)}
          >
            <tl.icon className="size-4" strokeWidth={1.75} />
          </RailButton>
        ))}
        {railExtras && (
          <>
            <span className="my-1 hidden h-px bg-border lg:block" />
            <span className="mx-1 block h-full w-px bg-border lg:hidden" />
            {railExtras}
          </>
        )}
      </aside>

      {/* Canvas column */}
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface lg:min-h-0">
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-2">
          {canvas}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span className="num truncate">{fileLabel || "—"}</span>
          {showNav && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onPrevious}
                disabled={!canGoPrevious}
                className="grid size-7 place-items-center rounded-md border border-border transition-colors duration-150 hover:border-secondary disabled:opacity-40"
                aria-label="Anterior"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="num">
                {currentIndex! + 1} / {totalImages}
              </span>
              <button
                type="button"
                onClick={onNext}
                disabled={!canGoNext && !isLastImage}
                className="grid size-7 place-items-center rounded-md border border-border transition-colors duration-150 hover:border-secondary disabled:opacity-40"
                aria-label={isLastImage ? nextButtonLabel || "Finalizar" : "Próxima"}
              >
                {isLastImage ? (
                  <span className="text-[10px] font-bold">OK</span>
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto lg:max-h-full">
        {sidePanel}
      </div>
    </div>
  );
}

export function AnnotationRailButton(props: RailButtonProps) {
  return <RailButton {...props} />;
}

export function AnnotationSideSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface p-4", className)}>
      <p className="rule-label">{title}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}
