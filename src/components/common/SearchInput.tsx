import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDebounce } from '@/hooks/use-debounce';

interface SearchInputProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  expandable?: boolean;
  className?: string;
}

export function SearchInput({
  onSearch,
  placeholder = 'Search...',
  expandable = false,
  className,
}: SearchInputProps) {
  const [value, setValue] = useState('');
  const [expanded, setExpanded] = useState(!expandable);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedValue = useDebounce(value, 300);

  useEffect(() => {
    onSearch(debouncedValue);
  }, [debouncedValue, onSearch]);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  if (expandable && !expanded) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setExpanded(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className={cn('relative flex items-center', className)}>
      <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 pr-8 text-sm"
        onBlur={() => {
          if (expandable && !value) setExpanded(false);
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          className="absolute right-2 rounded p-0.5 hover:bg-muted"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
