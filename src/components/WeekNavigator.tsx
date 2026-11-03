import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { getNextWeek, getPreviousWeek, getWeekBounds, getTodayKolkataISO } from '../lib/dateUtils';
import { CustomSelect } from './CustomSelect';

interface WeekNavigatorProps {
  currentWeekStart: string;
  onWeekChange: (newWeekStart: string) => void;
}

export function WeekNavigator({ currentWeekStart, onWeekChange }: WeekNavigatorProps) {
  const bounds = getWeekBounds(currentWeekStart);
  const todayISO = getTodayKolkataISO();
  const currentWeekBounds = getWeekBounds(todayISO);
  const isCurrentWeek = bounds.startDate === currentWeekBounds.startDate;

  const handlePrev = () => {
    const prev = getPreviousWeek(bounds.startDate);
    onWeekChange(prev.startDate);
  };

  const handleNext = () => {
    const next = getNextWeek(bounds.startDate);
    onWeekChange(next.startDate);
  };

  const handleCurrentWeek = () => {
    onWeekChange(currentWeekBounds.startDate);
  };

  // Generate 12 recent cycle options for fast jumping
  const weekOptions = useMemo(() => {
    const opts = [];
    let cur = currentWeekBounds;
    for (let i = 0; i < 12; i++) {
      const label = i === 0 ? `Current Week: ${cur.displayRange}` : `${i} Week${i > 1 ? 's' : ''} Ago: ${cur.displayRange}`;
      opts.push({
        value: cur.startDate,
        label,
        sublabel: `${cur.startDate} to ${cur.endDate}`,
      });
      cur = getPreviousWeek(cur.startDate);
    }
    // Also include currently selected if it is older than 12 weeks
    if (!opts.some((o) => o.value === bounds.startDate)) {
      opts.unshift({
        value: bounds.startDate,
        label: `Selected: ${bounds.displayRange}`,
        sublabel: `${bounds.startDate} to ${bounds.endDate}`,
      });
    }
    return opts;
  }, [currentWeekBounds.startDate, bounds.startDate, bounds.displayRange]);

  return (
    <div className="flex flex-wrap items-center gap-2 bg-white border border-[#696969]/20 rounded-lg p-1.5 shadow-xs">
      <div className="flex items-center space-x-1">
        <button
          onClick={handlePrev}
          title="Previous reporting week (Saturday - Friday)"
          className="p-1.5 text-[#696969] hover:text-[#014025] hover:bg-[#696969]/10 rounded-md transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2 px-2.5 py-1 bg-[#696969]/5 border border-[#696969]/20 rounded-md">
          <Calendar className="w-4 h-4 text-[#696969]" />
          <span className="text-xs font-semibold text-[#014025] tracking-tight font-mono">
            {bounds.displayRange}
          </span>
          <span className="text-white bg-[#014025] px-1.5 py-0.5 rounded uppercase font-bold text-[10px]">
            Sat–Fri
          </span>
        </div>

        <button
          onClick={handleNext}
          title="Next reporting week (Saturday - Friday)"
          className="p-1.5 text-[#696969] hover:text-[#014025] hover:bg-[#696969]/10 rounded-md transition-colors cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center space-x-2">
        {!isCurrentWeek && (
          <button
            onClick={handleCurrentWeek}
            className="text-[#014025] bg-[#014025]/10 hover:bg-[#014025]/20 rounded-md font-medium text-xs px-2 py-1 transition-colors cursor-pointer"
          >
            Current Week
          </button>
        )}

        <div className="w-56 sm:w-64">
          <CustomSelect
            value={bounds.startDate}
            onChange={(val) => onWeekChange(String(val))}
            options={weekOptions}
            size="sm"
            placeholder="Jump to week..."
          />
        </div>
      </div>
    </div>
  );
}
