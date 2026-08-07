import React from 'react';

interface LabelSelectorProps {
  labels: string[];
  selectedLabels: string[];
  onLabelChange: (label: string) => void;
  disabled?: boolean;
}

const LabelSelector: React.FC<LabelSelectorProps> = ({
  labels,
  selectedLabels,
  onLabelChange,
  disabled = false,
}) => {
  return (
    <div className="label-selector">
      <h3 className="label-selector__title">Selecione um rótulo (ou Sem rótulo):</h3>
      <div
        className="label-selector__options"
        role="radiogroup"
        aria-label="Selecione um rótulo"
      >
        {labels.filter((l) => l !== 'Sem rótulo / desconhecido').map((label, index) => (
          <label
            key={index}
            className={`label-selector__option ${selectedLabels.includes(label) ? 'label-selector__option--selected' : ''}`}
          >
            <input
              type="radio"
              name="exercise-label"
              value={label}
              checked={selectedLabels.includes(label)}
              onChange={() => onLabelChange(label)}
              disabled={disabled}
            />
            <span>{label}</span>
          </label>
        ))}
        <label
          className={`label-selector__option ${selectedLabels.includes('Sem rótulo / desconhecido') ? 'label-selector__option--selected' : ''}`}
        >
          <input
            type="radio"
            name="exercise-label"
            value="Sem rótulo / desconhecido"
            checked={selectedLabels.includes('Sem rótulo / desconhecido')}
            onChange={() => onLabelChange('Sem rótulo / desconhecido')}
            disabled={disabled}
          />
          <span>Sem rótulo / desconhecido</span>
        </label>
      </div>
    </div>
  );
};

export default React.memo(LabelSelector);
