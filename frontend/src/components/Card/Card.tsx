import React, { memo } from 'react';

interface CardProps {
  title: string;
  description: string | React.ReactNode;
  footer?: string | React.ReactNode;
  onClick?: () => void;
  cardStyle?: string;
}

const Card: React.FC<CardProps> = ({
  title,
  description,
  footer,
  onClick,
  cardStyle = "card card--purple",
}) => {
  return (
    <div className={cardStyle} onClick={onClick}>
      <h3 className="card__title">{title}</h3>
      {typeof description === 'string' ? (
        <p className="card__description">{description}</p>
      ) : (
        <div className="card__description">{description}</div>
      )}
      {footer && <div className="card__footer">{footer}</div>}
    </div>
  );
};

export default memo(Card);