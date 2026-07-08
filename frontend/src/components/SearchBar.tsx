import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const SearchBar = ({ value, onChange, placeholder = 'Search...', className = '' }: SearchBarProps) => {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-full bg-gray-800 py-3 pl-10 pr-10 text-sm text-white placeholder-gray-400 outline-none focus:outline-2 focus:outline-green-500"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
        >
          <X size={20} />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
