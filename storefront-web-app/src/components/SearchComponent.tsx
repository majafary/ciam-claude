import React, { useState } from 'react';
import {
  Box,
  InputBase,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

interface SearchComponentProps {
  onSearch?: (query: string) => void;
  placeholder?: string;
}

const SearchComponent: React.FC<SearchComponentProps> = ({
  onSearch,
  placeholder = "Search...",
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [query, setQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSearch = () => {
    if (onSearch && query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  const handleIconClick = () => {
    if (isMobile) {
      setIsExpanded(!isExpanded);
      if (!isExpanded) {
        // Focus the input when expanding on mobile
        setTimeout(() => {
          const input = document.getElementById('search-input');
          if (input) input.focus();
        }, 100);
      }
    } else {
      handleSearch();
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        transition: 'all 0.3s ease',
        width: isMobile ? (isExpanded ? '200px' : '40px') : '250px',
      }}
    >
      {/* Search Input */}
      <InputBase
        id="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        sx={{
          width: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.04)',
          borderRadius: '20px',
          padding: '8px 16px 8px 16px',
          fontSize: '14px',
          border: `1px solid ${theme.palette.grey[300]}`,
          transition: 'all 0.3s ease',
          opacity: isMobile ? (isExpanded ? 1 : 0) : 1,
          visibility: isMobile ? (isExpanded ? 'visible' : 'hidden') : 'visible',
          '&:hover': {
            borderColor: theme.palette.primary.main,
            backgroundColor: 'rgba(0, 0, 0, 0.06)',
          },
          '&.Mui-focused': {
            borderColor: theme.palette.primary.main,
            backgroundColor: 'white',
            boxShadow: `0 0 0 2px ${theme.palette.primary.main}20`,
          },
          '& input': {
            color: theme.palette.text.primary,
            '&::placeholder': {
              color: theme.palette.text.secondary,
              opacity: 0.7,
            },
          },
        }}
      />

      {/* Search Icon Button */}
      <IconButton
        onClick={handleIconClick}
        sx={{
          position: isMobile ? 'absolute' : 'static',
          right: isMobile ? '8px' : 'auto',
          zIndex: 2,
          ml: isMobile ? 0 : -6,
          color: '#1A1A1A', // Dark search icon for navigation (R26 G26 B26)
          '&:hover': {
            color: theme.palette.primary.main,
            backgroundColor: 'transparent',
          },
        }}
        size="small"
      >
        <SearchIcon />
      </IconButton>
    </Box>
  );
};

export default SearchComponent;