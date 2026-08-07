import React from "react";

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
}

const InputField: React.FC <InputFieldProps> = ({
  label, name, ...props
}) => {
  return (
    <div className="input-field">
      <label htmlFor={name} className="input-field__label">
        {label}
      </label>
      <input id={name} name={name} className="input-field__input" {...props} />
    </div>
  );
}

export default InputField;