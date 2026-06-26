import React from 'react';

interface LabelPerformanceData {
  label: string;
  score: number;
  total: number;
  correct: number;
}

interface LabelPerformanceProps {
  data: LabelPerformanceData[];
}

const LabelPerformance: React.FC<LabelPerformanceProps> = ({ data }) => {
  if (!data.length) {
    return (
      <div className="label-performance label-performance--empty">
        <p>Sem dados de desempenho por rótulo disponíveis</p>
      </div>
    );
  }

  const sortedData = [...data].sort((a, b) => b.score - a.score);

  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#0F7A6B';
    if (score >= 60) return '#5B9A4D';
    if (score >= 40) return '#D4A017';
    if (score >= 20) return '#B45309';
    return '#C44536';
  };

  const getScoreBackgroundColor = (score: number): string => {
    if (score >= 80) return 'rgba(15, 122, 107, 0.1)';
    if (score >= 60) return 'rgba(91, 154, 77, 0.1)';
    if (score >= 40) return 'rgba(212, 160, 23, 0.1)';
    if (score >= 20) return 'rgba(180, 83, 9, 0.1)';
    return 'rgba(196, 69, 54, 0.1)';
  };

  return (
    <div className="label-performance">
      <div className="label-performance__list">
        {sortedData.map((item, index) => {
          const color = getScoreColor(item.score);
          const bgColor = getScoreBackgroundColor(item.score);
          
          return (
            <div key={index} className="label-performance__item">
              <div className="label-performance__label-info">
                <span className="label-performance__label-name" title={item.label}>
                  {item.label}
                </span>
                <span className="label-performance__label-stats">
                  {item.correct}/{item.total}
                </span>
              </div>
              <div className="label-performance__bar-container">
                <div className="label-performance__bar-track">
                  <div 
                    className="label-performance__bar-fill"
                    style={{ 
                      width: `${item.score}%`,
                      backgroundColor: color
                    }}
                  />
                </div>
                <span 
                  className="label-performance__score"
                  style={{ 
                    color: color,
                    backgroundColor: bgColor
                  }}
                >
                  {item.score.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="label-performance__legend">
        <div className="label-performance__legend-item">
          <span className="label-performance__legend-color" style={{ backgroundColor: '#0F7A6B' }} />
          <span>Excelente (80%+)</span>
        </div>
        <div className="label-performance__legend-item">
          <span className="label-performance__legend-color" style={{ backgroundColor: '#5B9A4D' }} />
          <span>Bom (60-79%)</span>
        </div>
        <div className="label-performance__legend-item">
          <span className="label-performance__legend-color" style={{ backgroundColor: '#D4A017' }} />
          <span>Regular (40-59%)</span>
        </div>
        <div className="label-performance__legend-item">
          <span className="label-performance__legend-color" style={{ backgroundColor: '#C44536' }} />
          <span>Baixo (&lt;40%)</span>
        </div>
      </div>
    </div>
  );
};

export default LabelPerformance;
