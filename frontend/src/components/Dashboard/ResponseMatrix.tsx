import React, { useMemo } from 'react';

interface ResponseMatrixProps {
  labels: string[];
  matrix: number[][];
  total: number;
}

const ResponseMatrix: React.FC<ResponseMatrixProps> = ({ labels, matrix }) => {
  const { colorScale } = useMemo(() => {
    let max = 0;
    matrix.forEach(row => {
      row.forEach(val => {
        if (val > max) max = val;
      });
    });
    return {
      maxValue: max,
      colorScale: (value: number, isDiagonal: boolean) => {
        if (value === 0) return 'transparent';
        const intensity = max > 0 ? value / max : 0;
        if (isDiagonal) {
          const r = Math.round(31 + (15 - 31) * intensity);
          const g = Math.round(122 + (122 - 122) * intensity);
          const b = Math.round(140 + (107 - 140) * intensity);
          return `rgba(${r}, ${g}, ${b}, ${0.3 + intensity * 0.7})`;
        } else {
          const r = Math.round(196 + (196 - 196) * intensity);
          const g = Math.round(69 + (69 - 69) * intensity);
          const b = Math.round(54 + (54 - 54) * intensity);
          return `rgba(${r}, ${g}, ${b}, ${0.2 + intensity * 0.6})`;
        }
      }
    };
  }, [matrix]);

  if (!labels.length || !matrix.length) {
    return (
      <div className="confusion-matrix confusion-matrix--empty">
        <p>Sem dados de classificação disponíveis</p>
      </div>
    );
  }

  const truncateLabel = (label: string, maxLen: number = 12) => {
    if (label.length <= maxLen) return label;
    return label.substring(0, maxLen - 2) + '...';
  };

  return (
    <div className="confusion-matrix">
      <div className="confusion-matrix__container">
        <div className="confusion-matrix__y-label">
          <span>Esperado (Gabarito)</span>
        </div>
        <div className="confusion-matrix__grid-wrapper">
          <div className="confusion-matrix__header">
            <div className="confusion-matrix__corner" />
            {labels.map((label, idx) => (
              <div key={idx} className="confusion-matrix__header-cell" title={label}>
                {truncateLabel(label)}
              </div>
            ))}
          </div>
          <div className="confusion-matrix__body">
            {matrix.map((row, rowIdx) => (
              <div key={rowIdx} className="confusion-matrix__row">
                <div className="confusion-matrix__row-label" title={labels[rowIdx]}>
                  {truncateLabel(labels[rowIdx])}
                </div>
                {row.map((value, colIdx) => {
                  const isDiagonal = rowIdx === colIdx;
                  const bgColor = colorScale(value, isDiagonal);
                  return (
                    <div
                      key={colIdx}
                      className={`confusion-matrix__cell ${isDiagonal ? 'confusion-matrix__cell--diagonal' : ''}`}
                      style={{ backgroundColor: bgColor }}
                      title={`Esperado: ${labels[rowIdx]}, Resposta: ${labels[colIdx]}, Contagem: ${value}`}
                    >
                      <span className={value > 0 ? 'confusion-matrix__value' : 'confusion-matrix__value--zero'}>
                        {value}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="confusion-matrix__x-label">
            <span>Resposta do Aluno</span>
          </div>
        </div>
      </div>
      <div className="confusion-matrix__legend">
        <div className="confusion-matrix__legend-item">
          <span className="confusion-matrix__legend-color confusion-matrix__legend-color--correct" />
          <span>Correspondências (diagonal)</span>
        </div>
        <div className="confusion-matrix__legend-item">
          <span className="confusion-matrix__legend-color confusion-matrix__legend-color--error" />
          <span>Divergências</span>
        </div>
      </div>
    </div>
  );
};

export default ResponseMatrix;
