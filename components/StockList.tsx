import React from 'react';
import { StockData } from '../types';
import { ArrowUp, ArrowDown, BarChart2 } from 'lucide-react';

interface StockListProps {
  stocks: StockData[];
  selectedId: string | undefined;
  onSelect: (stock: StockData) => void;
  isFiltered: boolean;
}

const StockList: React.FC<StockListProps> = ({ stocks, selectedId, onSelect, isFiltered }) => {
  return (
    <div className="overflow-y-auto h-[500px] pr-2 custom-scrollbar">
      {stocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
          <BarChart2 size={32} className="opacity-20" />
          <p className="text-sm">無符合條件的股票</p>
        </div>
      ) : (
        stocks.map(stock => {
          const lastDay = stock.history[stock.history.length - 1];
          const isSelected = selectedId === stock.symbol;

          return (
            <div 
              key={stock.symbol}
              onClick={() => onSelect(stock)}
              className={`p-4 mb-2 rounded-lg cursor-pointer transition-all border group ${
                isSelected 
                  ? 'bg-slate-800 border-blue-500/50 shadow-lg shadow-blue-900/10' 
                  : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-100">{stock.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-900/30 text-blue-300' : 'bg-slate-800 text-slate-500'}`}>
                    {stock.symbol}
                  </span>
                </div>
                {isFiltered && (
                   <span className="text-[10px] bg-red-900/40 text-red-300 border border-red-900/50 px-1.5 py-0.5 rounded">
                     策略中選
                   </span>
                )}
              </div>
              
              <div className="flex justify-between items-end">
                <span className="text-xl font-mono font-medium text-slate-200 tracking-tight">
                  {stock.currentPrice.toFixed(2)}
                </span>
                
                <div className="flex flex-col items-end">
                  <span className={`flex items-center text-sm font-bold ${stock.changePct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {stock.changePct >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                    {Math.abs(stock.changePct).toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">
                    Vol: {(lastDay.volume / 1000).toFixed(1)}K
                  </span>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export default StockList;