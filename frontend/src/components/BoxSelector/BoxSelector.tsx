import React from 'react';
import { Icon } from '../Icons/Icons';

interface BoxSelectorProps {
    id: string,
    onSelect: (value: number | string) => void,
    selected: boolean,
    children: React.ReactNode,
}

const BoxSelector: React.FC<BoxSelectorProps> = ({
  id,
  onSelect,
  selected,
  children
}) => {
  return (
    <div 
      className={`box-selector ${selected ? 'box-selector--selected' : ''}`} 
      onClick={() => onSelect(id)}
    >
      <div className="box-selector__checkbox">
        {selected && <Icon name="check" size={12} />}
      </div>
      <div className="box-selector__content">
        {children}
      </div>
    </div>
  );
};

export default BoxSelector;
