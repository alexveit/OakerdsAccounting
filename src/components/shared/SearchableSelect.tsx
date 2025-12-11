// src/components/shared/SearchableSelect.tsx
// A reusable typeahead/searchable dropdown component

import { useState, useRef, useEffect, type CSSProperties } from 'react';

export type SelectOption = {
  value: string | number;
  label: string;
  searchText?: string; // Optional additional text to search (e.g., code + name)
};

type SearchableSelectProps = {
  options: SelectOption[];
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
  // Optional: allow creating new items
  allowCreate?: boolean;
  onCreateNew?: (name: string) => Promise<number | string | null>; // Returns new ID or null if failed
  createLabel?: string; // e.g., "Create vendor"
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Type to search...',
  emptyLabel = 'None',
  disabled = false,
  style,
  className,
  allowCreate = false,
  onCreateNew,
  createLabel = 'Create',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get the display label for the current value
  const selectedOption = options.find((o) => String(o.value) === String(value));
  const displayValue = selectedOption ? selectedOption.label : '';

  // Filter options based on search text
  const filteredOptions = searchText.trim()
    ? options.filter((o) => {
        const searchIn = (o.searchText || o.label).toLowerCase();
        return searchIn.includes(searchText.toLowerCase());
      })
    : options;

  // Check if we should show "Create new" option
  const trimmedSearch = searchText.trim();
  const exactMatch = trimmedSearch && options.some((o) => o.label.toLowerCase() === trimmedSearch.toLowerCase());
  const showCreateOption = allowCreate && onCreateNew && trimmedSearch && !exactMatch && filteredOptions.length === 0;

  // Total selectable items: None + filtered options + (optionally) Create
  const totalItems = 1 + filteredOptions.length + (showCreateOption ? 1 : 0);

  // Reset highlighted index when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions.length, showCreateOption]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchText('');
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchText(e.target.value);
    if (!isOpen) setIsOpen(true);
  }

  function handleInputFocus() {
    setIsOpen(true);
    setSearchText('');
  }

  async function handleCreateNew() {
    if (!onCreateNew || !trimmedSearch || isCreating) return;
    
    setIsCreating(true);
    try {
      const newId = await onCreateNew(trimmedSearch);
      if (newId !== null) {
        onChange(newId);
      }
    } catch (err: unknown) {
      console.error('Failed to create:', err);
    } finally {
      setIsCreating(false);
      setIsOpen(false);
      setSearchText('');
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, totalItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex === 0) {
        // "None" selected
        onChange(null);
        setIsOpen(false);
        setSearchText('');
      } else if (showCreateOption && highlightedIndex === totalItems - 1) {
        // "Create new" selected
        handleCreateNew();
      } else {
        const option = filteredOptions[highlightedIndex - 1];
        if (option) {
          onChange(option.value);
          setIsOpen(false);
          setSearchText('');
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchText('');
    }
  }

  function handleOptionClick(optionValue: string | number | null) {
    onChange(optionValue);
    setIsOpen(false);
    setSearchText('');
    inputRef.current?.blur();
  }

  const containerStyle: CSSProperties = {
    position: 'relative',
    ...style,
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    backgroundColor: disabled ? '#f5f5f5' : '#fff',
    cursor: disabled ? 'not-allowed' : 'text',
  };

  const dropdownStyle: CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 200,
    overflowY: 'auto',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: 4,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 1000,
    marginTop: 2,
  };

  const optionStyle = (isHighlighted: boolean, isSelected: boolean): CSSProperties => ({
    padding: '0.5rem 0.75rem',
    fontSize: '0.9375rem',
    cursor: 'pointer',
    backgroundColor: isHighlighted ? '#e5e7eb' : isSelected ? '#f3f4f6' : '#fff',
    borderBottom: '1px solid #f3f4f6',
  });

  const createOptionStyle = (isHighlighted: boolean): CSSProperties => ({
    padding: '0.5rem 0.75rem',
    fontSize: '0.9375rem',
    cursor: isCreating ? 'wait' : 'pointer',
    backgroundColor: isHighlighted ? '#dcfce7' : '#f0fdf4',
    borderBottom: '1px solid #f3f4f6',
    color: '#16a34a',
    fontWeight: 500,
  });

  return (
    <div ref={dropdownRef} style={containerStyle} className={className}>
      <input
        ref={inputRef}
        type="text"
        value={isOpen ? searchText : displayValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleInputKeyDown}
        placeholder={displayValue || placeholder}
        disabled={disabled}
        style={inputStyle}
      />
      
      {isOpen && (
        <div style={dropdownStyle}>
          {/* "None" option */}
          <div
            style={optionStyle(highlightedIndex === 0, value === null || value === '')}
            onMouseDown={(e) => { e.preventDefault(); handleOptionClick(null); }}
            onMouseEnter={() => setHighlightedIndex(0)}
          >
            <em style={{ color: '#999' }}>{emptyLabel}</em>
          </div>
          
          {/* Filtered options */}
          {filteredOptions.map((option, index) => (
            <div
              key={option.value}
              style={optionStyle(highlightedIndex === index + 1, String(option.value) === String(value))}
              onMouseDown={(e) => { e.preventDefault(); handleOptionClick(option.value); }}
              onMouseEnter={() => setHighlightedIndex(index + 1)}
            >
              {option.label}
            </div>
          ))}

          {/* "Create new" option */}
          {showCreateOption && (
            <div
              style={createOptionStyle(highlightedIndex === totalItems - 1)}
              onMouseDown={(e) => { e.preventDefault(); handleCreateNew(); }}
              onMouseEnter={() => setHighlightedIndex(totalItems - 1)}
            >
              {isCreating ? 'Creating...' : `+ ${createLabel} "${trimmedSearch}"`}
            </div>
          )}

          {/* No matches message (only if not showing create option) */}
          {filteredOptions.length === 0 && !showCreateOption && trimmedSearch && (
            <div style={{ padding: '0.5rem', color: '#999', fontSize: 12, textAlign: 'center' }}>
              No matches found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
