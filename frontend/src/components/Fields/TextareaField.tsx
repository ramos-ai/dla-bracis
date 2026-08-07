import React from "react";

interface TextareaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  name: string;
  errorMessage?: string;
}

const TextareaField: React.FC<TextareaFieldProps> = ({
  label,
  name,
  errorMessage,
  className = "",
  ...props
}) => {
  return (
    <div className={`input-field ${className}`}>
      {label && (
        <label htmlFor={name} className="input-field__label">
          {label}
        </label>
      )}
      <textarea
        id={name}
        name={name}
        className="input-field__input input-field__textarea"
        {...props}
      />
      {errorMessage && (
        <span className="input-field__error">{errorMessage}</span>
      )}
    </div>
  );
};

export default TextareaField;
