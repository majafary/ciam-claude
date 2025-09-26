import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  LinearProgress,
  Avatar,
  Chip,
} from '@mui/material';
import {
  Security as SecurityIcon,
  PhoneAndroid as PhoneIcon,
  Cancel as CancelIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { useMfa } from '../hooks/useMfa';
import { useAuth } from '../hooks/useAuth';
import { MfaComponentProps } from '../types';

export const MfaComponent: React.FC<MfaComponentProps> = ({
  transactionId,
  method,
  onSuccess,
  onError,
  onCancel,
  autoSubmit = false,
  showTimer = true,
}) => {
  const { verifyOtp, checkStatus } = useMfa();
  const { login } = useAuth();

  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(10); // 10 seconds
  const [isExpired, setIsExpired] = useState(false);
  const [pushStatus, setPushStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);

  // Auto-submit OTP when complete (for testing)
  useEffect(() => {
    if (autoSubmit && method === 'otp' && otp.length === 4) {
      handleVerifyOtp();
    }
  }, [otp, autoSubmit, method]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      setIsExpired(true);
      return;
    }

    const timer = setTimeout(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [timeLeft]);

  // Poll push status for push method
  useEffect(() => {
    if (method === 'push') {
      const pollInterval = setInterval(async () => {
        try {
          const status = await checkStatus(transactionId);

          if (status.challengeStatus === 'APPROVED') {
            setPushStatus('approved');
            clearInterval(pollInterval);

            // Automatically proceed with push approval
            try {
              const result = await verifyOtp(transactionId, 'APPROVED');
              onSuccess(result);
            } catch (error) {
              onError(error as any);
            }
          } else if (status.challengeStatus === 'REJECTED') {
            setPushStatus('rejected');
            clearInterval(pollInterval);
            setError('Push notification was rejected. Please try again.');
          } else if (status.challengeStatus === 'EXPIRED') {
            clearInterval(pollInterval);
            setIsExpired(true);
          }
        } catch (error) {
          // Continue polling on error
        }
      }, 2000); // Poll every 2 seconds

      return () => clearInterval(pollInterval);
    }
  }, [method, transactionId, checkStatus, verifyOtp, onSuccess, onError]);

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 4) {
      setError('Please enter a valid 4-digit OTP');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await verifyOtp(transactionId, otp);
      onSuccess(result);
    } catch (error: any) {
      setError(error.message || 'OTP verification failed');
      setOtp(''); // Clear OTP on failure
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setOtp(value);

    if (error) {
      setError(null);
    }
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getProgressValue = (): number => {
    return ((10 - timeLeft) / 10) * 100;
  };

  const handleRetry = () => {
    setError(null);
    setIsExpired(false);
    setTimeLeft(10);
    setPushStatus(null);
    setOtp('');
  };

  if (isExpired) {
    return (
      <Paper sx={{ p: 4, maxWidth: 400, mx: 'auto' }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Avatar sx={{ mx: 'auto', mb: 2, bgcolor: 'error.main' }}>
            <CancelIcon />
          </Avatar>
          <Typography variant="h6" gutterBottom>
            MFA Expired
          </Typography>
          <Typography variant="body2" color="textSecondary">
            The MFA challenge has expired. Please try again.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            fullWidth
            variant="outlined"
            onClick={onCancel}
          >
            Back to Login
          </Button>
          <Button
            fullWidth
            variant="contained"
            onClick={handleRetry}
          >
            Retry MFA
          </Button>
        </Box>
      </Paper>
    );
  }

  // Push notification method
  if (method === 'push') {
    return (
      <Paper sx={{ p: 4, maxWidth: 400, mx: 'auto' }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Avatar sx={{
            mx: 'auto',
            mb: 2,
            bgcolor: pushStatus === 'approved' ? 'success.main' : 'primary.main'
          }}>
            {pushStatus === 'approved' ? <CheckIcon /> : <PhoneIcon />}
          </Avatar>
          <Typography variant="h6" gutterBottom>
            {pushStatus === 'approved' ? 'Approved!' : 'Push Notification Sent'}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {pushStatus === 'approved'
              ? 'Authentication successful. Redirecting...'
              : 'Please check your mobile device and approve the login request.'
            }
          </Typography>
        </Box>

        {pushStatus !== 'approved' && (
          <>
            {showTimer && (
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="textSecondary">
                    Time remaining
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {formatTime(timeLeft)}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={getProgressValue()}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
            )}

            <Chip
              label={pushStatus === 'pending' ? 'Waiting for approval...' : 'Push sent'}
              color="primary"
              variant="outlined"
              sx={{ mb: 3, display: 'block', mx: 'auto' }}
              icon={<CircularProgress size={16} />}
            />

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              fullWidth
              variant="outlined"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </>
        )}
      </Paper>
    );
  }

  // OTP method
  return (
    <Paper sx={{ p: 4, maxWidth: 400, mx: 'auto' }}>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Avatar sx={{ mx: 'auto', mb: 2, bgcolor: 'primary.main' }}>
          <SecurityIcon />
        </Avatar>
        <Typography variant="h6" gutterBottom>
          Enter Verification Code
        </Typography>
        <Typography variant="body2" color="textSecondary">
          We've sent a verification code to your device. Enter it below to continue.
        </Typography>
      </Box>

      {showTimer && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="textSecondary">
              Time remaining
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {formatTime(timeLeft)}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={getProgressValue()}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TextField
        fullWidth
        label="Verification Code"
        value={otp}
        onChange={handleOtpChange}
        placeholder="1234"
        inputProps={{
          maxLength: 4,
          style: { textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem' }
        }}
        disabled={isLoading}
        sx={{ mb: 3 }}
        helperText="Enter the 4-digit code (use 1234 for testing)"
      />

      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button
          fullWidth
          variant="outlined"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          fullWidth
          variant="contained"
          onClick={handleVerifyOtp}
          disabled={isLoading || otp.length !== 4}
          startIcon={isLoading ? <CircularProgress size={20} /> : <SecurityIcon />}
        >
          {isLoading ? 'Verifying...' : 'Verify'}
        </Button>
      </Box>

      <Box sx={{ mt: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="textSecondary">
          Didn't receive the code?{' '}
          <Button size="small" onClick={handleRetry}>
            Resend
          </Button>
        </Typography>
      </Box>
    </Paper>
  );
};