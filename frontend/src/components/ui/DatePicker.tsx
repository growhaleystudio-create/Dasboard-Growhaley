'use client';

import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './DropdownMenu';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toDate(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatValue(value: string, placeholder: string) {
  const date = toDate(value);
  if (!date) return placeholder;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function DatePicker({ value, onChange, placeholder = 'Select date', className = '' }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = toDate(value);
  const [visibleMonth, setVisibleMonth] = React.useState(() => selectedDate ?? new Date());
  const today = new Date();

  React.useEffect(() => {
    if (selectedDate) setVisibleMonth(selectedDate);
  }, [value]);

  const moveMonth = (offset: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-lg border border-stroke-soft-200 bg-bg-white-0 px-2 text-left text-sm font-normal leading-5 text-text-strong-950 shadow-[0px_1px_2px_rgba(10,13,20,0.03)] transition-all',
            'hover:bg-bg-weak-50/60 focus:outline-none focus:ring-2 focus:ring-primary-base/20',
            open && 'border-primary-base bg-bg-white-0 shadow-[0_0_0_3px_rgba(24,125,180,0.12)]',
            className
          )}
        >
          <CalendarDays size={16} className={open ? 'text-primary-base' : 'text-text-soft-400'} />
          <span className={`min-w-0 flex-1 truncate ${selectedDate ? '' : 'text-text-soft-400'}`}>
            {formatValue(value, placeholder)}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[292px] rounded-[12px] p-3">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" className="flex size-8 items-center justify-center rounded-lg hover:bg-bg-weak-50" onClick={() => moveMonth(-1)}>
            <ChevronLeft size={16} />
          </button>
          <p className="text-sm font-semibold text-text-strong-950">
            {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(visibleMonth)}
          </p>
          <button type="button" className="flex size-8 items-center justify-center rounded-lg hover:bg-bg-weak-50" onClick={() => moveMonth(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekdays.map((day) => (
            <div key={day} className="flex h-7 items-center justify-center text-xs font-medium text-text-soft-400">
              {day}
            </div>
          ))}
          {calendarDays(visibleMonth).map((date) => {
            const selected = selectedDate ? sameDay(date, selectedDate) : false;
            const currentMonth = date.getMonth() === visibleMonth.getMonth();
            const isToday = sameDay(date, today);
            return (
              <button
                key={date.toISOString()}
                type="button"
                onClick={() => {
                  onChange(formatInputValue(date));
                  setOpen(false);
                }}
                className={`flex h-8 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-primary-base text-white shadow-[0_1px_2px_rgba(10,13,20,0.08)]'
                    : isToday
                      ? 'bg-alpha-primary-10 text-primary-base'
                      : currentMonth
                        ? 'text-text-strong-950 hover:bg-bg-weak-50'
                        : 'text-text-disabled-300 hover:bg-bg-weak-50'
                }`}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
