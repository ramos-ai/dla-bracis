import React from 'react';

interface Insight {
  type: 'success' | 'warning' | 'error' | 'info';
  severity?: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  icon: string;
}

interface InsightsPanelProps {
  insights: Insight[];
}

const InsightsPanel: React.FC<InsightsPanelProps> = ({ insights }) => {
  if (!insights.length) {
    return (
      <div className="insights-panel insights-panel--empty">
        <p>Colete mais dados para gerar insights automáticos</p>
      </div>
    );
  }

  const getSeverityLabel = (severity?: string): string => {
    const labels: Record<string, string> = {
      'critical': 'Crítico',
      'high': 'Alto',
      'medium': 'Médio',
      'low': 'Baixo',
    };
    return labels[severity || 'low'] || '';
  };

  return (
    <div className="insights-panel">
      {insights.slice(0, 4).map((insight, index) => (
        <div 
          key={index} 
          className={`insights-panel__item insights-panel__item--${insight.type}`}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="insights-panel__content">
            <div className="insights-panel__header">
              <h4 className="insights-panel__title">{insight.title}</h4>
              {insight.severity && (
                <span className={`insights-panel__severity insights-panel__severity--${insight.severity}`}>
                  {getSeverityLabel(insight.severity)}
                </span>
              )}
            </div>
            <p className="insights-panel__description">{insight.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default InsightsPanel;
