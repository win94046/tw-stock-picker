import React from 'react';
import {
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Cell,
  CartesianGrid
} from 'recharts';
import { OHLCV } from '../types';

interface CandleStickChartProps {
  data: OHLCV[];
}

// Custom Shape for the Candle
const CandleShape = (props: any) => {
  const { x, y, width, height, payload } = props;
  const { open, close, high, low } = payload;

  const isGrowing = close >= open;
  const color = isGrowing ? '#ef4444' : '#22c55e'; // TW colors: Red Up, Green Down

  // Calculate scaling factor based on the chart's computed coordinate system
  // Recharts provides the Y coordinate for the 'value' (which is usually close or open depending on dataKey)
  // But inside a custom shape, we need to map the actual high/low/open/close values to pixels manually
  // or rely on the props passed if we map them correctly.
  // 
  // EASIER METHOD: Rely on the y and height provided by the Bar component which maps the [min(open, close), max(open, close)]
  // But we need the wicks (High/Low).
  
  // We need the Y-axis scale function to map price to pixels. 
  // Fortunately, Recharts passes `yAxis` in props context, but accessing it here is tricky.
  // Instead, we can calculate relative positions if we know the pixel range, but that's brittle.
  
  // ROBUST METHOD: 
  // The `y` prop passed to this shape corresponds to the TOP of the bar (the max value).
  // The `height` prop corresponds to the height of the bar.
  // We need to draw the wicks relative to these.
  
  // Since Recharts is a bit tricky with OHLC out of the box without using `ErrorBar`,
  // We will do a slight hack: The Bar displays the Open-Close body.
  // We draw the High-Low line manually inside this shape.
  
  // However, we don't have the conversion function here easily. 
  // So we will stick to a simpler layout:
  // The parent chart will be a ComposedChart.
  // We will use a custom ErrorBar for wicks? No, that's messy.
  
  // Let's calculate pixels based on the passed `y` and `height`.
  // The Bar chart dataKey will be the range [min(open, close), max(open, close)].
  // So `y` is the pixel for max(open, close).
  // `height` is the pixel height of the body.
  // We need pixel positions for High and Low.
  
  // To do this accurately without the scale function, we'll assume linear scaling 
  // within the local coordinate system of the bar if passed properly.
  // Actually, it's better to use the `y` and `height` of the body as reference, 
  // but we lack the `high` and `low` pixel coordinates.

  // ALTERNATIVE: Use the Native SVG logic requested by the user but wrap it in Recharts? 
  // No, that defeats the purpose.
  
  // CORRECT RECHARTS WAY:
  // We need to access the axis scale.
  // Or, use a `Customized` component, or simply map the data to [min, max] for the bar 
  // and trust our math?
  
  // Let's try the "Error Bar" approach visually inside the shape.
  // We can recover the unit scale:
  // pixelPerUnit = height / Math.abs(open - close)
  // Then we calculate offsets for high and low.
  
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
        </div>
      </div>
    );
  }
  return null;
};

const CandleStickChart: React.FC<CandleStickChartProps> = ({ data }) => {
  // Transform data for Recharts to render the body correctly as a "Bar"
  // The Bar needs to represent the range between Open and Close.
  // We can use a dataKey that returns an array [min, max] for the Bar.
  const chartData = data.map(d => ({
    ...d,
    body: [Math.min(d.open, d.close), Math.max(d.open, d.close)]
  }));

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