import React from 'react';
import { Box, Typography, Button } from '@mui/material';

interface BankingPromoProps {
  width?: number;
  height?: number;
}

const BankingPromo: React.FC<BankingPromoProps> = ({ width = 500, height = 400 }) => {
  return (
    <Box
      sx={{
        width: width,
        height: height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #2C0B40 0%, #1a0628 100%)',
        borderRadius: 3,
        boxShadow: '0 20px 60px rgba(44, 11, 64, 0.25)',
        position: 'relative',
        overflow: 'hidden',
        color: 'white',
        textAlign: 'center',
        p: 4,
      }}
    >
      {/* Background Accent */}
      <Box
        sx={{
          position: 'absolute',
          top: -50,
          right: -50,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.05)',
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          bottom: -30,
          left: -30,
          width: 150,
          height: 150,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.03)',
        }}
      />

      {/* Main Content */}
      <Typography
        variant="h4"
        sx={{
          fontWeight: 600,
          mb: 2,
          fontSize: { xs: '1.5rem', md: '2rem' },
          lineHeight: 1.3,
        }}
      >
        High-Yield Savings
      </Typography>

      <Typography
        variant="h6"
        sx={{
          fontWeight: 400,
          mb: 1,
          opacity: 0.9,
          fontSize: { xs: '1rem', md: '1.1rem' },
        }}
      >
        Competitive Annual Percentage Yield
      </Typography>

      <Typography
        variant="body1"
        sx={{
          mb: 3,
          opacity: 0.8,
          fontSize: '0.95rem',
          lineHeight: 1.5,
          maxWidth: '300px',
        }}
      >
        Premium rates and exceptional service are just the beginning of your financial journey
      </Typography>

      {/* APY Display */}
      <Box
        sx={{
          mb: 3,
          p: 2,
          borderRadius: 2,
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <Typography
          variant="h3"
          sx={{
            fontWeight: 700,
            fontSize: { xs: '2rem', md: '2.5rem' },
            mb: 0.5,
          }}
        >
          4.25%
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.8rem',
            opacity: 0.8,
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          APY*
        </Typography>
      </Box>


      {/* Fine Print */}
      <Typography
        variant="caption"
        sx={{
          mt: 2,
          fontSize: '0.7rem',
          opacity: 0.6,
          maxWidth: '350px',
          lineHeight: 1.3,
        }}
      >
        *Annual Percentage Yield. Rates subject to change. Minimum balance requirements may apply.
      </Typography>
    </Box>
  );
};

export default BankingPromo;