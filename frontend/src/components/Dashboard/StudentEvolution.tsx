import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Icon } from '../Icons/Icons';

interface EvolutionData {
  week: string;
  average: number;
  count: number;
}

interface StudentEvolutionProps {
  data: EvolutionData[];
}

interface TrendInfo {
  direction: 'up' | 'down' | 'stable';
  value: string;
}

const StudentEvolution: React.FC<StudentEvolutionProps> = ({ data }) => {
  const chartData = useMemo(() => {
    return data.map((item, index) => ({
      ...item,
      weekLabel: `Sem ${index + 1}`,
      weekFull: formatWeekDate(item.week),
    }));
  }, [data]);

  const trend = useMemo((): TrendInfo | null => {
    if (data.length < 2) return null;
    const last = data[data.length - 1].average;
    const prev = data[data.length - 2].average;
    const diff = last - prev;
    return {
      direction: diff > 0.5 ? 'up' : diff < -0.5 ? 'down' : 'stable',
      value: Math.abs(diff).toFixed(1)
    };
  }, [data]);

  const maxCount = useMemo(() => {
    if (!data.length) return 10;
    return Math.max(...data.map(d => d.count), 10);
  }, [data]);

  if (!data.length) {
    return (
      <div className="student-evolution student-evolution--empty">
        <p>Sem dados de evolução disponíveis</p>
      </div>
    );
  }

  return (
    <div className="student-evolution">
      {trend && (
        <div className={`student-evolution__trend student-evolution__trend--${trend.direction}`}>
          <Icon 
            name={trend.direction === 'up' ? 'arrowUp' : trend.direction === 'down' ? 'arrowDown' : 'minus'} 
            size={14} 
          />
          <span>
            {trend.direction === 'up' && `+${trend.value}% vs semana anterior`}
            {trend.direction === 'down' && `-${trend.value}% vs semana anterior`}
            {trend.direction === 'stable' && 'Estável vs semana anterior'}
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%" minHeight={240}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E8ECEF" />
          <XAxis 
            dataKey="weekLabel" 
            tick={{ fontSize: 11, fill: '#6B7280' }}
            axisLine={{ stroke: '#DDE2E6' }}
            tickLine={{ stroke: '#DDE2E6' }}
          />
          <YAxis 
            yAxisId="left"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: '#6B7280' }}
            axisLine={{ stroke: '#DDE2E6' }}
            tickLine={{ stroke: '#DDE2E6' }}
            tickFormatter={(value) => `${value}%`}
            width={40}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            domain={[0, maxCount]}
            tick={{ fontSize: 11, fill: '#B45309' }}
            axisLine={{ stroke: '#B45309' }}
            tickLine={{ stroke: '#B45309' }}
            tickFormatter={(value) => `${value}`}
            width={30}
          />
          <Tooltip 
            content={<CustomTooltip />}
            cursor={{ stroke: '#1F7A8C', strokeWidth: 1, strokeDasharray: '5 5' }}
          />
          <Legend 
            verticalAlign="bottom"
            height={28}
            formatter={(value) => <span style={{ color: '#374151', fontSize: '0.8rem' }}>{value}</span>}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="average"
            name="Média da Turma"
            stroke="#1F7A8C"
            strokeWidth={3}
            dot={{ fill: '#1F7A8C', strokeWidth: 2, r: 5 }}
            activeDot={{ r: 7, fill: '#0B3C5D' }}
            animationDuration={1000}
            animationEasing="ease-out"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="count"
            name="Submissões"
            stroke="#B45309"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: '#B45309', strokeWidth: 2, r: 3 }}
            activeDot={{ r: 5, fill: '#B45309' }}
            animationDuration={1000}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { weekFull: string; average: number; count: number } }>;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  
  return (
    <div className="student-evolution__tooltip">
      <p className="student-evolution__tooltip-title">{data.weekFull}</p>
      <p className="student-evolution__tooltip-value">
        <span className="student-evolution__tooltip-dot" />
        Média: <strong>{data.average.toFixed(1)}%</strong>
      </p>
      <p className="student-evolution__tooltip-value student-evolution__tooltip-value--secondary">
        <span className="student-evolution__tooltip-dot student-evolution__tooltip-dot--secondary" />
        Submissões: <strong>{data.count}</strong>
      </p>
    </div>
  );
};

function formatWeekDate(weekStr: string): string {
  try {
    const date = new Date(weekStr);
    const day = date.getDate().toString().padStart(2, '0');
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const month = months[date.getMonth()];
    return `Semana de ${day}/${month}`;
  } catch {
    return weekStr;
  }
}

export default StudentEvolution;
