import React, { useState, useEffect } from 'react';
import { Tooltip, IconButton, Box, Typography } from '@mui/material';
import { Info as InfoIcon } from '@mui/icons-material';

const BUILD_TIME = new Date().toISOString();

export const BuildInfo: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  };

  const getBuildAge = () => {
    const buildTime = new Date(BUILD_TIME);
    const diffMs = currentTime.getTime() - buildTime.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just built';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const tooltipContent = (
    <Box sx={{ textAlign: 'left' }}>
      <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block' }}>
        🏪 Storefront Build Info
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
        Built: {formatTime(new Date(BUILD_TIME))}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        Age: {getBuildAge()}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        Live: {formatTime(currentTime)}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.7 }}>
        Dev mode - Auto-refresh every 1s
      </Typography>
    </Box>
  );

  return (
    <Tooltip
      title={tooltipContent}
      placement="top"
      arrow
      componentsProps={{
        tooltip: {
          sx: {
            bgcolor: 'grey.800',
            color: 'white',
            fontSize: '0.75rem',
            maxWidth: 'none',
            '& .MuiTooltip-arrow': {
              color: 'grey.800',
            },
          },
        },
      }}
    >
      <IconButton
        size="small"
        sx={{
          color: 'text.secondary',
          opacity: 0.5,
          '&:hover': {
            opacity: 1,
            color: 'primary.main',
          },
          transition: 'all 0.2s ease',
        }}
      >
        <InfoIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Tooltip>
  );
};

export default BuildInfo;