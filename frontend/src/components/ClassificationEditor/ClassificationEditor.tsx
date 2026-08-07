import React, { useState, useEffect, useRef, useCallback } from "react";
import { Tag as TagIcon } from "lucide-react";
import { getImageFromFs } from "../../services/GridFsService";
import { AnnotationWorkspace, AnnotationSideSection } from "../dla";
import { cn } from "../../lib/utils";
import { Icon } from "../Icons/Icons";

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
    const ctx = canvas.getContext("2d");
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
    img.crossOrigin = "anonymous";

    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };

    img.onerror = () => {
      console.error("Error loading image:", fileId);
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

  const displayLabels = labels.filter((l) => l !== "Sem rótulo / desconhecido");

  return (
    <AnnotationWorkspace
      className="h-full min-h-0"
      tools={[{ id: "class", icon: TagIcon, label: "Classe" }]}
      activeTool="class"
      onToolChange={() => undefined}
      canvas={
        <div ref={containerRef} className="flex max-h-full max-w-full items-center justify-center">
          {imageError ? (
            <div
              className="flex items-center justify-center rounded-md bg-muted text-sm text-muted-foreground"
              style={{ width: Math.min(VIEW_WIDTH, 720), height: Math.min(VIEW_HEIGHT, 480) }}
            >
              Erro ao carregar imagem
            </div>
          ) : !imageLoaded ? (
            <div
              className="flex items-center justify-center rounded-md bg-muted text-sm text-muted-foreground"
              style={{ width: Math.min(VIEW_WIDTH, 720), height: Math.min(VIEW_HEIGHT, 480) }}
            >
              Carregando imagem…
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              width={VIEW_WIDTH}
              height={VIEW_HEIGHT}
              className="block max-h-full max-w-full rounded-md"
              style={{ userSelect: "none", background: "#111" }}
            />
          )}
        </div>
      }
      fileLabel={fileId.slice(-12)}
      currentIndex={showNavigation ? currentIndex : undefined}
      totalImages={showNavigation ? totalImages : undefined}
      onPrevious={onPrevious}
      onNext={onNext}
      canGoPrevious={canGoPrevious}
      canGoNext={canGoNext}
      isLastImage={isLastImage}
      nextButtonLabel={nextButtonLabel}
      sidePanel={
        <AnnotationSideSection title="Classe da imagem">
          <div className="space-y-1.5">
            {displayLabels.map((label, i) => {
              const isSelected = selectedLabels.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleLabelSelect(label)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs font-medium transition-colors duration-150 disabled:opacity-50",
                    isSelected
                      ? "border-secondary bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground hover:border-secondary/60",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {isSelected && <Icon name="check" size={12} />}
                    {label}
                  </span>
                  <span className="num text-[10px] opacity-70">{i + 1}</span>
                </button>
              );
            })}
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleLabelSelect("Sem rótulo / desconhecido")}
              className={cn(
                "flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs italic transition-colors duration-150 disabled:opacity-50",
                selectedLabels.includes("Sem rótulo / desconhecido")
                  ? "border-secondary bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:border-secondary/60",
              )}
            >
              <span className="flex items-center gap-1.5">
                {selectedLabels.includes("Sem rótulo / desconhecido") && (
                  <Icon name="check" size={12} />
                )}
                Sem rótulo / desconhecido
              </span>
            </button>
          </div>
          <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
            {selectedLabels.length > 0
              ? `Selecionado: ${selectedLabels[0]}`
              : "Selecione uma classe para esta imagem"}
          </p>
        </AnnotationSideSection>
      }
    />
  );
};

export default ClassificationEditor;
