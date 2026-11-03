import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor?: 'green' | 'amber' | 'slate' | 'blue' | 'red';
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface CustomSelectProps {
  value: string | number | undefined | null;
  onChange: (value: any) => void;
  options: (SelectOption | string | number)[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  id?: string;
  name?: string;
  size?: 'sm' | 'md';
  leadingIcon?: React.ReactNode;
  error?: string;
  align?: 'left' | 'right';
  emptyMessage?: string;
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  label,
  disabled = false,
  required = false,
  searchable,
  className = '',
  triggerClassName = '',
  menuClassName = '',
  id,
  size = 'md',
  leadingIcon,
  error,
  align = 'left',
  emptyMessage = 'No matching options',
}: CustomSelectProps) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [openUpward, setOpenUpward] = useState(false);
  const [resolvedAlign, setResolvedAlign] = useState<'left' | 'right'>(align);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Normalize options to SelectOption objects
  const normalizedOptions: SelectOption[] = options.map((opt) => {
    if (typeof opt === 'object' && opt !== null) {
      return opt as SelectOption;
    }
    return {
      value: opt,
      label: String(opt),
    };
  });

  const selectedOption = normalizedOptions.find(
    (opt) => String(opt.value) === String(value)
  );

  // Auto-enable search if more than 7 options or explicitly requested
  const isSearchEnabled = searchable ?? normalizedOptions.length > 7;

  // Filter options based on search query
  const filteredOptions = normalizedOptions.filter((opt) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const lMatch = opt.label.toLowerCase().includes(q);
    const subMatch = opt.sublabel ? opt.sublabel.toLowerCase().includes(q) : false;
    const valMatch = String(opt.value).toLowerCase().includes(q);
    return lMatch || subMatch || valMatch;
  });

  // Handle outside clicks
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when opened & detect smart placement
  useEffect(() => {
    if (isOpen) {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        // If less than 230px space below and more space above, open upward
        setOpenUpward(spaceBelow < 230 && spaceAbove > spaceBelow);

        // If align is left but right edge + 220px extends past viewport, align right
        if (align === 'right' || rect.left + 220 > window.innerWidth - 16) {
          setResolvedAlign('right');
        } else {
          setResolvedAlign('left');
        }
      }

      if (isSearchEnabled) {
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
      }
      const idx = filteredOptions.findIndex(
        (o) => String(o.value) === String(value)
      );
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, isSearchEnabled, align]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          const target = filteredOptions[highlightedIndex];
          if (!target.disabled) {
            handleSelect(target.value);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setIsOpen(false);
        setSearchQuery('');
        break;
    }
  };

  const handleSelect = (val: string | number) => {
    onChange(val);
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
    triggerRef.current?.focus();
  };

  const sizeClasses = {
    sm: 'py-1.5 px-3 text-xs',
    md: 'py-2 px-3.5 text-xs',
  };

  return (
    <div className={`relative inline-block w-full text-left ${isOpen ? 'z-40' : 'z-auto'} ${className}`} ref={containerRef}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold text-slate-700 mb-1.5"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between rounded-xl border bg-white text-slate-800 transition-all duration-150 cursor-pointer select-none text-left shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0E6037]/20 focus:border-[#0E6037] ${
          isOpen
            ? 'border-[#0E6037] ring-2 ring-[#0E6037]/20'
            : error
            ? 'border-red-300 ring-2 ring-red-500/10'
            : 'border-slate-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-50/50'} ${
          sizeClasses[size]
        } ${triggerClassName}`}
      >
        <span className="flex items-center space-x-2 truncate">
          {leadingIcon && <span className="text-slate-400 shrink-0">{leadingIcon}</span>}
          {selectedOption ? (
            <span className="flex items-center space-x-2 truncate font-medium">
              {selectedOption.icon && <span className="shrink-0">{selectedOption.icon}</span>}
              <span className="truncate">{selectedOption.label}</span>
              {selectedOption.badge && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 shrink-0">
                  {selectedOption.badge}
                </span>
              )}
            </span>
          ) : (
            <span className="text-slate-400 truncate">{placeholder}</span>
          )}
        </span>

        <span className="ml-2 flex items-center shrink-0 text-slate-400">
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-[#0E6037]' : ''
            }`}
          />
        </span>
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute z-50 w-full min-w-[200px] max-w-[calc(100vw-32px)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl transition-all duration-150 ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${
            resolvedAlign === 'right' ? 'right-0' : 'left-0'
          } ${menuClassName}`}
          style={{ animation: 'fadeIn 0.15s ease-out' }}
        >
          {/* Search Bar inside popover if options are many */}
          {isSearchEnabled && (
            <div className="p-1 mb-1 border-b border-slate-100">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Filter options..."
                  className="w-full pl-7 pr-6 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#0E6037] focus:ring-1 focus:ring-[#0E6037]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-1.5 p-0.5 text-slate-400 hover:text-slate-600 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options List */}
          <ul
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 py-0.5 space-y-0.5 text-xs focus:outline-none"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-slate-400 italic">
                {emptyMessage}
              </li>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                const isHighlighted = idx === highlightedIndex;

                return (
                  <li
                    key={`${opt.value}-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      if (!opt.disabled) handleSelect(opt.value);
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors duration-100 select-none ${
                      opt.disabled
                        ? 'opacity-40 cursor-not-allowed bg-transparent'
                        : isSelected
                        ? 'bg-[#0E6037]/10 text-[#0E6037] font-semibold'
                        : isHighlighted
                        ? 'bg-slate-100/80 text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate mr-2">
                      {opt.icon && (
                        <span
                          className={`shrink-0 ${
                            isSelected ? 'text-[#0E6037]' : 'text-slate-400'
                          }`}
                        >
                          {opt.icon}
                        </span>
                      )}
                      <div className="truncate">
                        <div className="truncate font-medium">{opt.label}</div>
                        {opt.sublabel && (
                          <div className="text-[10px] text-slate-400 truncate">
                            {opt.sublabel}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      {opt.badge && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            opt.badgeColor === 'green'
                              ? 'bg-emerald-100 text-emerald-800'
                              : opt.badgeColor === 'amber'
                              ? 'bg-amber-100 text-amber-800'
                              : opt.badgeColor === 'blue'
                              ? 'bg-blue-100 text-blue-800'
                              : opt.badgeColor === 'red'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-[#0E6037] stroke-[2.5]" />
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}

      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}
