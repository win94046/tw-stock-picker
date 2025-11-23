import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalItems: number;
    itemsPerPage: number;
    displayedItems: number;
}

export default function PaginationControls({
    currentPage,
    totalPages,
    onPageChange,
    totalItems,
    itemsPerPage,
    displayedItems
}: PaginationControlsProps) {
    const startItem = currentPage * itemsPerPage + 1;
    const endItem = Math.min((currentPage + 1) * itemsPerPage, totalItems);

    const handlePrevious = () => {
        if (currentPage > 0) {
            onPageChange(currentPage - 1);
        }
    };

    const handleNext = () => {
        if (currentPage < totalPages - 1) {
            onPageChange(currentPage + 1);
        }
    };

    // 生成頁碼按鈕（最多顯示7個）
    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const maxVisible = 7;

        if (totalPages <= maxVisible) {
            // 如果總頁數少於7，全部顯示
            for (let i = 0; i < totalPages; i++) {
                pages.push(i);
            }
        } else {
            // 總是顯示第一頁
            pages.push(0);

            let startPage = Math.max(1, currentPage - 2);
            let endPage = Math.min(totalPages - 2, currentPage + 2);

            // 調整範圍確保顯示足夠的頁碼
            if (currentPage <= 3) {
                endPage = 4;
            } else if (currentPage >= totalPages - 4) {
                startPage = totalPages - 5;
            }

            // 添加省略號
            if (startPage > 1) {
                pages.push('...');
            }

            // 添加中間頁碼
            for (let i = startPage; i <= endPage; i++) {
                pages.push(i);
            }

            // 添加省略號
            if (endPage < totalPages - 2) {
                pages.push('...');
            }

            // 總是顯示最後一頁
            pages.push(totalPages - 1);
        }

        return pages;
    };

    if (totalPages <= 1) {
        return null; // 只有一頁時不顯示分頁控制
    }

    return (
        <div className="mt-4 pt-4 border-t border-slate-800/50">
            {/* 顯示範圍資訊 */}
            <div className="text-center text-xs text-slate-500 mb-3">
                顯示 {startItem}-{endItem} / 共 {totalItems} 支股票
                {displayedItems < totalItems && ` (目前顯示 ${displayedItems} 筆)`}
            </div>

            {/* 分頁按鈕 */}
            <div className="flex items-center justify-center gap-2">
                {/* 上一頁按鈕 */}
                <button
                    onClick={handlePrevious}
                    disabled={currentPage === 0}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 disabled:cursor-not-allowed text-sm rounded-lg border border-slate-700 disabled:border-slate-800 transition-all"
                >
                    <ChevronLeft size={16} />
                    <span className="hidden sm:inline">上100筆</span>
                </button>

                {/* 頁碼按鈕 */}
                <div className="flex items-center gap-1">
                    {getPageNumbers().map((page, index) => (
                        <React.Fragment key={index}>
                            {page === '...' ? (
                                <span className="px-2 text-slate-600">...</span>
                            ) : (
                                <button
                                    onClick={() => onPageChange(page as number)}
                                    className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${currentPage === page
                                            ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/40'
                                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white'
                                        }`}
                                >
                                    {(page as number) + 1}
                                </button>
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* 下一頁按鈕 */}
                <button
                    onClick={handleNext}
                    disabled={currentPage >= totalPages - 1}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 disabled:cursor-not-allowed text-sm rounded-lg border border-slate-700 disabled:border-slate-800 transition-all"
                >
                    <span className="hidden sm:inline">下100筆</span>
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>
    );
}
