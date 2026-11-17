import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
}

interface CustomDropdownProps<T extends string = string> {
  readonly id: string;
  readonly label?: string;
  readonly value: T;
  readonly options: readonly DropdownOption<T>[];
  readonly disabled?: boolean;
  readonly onChange: (value: T) => void;
  readonly className?: string;
}

export function CustomDropdown<T extends string = string>({
  id,
  label,
  value,
  options,
  disabled = false,
  onChange,
  className = ''
}: CustomDropdownProps<T>): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      if (!isOpen) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setIsOpen(true);
          const currentIndex = options.findIndex((opt) => opt.value === value);
          setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
        }
        return;
      }

      switch (e.key) {
        case 'Escape':
        case 'Tab':
          e.preventDefault();
          setIsOpen(false);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1 < options.length ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : options.length - 1));
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < options.length) {
            const chosen = options[focusedIndex];
            if (chosen) {
              onChange(chosen.value);
            }
          }
          setIsOpen(false);
          break;
      }
    },
    [disabled, isOpen, options, value, focusedIndex, onChange]
  );

  const handleSelectOption = (optValue: T) => {
    onChange(optValue);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`custom-dropdown-container ${className} ${disabled ? 'disabled' : ''}`}
      onKeyDown={handleKeyDown}
    >
      {label && (
        <label htmlFor={`${id}-btn`} className="custom-dropdown-label">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        id={`${id}-btn`}
        className={`custom-dropdown-trigger ${isOpen ? 'open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={label ? undefined : `${id}-btn`}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => !prev);
            const curIdx = options.findIndex((opt) => opt.value === value);
            setFocusedIndex(curIdx >= 0 ? curIdx : 0);
          }
        }}
      >
        <span className="custom-dropdown-value">{selectedOption?.label || String(value)}</span>
        <ChevronDown size={16} className={`custom-dropdown-chevron ${isOpen ? 'rotated' : ''}`} />
      </button>

      {/* Hidden native select for form accessibility / testing tools */}
      <select
        id={id}
        value={value}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="custom-dropdown-hidden-select"
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Options Popup Menu */}
      {isOpen && (
        <div ref={menuRef} className="custom-dropdown-menu" role="listbox" tabIndex={-1}>
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isFocused = idx === focusedIndex;
            return (
              <button
                type="button"
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                className={`custom-dropdown-option ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
                onClick={() => handleSelectOption(opt.value)}
                onMouseEnter={() => setFocusedIndex(idx)}
              >
                <span className="option-label">{opt.label}</span>
                {isSelected && <Check size={14} className="option-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
