import React, { useState, useEffect } from 'react';
import Button from '../Fields/Button';
import { useAlertConfirm } from '../../contexts/AlertConfirmContext';
import './ManualCorrection.scss';

interface COCOAnnotation {
  category_id: number;
  segmentation: number[][];
  area: number;
  bbox: number[];
  iscrowd: number;
}

interface ManualCorrectionProps {
  studentAnnotations: COCOAnnotation[];
  labels: string[];
  initialCorrections?: Record<string, boolean>; // { annotationIdx: true/false }
  unmatchedIndices?: number[]; // Original indices of unmatched annotations
  onSave: (corrections: Record<string, boolean>) => Promise<void>;
  onCancel?: () => void;
}

const ManualCorrection: React.FC<ManualCorrectionProps> = ({
  studentAnnotations,
  labels,
  initialCorrections = {},
  unmatchedIndices,
  onSave,
  onCancel
}) => {
  const { alert: showAlert } = useAlertConfirm();
  const [corrections, setCorrections] = useState<Record<string, boolean>>(initialCorrections);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCorrections(initialCorrections);
  }, [initialCorrections]);

  const handleToggle = (originalIdx: number) => {
    setCorrections(prev => ({
      ...prev,
      [originalIdx.toString()]: !prev[originalIdx.toString()]
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(corrections);
    } catch (error) {
      console.error('Error saving manual correction:', error);
      showAlert('Erro ao salvar correção manual');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setCorrections(initialCorrections);
    if (onCancel) {
      onCancel();
    }
  };

  if (studentAnnotations.length === 0) {
    return null;
  }

  return (
    <div className="manual-correction">
      <h4 className="manual-correction__title">Re-Correção Manual</h4>
      <p className="manual-correction__description">
        Estas anotações foram marcadas como incorretas pelo sistema (IoU abaixo do limiar).
        Marque como corretas as que você considera válidas:
      </p>
      
      <div className="manual-correction__list">
        {studentAnnotations.map((ann, idx) => {
          // Use the original index if provided, otherwise use the current index
          const originalIdx = unmatchedIndices ? unmatchedIndices[idx] : idx;
          const annotationKey = originalIdx.toString();
          const isCorrect = corrections[annotationKey] ?? false;
          const label = labels[ann.category_id - 1] || `Categoria ${ann.category_id}`;
          
          return (
            <div key={originalIdx} className="manual-correction__item">
              <label className="manual-correction__label">
                <input
                  type="checkbox"
                  checked={isCorrect}
                  onChange={() => handleToggle(originalIdx)}
                  className="manual-correction__checkbox"
                />
                <span className={`manual-correction__status ${isCorrect ? 'manual-correction__status--correct' : 'manual-correction__status--wrong'}`}>
                  {isCorrect ? '✓ Correto' : '✗ Incorreto'}
                </span>
                <span className="manual-correction__info">
                  Anotação {originalIdx + 1}: {label} (bbox: [{ann.bbox[0].toFixed(0)}, {ann.bbox[1].toFixed(0)}, {ann.bbox[2].toFixed(0)}, {ann.bbox[3].toFixed(0)}])
                </span>
              </label>
            </div>
          );
        })}
      </div>

      <div className="manual-correction__actions">
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="primary"
        >
          {saving ? 'Salvando...' : 'Salvar Correção'}
        </Button>
        {onCancel && (
          <Button
            onClick={handleCancel}
            disabled={saving}
            variant="secondary"
          >
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
};

export default ManualCorrection;
