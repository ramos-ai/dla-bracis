import React, { useState } from "react";

interface SelectFieldProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
  errorMessage?: string;
}

const SelectField: React.FC <SelectFieldProps> = ({
  label,
  name,
  options,
  required,
  errorMessage = "Este campo é obrigatório",
  ...props
}) => {
  const [touched, setTouched] = useState(false);

  const showError = required && touched && !props.value;

  return (
    <div className={`select-field ${showError ? "select-field--error" : ""}`}>
      <label htmlFor={name} className="select-field__label">
        {label} {required && "*"}
      </label>
      <select
        id={name}
        name={name}
        className="select-field__select"
        onBlur={() => setTouched(true)}
        {...props}
      >
        <option value="">Selecione uma opção</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {showError && <span className="select-field__error">{errorMessage}</span>}
    </div>
  );
}

export default SelectField;
/*
Exemplo de uso:
 <SelectField
    label="Visibilidade"
    name="visibility"
    value={dataset?.visibility}
    required
    errorMessage="Escolha uma das opções"
    onChange={(e) =>
      setDataset((prev) => ({
        ...prev!,
        visibility: e.target.value,
      }))
    }
    options={[
      { value: 'public', label: 'Público' },
      { value: 'private', label: 'Privado' },
    ]}
  />

*/
