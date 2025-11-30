import React, { useMemo } from 'react';
import {
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Cell,
  CartesianGrid,
  Line
} from 'recharts';
import { OHLCV } from '../types';

interface CandleStickChartProps {
  data: OHLCV[];
}

// Helper to calculate Bollinger Bands
const calculateBollingerBands = (data: OHLCV[], period: number = 20, multiplier: number = 2) => {
  return data.map((item, index) => {
    if (index < period - 1) {
      return { ...item, ma20: null, upperBand: null, lowerBand: null };
    }

    const slice = data.slice(index - period + 1, index + 1);
    const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
    const mean = sum / period;

    const squaredDiffs = slice.map(curr => Math.pow(curr.close - mean, 2));
    const variance = squaredDiffs.reduce((acc, curr) => acc + curr, 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      ...item,
      ma20: mean,
      upperBand: mean + (multiplier * stdDev),
      lowerBand: mean - (multiplier * stdDev)
    };
  });
};

// Custom Shape for the Candle
const CandleShape = (props: any) => {
  const { x, y, width, height, payload } = props;
  const { open, close, high, low } = payload;

  const isGrowing = close >= open;
  const color = isGrowing ? '#ef4444' : '#22c55e'; // TW colors: Red Up, Green Down

  const bodyLength = Math.abs(close - open);
  // Avoid divide by zero for flat candles
  const ratio = bodyLength === 0 ? 1 : height / bodyLength;

  const yHigh = y - (high - Math.max(open, close)) * ratio;
  const yLow = y + height + (Math.min(open, close) - low) * ratio;

  return (
    <g>
      {/* Wick */}
      <line
        x1={x + width / 2}
        y1={yHigh}
        x2={x + width / 2}
        y2={yLow}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Body */}
      <rect
        x={x}
        y={y}
        width={width}
        height={Math.max(height, 1)} // Ensure visible even if flat
        fill={color}
        stroke={color}
      />
    </g>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded shadow-xl text-xs">
        <p className="text-slate-400 mb-2">{data.date}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span className="text-slate-500">Open:</span>
          <span className="font-mono text-right text-slate-200">{data.open.toFixed(2)}</span>

          <span className="text-slate-500">High:</span>
          <span className="font-mono text-right text-slate-200">{data.high.toFixed(2)}</span>

          <span className="text-slate-500">Low:</span>
          <span className="font-mono text-right text-slate-200">{data.low.toFixed(2)}</span>

          <span className="text-slate-500">Close:</span>
          <span className={`font-mono text-right ${data.close >= data.open ? 'text-red-400' : 'text-green-400'}`}>
            {data.close.toFixed(2)}
          </span>

          <span className="text-slate-500">Vol:</span>
          <span className="font-mono text-right text-yellow-500">{data.volume}</span>

          {data.ma20 && (
            <>
              <div className="col-span-2 h-px bg-slate-700 my-1"></div>
              <span className="text-yellow-500">MA20:</span>
              <span className="font-mono text-right text-yellow-500">{data.ma20.toFixed(2)}</span>
              <span className="text-purple-400">Upper:</span>
              <span className="font-mono text-right text-purple-400">{data.upperBand.toFixed(2)}</span>
              <span className="text-purple-400">Lower:</span>
              <span className="font-mono text-right text-purple-400">{data.lowerBand.toFixed(2)}</span>
            </>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const CandleStickChart: React.FC<CandleStickChartProps> = ({ data }) => {
  // Transform data for Recharts to render the body correctly as a "Bar"
  // And calculate Bollinger Bands
  const chartData = useMemo(() => {
    const withBands = calculateBollingerBands(data);
    return withBands.map(d => ({
      ...d,
      body: [Math.min(d.open, d.close), Math.max(d.open, d.close)]
    }));
  }, [data]);

  return (
    <div className="w-full h-full bg-slate-900 rounded-lg p-2 border border-slate-800">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: '#475569' }}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: '#475569' }}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#475569', strokeDasharray: '5 5' }} />

          {/* Bollinger Bands */}
          <Line type="monotone" dataKey="upperBand" stroke="#a855f7" strokeDasharray="3 3" dot={false} strokeWidth={1} isAnimationActive={false} />
          <Line type="monotone" dataKey="lowerBand" stroke="#a855f7" strokeDasharray="3 3" dot={false} strokeWidth={1} isAnimationActive={false} />
          <Line type="monotone" dataKey="ma20" stroke="#eab308" dot={false} strokeWidth={1.5} isAnimationActive={false} />

          {/* We use a Bar to render the candle body and custom shape for the full candle */}
          <Bar
            dataKey="body"
            shape={<CandleShape />}
            isAnimationActive={false} // Disable animation for better performance on updates
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.close >= entry.open ? '#ef4444' : '#22c55e'} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CandleStickChart;