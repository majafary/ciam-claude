import React from 'react';
import { Box, Typography } from '@mui/material';

interface BankLogoProps {
  width?: number;
  height?: number;
}

const BankLogo: React.FC<BankLogoProps> = ({ width = 500, height = 400 }) => {
  return (
    <Box
      sx={{
        width: width,
        height: height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
        borderRadius: 3,
        boxShadow: '0 20px 60px rgba(44, 11, 64, 0.15)',
        border: '1px solid rgba(44, 11, 64, 0.1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Grand Classical Bank Building with Pillars */}
      <svg
        width="280"
        height="200"
        viewBox="0 0 280 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Grand Foundation */}
        <rect x="20" y="170" width="240" height="12" fill="#2C0B40" />
        <rect x="15" y="182" width="250" height="8" fill="#2C0B40" />
        <rect x="10" y="190" width="260" height="6" fill="#1a0628" />

        {/* Main Building Body */}
        <rect x="40" y="100" width="200" height="70" fill="#2C0B40" />

        {/* Elegant Pediment/Roof */}
        <path d="M30 100 L140 40 L250 100 Z" fill="#2C0B40" />

        {/* Decorative Pediment Frieze */}
        <rect x="35" y="95" width="210" height="8" fill="#1a0628" />

        {/* Grand Classical Columns (8 pillars) */}
        <rect x="50" y="110" width="12" height="55" fill="#ffffff" />
        <rect x="70" y="110" width="12" height="55" fill="#ffffff" />
        <rect x="90" y="110" width="12" height="55" fill="#ffffff" />
        <rect x="110" y="110" width="12" height="55" fill="#ffffff" />
        <rect x="130" y="110" width="12" height="55" fill="#ffffff" />
        <rect x="150" y="110" width="12" height="55" fill="#ffffff" />
        <rect x="170" y="110" width="12" height="55" fill="#ffffff" />
        <rect x="190" y="110" width="12" height="55" fill="#ffffff" />
        <rect x="210" y="110" width="12" height="55" fill="#ffffff" />

        {/* Ornate Column Capitals */}
        <rect x="47" y="105" width="18" height="8" fill="#ffffff" />
        <rect x="67" y="105" width="18" height="8" fill="#ffffff" />
        <rect x="87" y="105" width="18" height="8" fill="#ffffff" />
        <rect x="107" y="105" width="18" height="8" fill="#ffffff" />
        <rect x="127" y="105" width="18" height="8" fill="#ffffff" />
        <rect x="147" y="105" width="18" height="8" fill="#ffffff" />
        <rect x="167" y="105" width="18" height="8" fill="#ffffff" />
        <rect x="187" y="105" width="18" height="8" fill="#ffffff" />
        <rect x="207" y="105" width="18" height="8" fill="#ffffff" />

        {/* Column Bases */}
        <rect x="47" y="165" width="18" height="5" fill="#ffffff" />
        <rect x="67" y="165" width="18" height="5" fill="#ffffff" />
        <rect x="87" y="165" width="18" height="5" fill="#ffffff" />
        <rect x="107" y="165" width="18" height="5" fill="#ffffff" />
        <rect x="127" y="165" width="18" height="5" fill="#ffffff" />
        <rect x="147" y="165" width="18" height="5" fill="#ffffff" />
        <rect x="167" y="165" width="18" height="5" fill="#ffffff" />
        <rect x="187" y="165" width="18" height="5" fill="#ffffff" />
        <rect x="207" y="165" width="18" height="5" fill="#ffffff" />

        {/* Grand Entrance */}
        <rect x="125" y="130" width="30" height="35" fill="#2C0B40" />
        <path d="M125 130 L140 125 L155 130 Z" fill="#2C0B40" />

        {/* Entrance Steps */}
        <rect x="30" y="165" width="220" height="5" fill="#1a0628" />
        <rect x="35" y="170" width="210" height="4" fill="#1a0628" />
        <rect x="40" y="174" width="200" height="3" fill="#1a0628" />

        {/* Decorative Elements in Pediment */}
        <circle cx="140" cy="70" r="8" fill="#ffffff" fillOpacity="0.8" />
        <rect x="136" y="74" width="8" height="2" fill="#ffffff" fillOpacity="0.8" />
      </svg>

      {/* Minimal line accent */}
      <Box
        sx={{
          width: '80px',
          height: '1px',
          backgroundColor: '#2C0B40',
          mt: 3,
          opacity: 0.6,
        }}
      />

      {/* Establishment date */}
      <Typography
        variant="h6"
        sx={{
          mt: 2,
          color: '#2C0B40',
          fontSize: '1rem',
          letterSpacing: '3px',
          fontWeight: 400,
          fontFamily: '"Playfair Display", serif',
        }}
      >
        EST 1919
      </Typography>
    </Box>
  );
};

export default BankLogo;