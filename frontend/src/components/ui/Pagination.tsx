import React from 'react';
import { Button } from './Button';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage?: number;
  totalItems?: number;
}

export function Pagination({ currentPage, totalPages, onPageChange, totalItems }: PaginationProps) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex w-full flex-col gap-3 pt-4 mt-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-text-soft-400">
        Page {currentPage} of {totalPages} {totalItems ? `(${totalItems} items)` : ''}
      </div>
      
      <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="text-text-soft-400 hover:text-text-strong-950"
        >
          «
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="text-text-soft-400 hover:text-text-strong-950"
        >
          ‹
        </Button>
        
        {pages.slice(Math.max(0, currentPage - 2), Math.min(totalPages, currentPage + 1)).map(page => (
          <Button
            key={page}
            variant={page === currentPage ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onPageChange(page)}
            className={`w-8 h-8 p-0 ${page === currentPage ? 'bg-white border border-[#e2e4e9] shadow-sm' : 'text-text-soft-400'}`}
          >
            {page}
          </Button>
        ))}

        {currentPage + 1 < totalPages && (
          <>
            <span className="text-text-soft-400 px-1">...</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(totalPages)}
              className="w-8 h-8 p-0 text-text-soft-400"
            >
              {totalPages}
            </Button>
          </>
        )}

        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="text-text-soft-400 hover:text-text-strong-950"
        >
          ›
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="text-text-soft-400 hover:text-text-strong-950"
        >
          »
        </Button>
      </div>
    </div>
  );
}
