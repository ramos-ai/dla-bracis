import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import {
  ExerciseProps,
  getExercisesById,
} from "../../services/ExercisesService";
import ExerciseCarousel from "../../components/ExerciseCarousel/ExerciseCarousel";
import { getDatasetById } from "../../services/datasetsService";
import { getUser } from "../../services/AuthService";
import InlineLoader from "../../components/InlineLoader/InlineLoader";

const ResolveExercise: React.FC = () => {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const navigate = useNavigate();
  const [exercise, setExercise] = useState<ExerciseProps | null>(null);
  const [taskType, setTaskType] = useState<"classification" | "detection" | "segmentation">(
    "classification",
  );
  const [teacherName, setTeacherName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciseId) {
      setLoading(false);
      setError("Exercício não encontrado.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const ex = await getExercisesById(exerciseId);
        if (cancelled) return;
        setExercise(ex);

        try {
          const dataset = await getDatasetById(ex.dataset);
          const type = dataset.task_type || "classification";
          if (type === "classification" || type === "detection" || type === "segmentation") {
            setTaskType(type);
          }
        } catch {
          /* keep default */
        }

        if (ex.user_id) {
          try {
            const teacher = await getUser(ex.user_id);
            if (!cancelled) setTeacherName(teacher?.name || "");
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Não foi possível carregar o exercício.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  if (loading) {
    return <InlineLoader message="Carregando exercício…" />;
  }

  if (error || !exercise?._id) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">{error || "Exercício não encontrado."}</p>
        <Link to="/exercises/resolution" className="text-xs font-semibold text-secondary hover:underline">
          Voltar aos exercícios
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/exercises/resolution")}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Exercícios
        </button>
        <span className="text-xs text-muted-foreground">·</span>
        <h1 className="truncate font-display text-sm font-semibold tracking-tight">
          {exercise.title}
        </h1>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ExerciseCarousel
          labelledMedias={exercise.supervised_practice || []}
          unlabelledMedias={exercise.unsupervised_practice || []}
          didaticDetailing={exercise.didactic_detailing}
          datasetId={exercise.dataset}
          exerciseId={exercise._id}
          taskType={taskType}
          onComplete={() => navigate("/exercises/resolution")}
          iouThreshold={exercise.iou_threshold ?? 0.85}
          segmentationIoUThreshold={exercise.segmentation_iou_threshold ?? 0.75}
          segmentationScoreMode={exercise.segmentation_score_mode ?? "recall"}
          teacherName={teacherName}
        />
      </div>
    </div>
  );
};

export default ResolveExercise;
