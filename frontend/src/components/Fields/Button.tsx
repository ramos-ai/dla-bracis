import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}

const Button: React.FC <ButtonProps> = ({
  children,
  variant = "primary",
  className,
  ...props
}) => {
  return (
    <button className={`btn btn--${variant}${className ? ` ${className}` : ''}`} {...props}>
      {children}
    </button>
  );
}

export default Button;
/* Exemplos de uso:
<Button onClick={() => console.log('clicou')}>
  Salvar Dataset
</Button>

<Button variant="secondary">
  Cancelar
</Button>

<Button variant="danger">
  Deletar
</Button>
*/
