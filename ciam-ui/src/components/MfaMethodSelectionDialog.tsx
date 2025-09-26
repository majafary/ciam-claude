import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Card,
  CardContent,
  CardActionArea,
  Avatar,
  CircularProgress,
  Alert,
  TextField,
  LinearProgress,
  Chip,
} from '@mui/material';
import {
  Security as SecurityIcon,
  PhoneAndroid as PhoneIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { MFATransaction } from '../types';

export interface MfaMethodSelectionProps {
  open: boolean;
  availableMethods: ('otp' | 'push')[];
  onMethodSelected: (method: 'otp' | 'push') => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
  // New props for unified dialog
  transaction?: MFATransaction | null;
  onOtpVerify?: (otp: string) => Promise<void>;
  onPushVerify?: (pushResult?: 'APPROVED' | 'REJECTED') => Promise<void>;
  onMfaSuccess?: (response: any) => Promise<void>;
  onResendOtp?: () => Promise<void>;
  username?: string;
}

export const MfaMethodSelectionDialog: React.FC<MfaMethodSelectionProps> = ({
  open,
  availableMethods,
  onMethodSelected,
  onCancel,
  isLoading = false,
  error = null,
  transaction = null,
  onOtpVerify,
  onPushVerify,
  onMfaSuccess,
  onResendOtp,
  username,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<'otp' | 'push' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // OTP entry state
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10); // 10 seconds
  const [isExpired, setIsExpired] = useState(false);

  // Push status state
  const [pushStatus, setPushStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);

  // Determine current dialog state
  const isMethodSelection = !transaction;
  const isOtpEntry = transaction?.method === 'otp';
  const isPushWaiting = transaction?.method === 'push';

  // Timer effect for OTP/Push timeout
  useEffect(() => {
    if (transaction && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0) {
      setIsExpired(true);
    }
  }, [timeLeft, transaction]);

  // Reset states when transaction changes
  useEffect(() => {
    if (transaction) {
      setOtp('');
      setOtpError(null);
      setVerifying(false);
      setTimeLeft(10);
      setIsExpired(false);
      setPushStatus(null);
    }
  }, [transaction]);

  // Handle Push notification responses based on user type
  useEffect(() => {
    if (isPushWaiting && onPushVerify && username) {
      let timer: NodeJS.Timeout;

      if (username === 'mfauser') {
        // Auto-approve after 5 seconds for mfauser
        timer = setTimeout(async () => {
          console.log('🟢 Push notification auto-approved for mfauser after 5 seconds');
          try {
            await onPushVerify('APPROVED');
          } catch (error) {
            console.error('Push auto-approval failed:', error);
          }
        }, 5000);
      } else if (username === 'pushfail') {
        // Auto-reject after 7 seconds for pushfail user
        timer = setTimeout(async () => {
          console.log('🔴 Push notification auto-rejected for pushfail after 7 seconds');
          try {
            await onPushVerify('REJECTED');
          } catch (error) {
            console.error('Push auto-rejection failed:', error);
          }
        }, 7000);
      }
      // For pushexpired user, let it timeout naturally (no timer)

      return () => {
        if (timer) clearTimeout(timer);
      };
    }
  }, [isPushWaiting, onPushVerify, username]);

  // Debug logging
  console.log('MfaMethodSelectionDialog render:', {
    open,
    availableMethods,
    isLoading,
    error,
    transaction,
    isMethodSelection,
    isOtpEntry,
    isPushWaiting
  });

  const handleMethodSelect = (method: 'otp' | 'push') => {
    if (submitting) return;
    setSelectedMethod(method);
  };

  const handleSubmit = async () => {
    if (!selectedMethod || submitting) return;

    try {
      setSubmitting(true);
      await onMethodSelected(selectedMethod);
    } catch (error) {
      // Error handling is done in parent component
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setSelectedMethod(null);
    setOtp('');
    setOtpError(null);
    setPushStatus(null);
    onCancel();
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setOtp(value);
    setOtpError(null);
  };

  const handleOtpVerify = async () => {
    if (!otp || otp.length !== 4 || verifying || !onOtpVerify) return;

    try {
      setVerifying(true);
      setOtpError(null);
      await onOtpVerify(otp);
      // Success will be handled by onMfaSuccess callback
    } catch (error: any) {
      setOtpError(error.message || 'Invalid verification code. Please try again.');
      setOtp('');
    } finally {
      setVerifying(false);
    }
  };

  const handleOtpKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && otp.length === 4 && !verifying) {
      handleOtpVerify();
    }
  };

  const handleResendOtp = async () => {
    if (!onResendOtp || resending) return;

    try {
      setResending(true);
      setOtpError(null);
      setIsExpired(false);
      setOtp('');

      await onResendOtp();

      // Reset timer after successful resend
      setTimeLeft(10);
    } catch (error: any) {
      setOtpError(error.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const getMethodInfo = (method: 'otp' | 'push') => {
    switch (method) {
      case 'otp':
        return {
          icon: <SecurityIcon />,
          title: 'Text Message (OTP)',
          description: 'Receive a 4-digit verification code via SMS',
          testHint: 'Use code 1234 for testing'
        };
      case 'push':
        return {
          icon: <PhoneIcon />,
          title: 'Push Notification',
          description: 'Approve the login request on your mobile device',
          testHint: 'Test users: mfauser(success), pushfail(reject), pushexpired(timeout)'
        };
    }
  };

  // Render method selection content
  const renderMethodSelection = () => (
    <>
      <DialogTitle>
        <Typography variant="h6" component="div">
          Choose Verification Method
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
          Select how you'd like to complete your multi-factor authentication
        </Typography>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {availableMethods.map((method) => {
            const methodInfo = getMethodInfo(method);
            const isSelected = selectedMethod === method;

            return (
              <Card
                key={method}
                variant={isSelected ? 'outlined' : 'elevation'}
                sx={{
                  border: isSelected ? '2px solid' : '1px solid',
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    borderColor: 'primary.main',
                    elevation: 3,
                  },
                }}
              >
                <CardActionArea
                  onClick={() => handleMethodSelect(method)}
                  disabled={submitting}
                  sx={{ p: 0 }}
                >
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar
                      sx={{
                        bgcolor: isSelected ? 'primary.main' : 'grey.200',
                        color: isSelected ? 'white' : 'grey.600',
                        transition: 'all 0.2s ease-in-out',
                      }}
                    >
                      {isSelected && !submitting ? <CheckIcon /> : methodInfo.icon}
                    </Avatar>

                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6" gutterBottom>
                        {methodInfo.title}
                      </Typography>
                      <Typography variant="body2" color="textSecondary" gutterBottom>
                        {methodInfo.description}
                      </Typography>
                      <Typography variant="caption" color="textSecondary" sx={{ fontStyle: 'italic' }}>
                        {methodInfo.testHint}
                      </Typography>
                    </Box>

                    {isSelected && (
                      <CheckIcon
                        sx={{
                          color: 'primary.main',
                          fontSize: '1.5rem'
                        }}
                      />
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button
          onClick={handleCancel}
          disabled={submitting}
          color="inherit"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!selectedMethod || submitting}
          startIcon={submitting ? <CircularProgress size={20} /> : null}
          sx={{ minWidth: 120 }}
        >
          {submitting ? 'Sending...' : 'Continue'}
        </Button>
      </DialogActions>
    </>
  );

  // Render OTP entry content
  const renderOtpEntry = () => (
    <>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: 'primary.main' }}>
            <SecurityIcon />
          </Avatar>
          <Box>
            <Typography variant="h6" component="div">
              Enter Verification Code
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Enter the 4-digit code (use 1234 for testing)
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Timer */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Time remaining: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={((10 - timeLeft) / 10) * 100}
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>

        {(otpError || error) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {otpError || error}
          </Alert>
        )}

        {isExpired && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Verification code has expired.
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleResendOtp}
                disabled={resending || !onResendOtp}
                startIcon={resending ? <CircularProgress size={16} /> : null}
              >
                {resending ? 'Resending...' : 'Resend OTP'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  // Switch to Push method
                  if (onMethodSelected) {
                    try {
                      await onMethodSelected('push');
                    } catch (error) {
                      console.error('Failed to switch to Push:', error);
                    }
                  }
                }}
              >
                Use Push Instead
              </Button>
            </Box>
          </Alert>
        )}

        <Box sx={{ textAlign: 'center', mb: 3 }}>
          {isExpired ? (
            <Box>
              <CancelIcon
                sx={{
                  fontSize: 60,
                  color: 'warning.main',
                  mb: 2
                }}
              />
              <Typography variant="body1" gutterBottom>
                Verification code expired
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Use the buttons above to continue
              </Typography>
            </Box>
          ) : (
            <TextField
              value={otp}
              onChange={handleOtpChange}
              onKeyPress={handleOtpKeyPress}
              placeholder="1234"
              inputProps={{
                style: {
                  textAlign: 'center',
                  fontSize: '2rem',
                  letterSpacing: '0.5em',
                  fontWeight: 'bold',
                },
                maxLength: 4,
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontSize: '2rem',
                  '& input': {
                    padding: '16px',
                  },
                },
              }}
              disabled={verifying}
              error={Boolean(otpError)}
            />
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button
          onClick={handleCancel}
          disabled={verifying}
          color="inherit"
        >
          Cancel
        </Button>
        <Button
          onClick={handleOtpVerify}
          variant="contained"
          disabled={otp.length !== 4 || verifying || isExpired}
          startIcon={verifying ? <CircularProgress size={20} /> : <SecurityIcon />}
          sx={{ minWidth: 120 }}
        >
          {verifying ? 'Verifying...' : 'Verify'}
        </Button>
      </DialogActions>
    </>
  );

  // Render push notification waiting content
  const renderPushWaiting = () => (
    <>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: 'primary.main' }}>
            <PhoneIcon />
          </Avatar>
          <Box>
            <Typography variant="h6" component="div">
              Push Notification Sent
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Approve the login request on your mobile device
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Timer */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Time remaining: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={((10 - timeLeft) / 10) * 100}
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
            {(error.includes('rejected') || error.includes('PUSH_REJECTED')) && (
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={async () => {
                    // Restart Push flow by reinitiating challenge
                    if (onMethodSelected) {
                      try {
                        await onMethodSelected('push');
                      } catch (error) {
                        console.error('Failed to restart Push:', error);
                      }
                    }
                  }}
                >
                  Try Push Again
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={async () => {
                    // Switch to OTP method
                    if (onMethodSelected) {
                      try {
                        await onMethodSelected('otp');
                      } catch (error) {
                        console.error('Failed to switch to OTP:', error);
                      }
                    }
                  }}
                >
                  Use OTP Instead
                </Button>
              </Box>
            )}
          </Alert>
        )}

        {isExpired && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Push notification has expired.
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  // Restart Push flow by reinitiating challenge
                  if (onMethodSelected) {
                    try {
                      // Reset expired state first
                      setIsExpired(false);
                      setTimeLeft(10);
                      // Then reinitiate Push challenge
                      await onMethodSelected('push');
                    } catch (error) {
                      console.error('Failed to restart Push:', error);
                    }
                  }
                }}
              >
                Try Push Again
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  // Switch to OTP method
                  setIsExpired(false);
                  if (onMethodSelected) {
                    try {
                      await onMethodSelected('otp');
                    } catch (error) {
                      console.error('Failed to switch to OTP:', error);
                    }
                  }
                }}
              >
                Use OTP Instead
              </Button>
            </Box>
          </Alert>
        )}

        <Box sx={{ textAlign: 'center', py: 4 }}>
          {isExpired ? (
            <Box>
              <CancelIcon
                sx={{
                  fontSize: 60,
                  color: 'warning.main',
                  mb: 2
                }}
              />
              <Typography variant="body1" gutterBottom>
                Push notification expired
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Use the buttons above to continue
              </Typography>
            </Box>
          ) : (
            <Box>
              <CircularProgress size={60} sx={{ mb: 2 }} />
              <Typography variant="body1" gutterBottom>
                Waiting for approval...
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {username === 'mfauser' && 'Auto-approves after 5 seconds'}
                {username === 'pushfail' && 'Auto-rejects after 7 seconds'}
                {username === 'pushexpired' && 'Will timeout after 10 seconds'}
                {!username && 'Check your mobile device'}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button
          onClick={handleCancel}
          color="inherit"
        >
          Cancel
        </Button>
      </DialogActions>
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={submitting || verifying}
      sx={{
        zIndex: 1400, // Ensure dialog appears above navigation (MUI AppBar default is 1100)
      }}
    >
      {isMethodSelection && renderMethodSelection()}
      {isOtpEntry && renderOtpEntry()}
      {isPushWaiting && renderPushWaiting()}
    </Dialog>
  );
};