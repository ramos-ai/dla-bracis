import React from "react";

// --- Componente DateField ---
// Este é o componente que você pediu, seguindo o padrão do seu InputField.

interface DateFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
}

const DateField: React.FC <DateFieldProps> = ({
  label, name, ...props
}) => {
  return (
    <div className="input-field">
      <label htmlFor={name} className="input-field__label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="date"
        className="input-field__input"
        {...props}
      />
    </div>
  );
}

export default DateField;