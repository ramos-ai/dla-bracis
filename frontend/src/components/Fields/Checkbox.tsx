import React from 'react';

interface CheckboxFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

const CheckboxField: React.FC <CheckboxFieldProps> = ({
  label,
  id,
  checked,
  onChange,
  ...rest
}) => {
  const htmlId = id ?? `chk-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <label className="checkbox">
      <input
        id={htmlId}
        type="checkbox"
        className="checkbox__input"
        checked={checked}
        onChange={onChange}
        {...rest}
      />
      <span className="checkbox__custom" />
      <span className="checkbox__label">{label}</span>
    </label>
  );
}

export default CheckboxField;