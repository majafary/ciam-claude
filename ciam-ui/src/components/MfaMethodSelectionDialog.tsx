import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  availableMethods: ('sms' | 'voice' | 'push')[];
  onMethodSelected: (method: 'sms' | 'voice' | 'push') => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
  // New props for unified dialog
  transaction?: MFATransaction | null;
  onOtpVerify?: (otp: string) => Promise<void>;
  onPushVerify?: (pushResult?: 'APPROVED' | 'REJECTED', selectedNumber?: number) => Promise<void>;
  onMfaSuccess?: (response: any) => Promise<void>;
  onPollPushStatus?: (contextId: string, transactionId: string) => Promise<any>;
  mfaContextId?: string;
  username?: string;
  onBackToMethodSelection?: () => void;
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
  onPollPushStatus,
  mfaContextId,
  username,
  onBackToMethodSelection,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<'sms' | 'voice' | 'push' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // OTP entry state
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [retryingOtp, setRetryingOtp] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10); // 10 seconds
  const [isExpired, setIsExpired] = useState(false);
  const [backendTimeLeft, setBackendTimeLeft] = useState(10); // Separate state for backend polling
  const [otpFailedAndWaitingForRedirect, setOtpFailedAndWaitingForRedirect] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTransactionIdRef = useRef<string | null>(null);
  const pollingStartedRef = useRef<boolean>(false);
  const autoCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Push status state
  const [pushStatus, setPushStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [showRetryPush, setShowRetryPush] = useState(false);
  const [retryingPush, setRetryingPush] = useState(false);
  const retryPushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine current dialog state
  const isMethodSelection = !transaction;
  const isOtpEntry = transaction?.method === 'sms' || transaction?.method === 'voice';
  const isPushWaiting = transaction?.method === 'push';

  // Timer effect for OTP (not used for Push since backend polling handles Push timing)
  useEffect(() => {
    // Stop timer if OTP failed and waiting for redirect, or if expired
    if ((transaction?.method === 'sms' || transaction?.method === 'voice') && timeLeft > 0 && !isExpired && !otpFailedAndWaitingForRedirect) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && !isExpired && !otpFailedAndWaitingForRedirect) {
      setIsExpired(true);
    }
  }, [timeLeft, transaction, isExpired, otpFailedAndWaitingForRedirect]);

  // Reset states when transaction changes
  useEffect(() => {
    if (transaction && transaction.transaction_id !== lastTransactionIdRef.current) {
      console.log('🔄 Transaction changed, resetting states:', transaction.transaction_id);
      lastTransactionIdRef.current = transaction.transaction_id;
      setOtp('');
      setOtpError(null);
      setVerifying(false);
      setTimeLeft(10);
      setBackendTimeLeft(10);
      setIsExpired(false);
      setPushStatus(null);
      setOtpFailedAndWaitingForRedirect(false);
      setShowRetryPush(false);
      setRetryingPush(false);

      // Clear any existing interval and reset polling flag
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      pollingStartedRef.current = false;

      // Clear retry push timeout
      if (retryPushTimeoutRef.current) {
        clearTimeout(retryPushTimeoutRef.current);
        retryPushTimeoutRef.current = null;
      }
    } else if (!transaction && lastTransactionIdRef.current) {
      // Transaction was cleared (user clicked Back) - reset the ref so next transaction triggers reset
      console.log('🔄 Transaction cleared, resetting lastTransactionIdRef');
      lastTransactionIdRef.current = null;
    }
  }, [transaction]);

  // Stable polling function using useCallback to prevent re-creation
  const startPolling = useCallback(async (transactionId: string) => {
    if (!onPollPushStatus || !mfaContextId || !onPushVerify) {
      console.log('❌ Missing polling callbacks or context');
      return;
    }

    // Prevent duplicate polling for the same transaction
    if (pollingStartedRef.current) {
      console.log('⚠️ Polling already started for this transaction, skipping');
      return;
    }

    console.log('🚀 Starting polling for transaction:', transactionId);
    pollingStartedRef.current = true;

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(async () => {
      try {
        const response = await onPollPushStatus(mfaContextId, transactionId);

        // Handle different response types from POST /mfa/transaction/{transaction_id}
        if (response.response_type_code === 'SUCCESS') {
          console.log('🟢 Push notification approved - MFA SUCCESS');
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          pollingStartedRef.current = false;
          // We already have the tokens in the response, pass them directly to success handler
          if (onMfaSuccess) {
            await onMfaSuccess(response);
          }
          return;
        } else if (response.response_type_code === 'MFA_PENDING') {
          console.log('⏳ Push still pending, continuing to poll...');

          // Update timer based on backend expiry time
          if (response.expires_at) {
            const expiryTime = new Date(response.expires_at).getTime();
            const currentTime = new Date().getTime();
            const timeRemainingMs = expiryTime - currentTime;
            const timeRemainingSec = Math.max(0, Math.ceil(timeRemainingMs / 1000));

            console.log('⏱️ Timer update from backend:', timeRemainingSec, 'seconds remaining');
            setBackendTimeLeft(timeRemainingSec);
            setTimeLeft(timeRemainingSec);

            if (currentTime >= expiryTime) {
              console.log('⏰ Push notification expired');
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
              pollingStartedRef.current = false;
              setIsExpired(true);
              setTimeLeft(0);
              return;
            }
          }
          // Continue polling
          return;
        } else if (response.response_type_code === 'ESIGN_REQUIRED') {
          console.log('📝 eSign required after MFA');
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          pollingStartedRef.current = false;
          // Let parent component handle eSign flow
          if (onMfaSuccess) {
            await onMfaSuccess(response);
          }
          return;
        } else if (response.response_type_code === 'DEVICE_BIND_REQUIRED') {
          console.log('📱 Device binding required after MFA');
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          pollingStartedRef.current = false;
          // Let parent component handle device binding flow
          if (onMfaSuccess) {
            await onMfaSuccess(response);
          }
          return;
        }
      } catch (error: any) {
        console.error('Failed to poll push status:', error);

        // Handle terminal states - transaction expired or rejected
        if (error.code === 410 || error.code === 'TRANSACTION_EXPIRED' || error.code === 'PUSH_REJECTED') {
          console.log('🔴 Push transaction expired or rejected');
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          pollingStartedRef.current = false;

          if (error.code === 'PUSH_REJECTED') {
            setPushStatus('rejected');
            // Let error display for 2 seconds, then force login restart
            // Store timeout ID so user can cancel it by clicking Back button
            autoCloseTimeoutRef.current = setTimeout(() => {
              console.log('🔴 Push rejected - auto-closing after 2 seconds');
              onCancel(); // This will close dialog and reset to login
            }, 2000);
          } else {
            setIsExpired(true);
          }
          setTimeLeft(0);
          return;
        }
        // For other errors, continue polling (network issues, etc.)
      }
    }, 1000); // Poll every second
  }, [onPollPushStatus, mfaContextId, onPushVerify, onMfaSuccess]);

  // Start polling when push transaction begins
  useEffect(() => {
    // Don't start polling if already rejected or expired
    if (isPushWaiting && transaction?.transaction_id && !intervalRef.current && !pollingStartedRef.current && pushStatus !== 'rejected' && !isExpired) {
      console.log('🔄 Push transaction detected, starting polling:', transaction.transaction_id);
      startPolling(transaction.transaction_id);
    }

    // Cleanup polling interval when dependencies change or unmount
    return () => {
      if (intervalRef.current) {
        console.log('🧹 Cleaning up polling interval');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        pollingStartedRef.current = false;
      }
    };
  }, [isPushWaiting, transaction, pushStatus, isExpired, startPolling]); // Depend on entire transaction object and terminal states

  // Separate cleanup effect for auto-close timeout - only on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimeoutRef.current) {
        console.log('🧹 Cleaning up auto-close timeout on unmount');
        clearTimeout(autoCloseTimeoutRef.current);
        autoCloseTimeoutRef.current = null;
      }
    };
  }, []); // Empty deps = only runs on mount/unmount

  // Show Retry Push button after 2 seconds
  useEffect(() => {
    // Only set timeout when button is not already shown
    if (isPushWaiting && !isExpired && pushStatus !== 'rejected' && !showRetryPush) {
      console.log('⏰ Setting 2-second timeout for Retry Push button');
      retryPushTimeoutRef.current = setTimeout(() => {
        console.log('⏰ 2 seconds elapsed - showing Retry Push button');
        setShowRetryPush(true);
      }, 2000);
    }

    return () => {
      if (retryPushTimeoutRef.current) {
        clearTimeout(retryPushTimeoutRef.current);
        retryPushTimeoutRef.current = null;
      }
    };
  }, [isPushWaiting, isExpired, pushStatus, showRetryPush, transaction?.transaction_id]);

  // Debug logging
  console.log('MfaMethodSelectionDialog render:', {
    open,
    availableMethods,
    isLoading,
    error,
    transaction,
    isMethodSelection,
    isOtpEntry,
    isPushWaiting,
    timeLeft,
    isExpired
  });

  const handleMethodSelect = (method: 'sms' | 'voice' | 'push') => {
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
      setOtpFailedAndWaitingForRedirect(false);
      await onOtpVerify(otp);
      // Success will be handled by onMfaSuccess callback
    } catch (error: any) {
      setOtpError(error.message || 'Invalid verification code. Please try again.');
      setOtp('');

      // If this is an invalid OTP error, the parent component has a 2-second timeout to redirect
      // Stop the timer and show Back button for user control
      if (error.code === 'INVALID_MFA_CODE') {
        setOtpFailedAndWaitingForRedirect(true);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleOtpKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && otp.length === 4 && !verifying) {
      handleOtpVerify();
    }
  };

  const handleRetryOtp = async () => {
    if (!transaction || !onMethodSelected || retryingOtp) return;

    try {
      setRetryingOtp(true);
      console.log('🔄 Retrying OTP for method:', transaction.method);
      await onMethodSelected(transaction.method as 'sms' | 'voice');

      // Manually reset timer states since backend may return same transaction_id
      setTimeLeft(10);
      setBackendTimeLeft(10);
      setIsExpired(false);
      setOtp('');
      setOtpError(null);
      console.log('✅ Timer reset after OTP retry');
    } catch (error: any) {
      console.error('Failed to retry OTP:', error);
    } finally {
      setRetryingOtp(false);
    }
  };

  const handleRetryPush = async () => {
    if (!transaction || !onMethodSelected || retryingPush) return;

    try {
      setRetryingPush(true);
      console.log('🔄 Retrying Push notification');

      // Reset states for new push attempt
      setShowRetryPush(false);
      setIsExpired(false);
      setTimeLeft(10);
      setBackendTimeLeft(10);
      setPushStatus(null);

      // Reset polling flag to allow new polling
      pollingStartedRef.current = false;

      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Initiate new push challenge
      await onMethodSelected('push');
      console.log('✅ Push retry initiated');
    } catch (error: any) {
      console.error('Failed to retry Push:', error);
    } finally {
      setRetryingPush(false);
    }
  };

  const getMethodInfo = (method: 'sms' | 'voice' | 'push') => {
    switch (method) {
      case 'sms':
        return {
          icon: <SecurityIcon />,
          title: 'Text Message (SMS)',
          description: 'Receive a 4-digit verification code via SMS',
          testHint: 'Use code 1234 for testing'
        };
      case 'voice':
        return {
          icon: <SecurityIcon />,
          title: 'Voice Call',
          description: 'Receive a 4-digit verification code via voice call',
          testHint: 'Use code 1234 for testing'
        };
      case 'push':
        return {
          icon: <PhoneIcon />,
          title: 'Push Notification',
          description: 'Select the displayed number on your mobile device when prompted',
          testHint: 'Test users: mfauser(auto-approve), pushfail(auto-reject), pushexpired(timeout)'
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
        {/* Timer - hide when OTP failed and waiting for redirect */}
        {!otpFailedAndWaitingForRedirect && (
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
        )}

        {/* Retry OTP button - show always except when invalid OTP error with Back button */}
        {!otpFailedAndWaitingForRedirect && (
          <Box sx={{ mb: 2, textAlign: 'center' }}>
            <Button
              size="small"
              variant="text"
              onClick={handleRetryOtp}
              disabled={retryingOtp || verifying}
              startIcon={retryingOtp ? <CircularProgress size={16} /> : undefined}
            >
              {retryingOtp ? 'Resending...' : 'Retry OTP'}
            </Button>
          </Box>
        )}

        {(otpError || error) && !isExpired && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {otpError || error}
            {otpFailedAndWaitingForRedirect && (
              <Box sx={{ mt: 2 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    console.log('🔙 User clicked Back from invalid OTP - returning to login');
                    // Immediately close dialog and return to login
                    handleCancel();
                  }}
                >
                  Back
                </Button>
              </Box>
            )}
          </Alert>
        )}

        {isExpired && !otpError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Verification code has expired. Please login again.
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
          onClick={onBackToMethodSelection || handleCancel}
          disabled={verifying}
          color="inherit"
        >
          {onBackToMethodSelection ? 'Back' : 'Cancel'}
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

  // Render push notification display content - shows single number, user selects on mobile
  const renderPushWaiting = () => {
    const displayNumber = transaction?.display_number;
    const hasDisplayNumber = displayNumber !== undefined;
    const isAutoMode = username && ['mfauser', 'pushfail', 'pushexpired'].includes(username);

    return (
      <>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              <PhoneIcon />
            </Avatar>
            <Box>
              <Typography variant="h6" component="div">
                Push Notification - Mobile Selection
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {hasDisplayNumber ? 'Find this number on your mobile device and tap it' : 'Generating number...'}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent>
          {/* Timer - only show when not expired and not rejected */}
          {!isExpired && pushStatus !== 'rejected' && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Time remaining: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={Math.max(0, Math.min(100, ((10 - timeLeft) / 10) * 100))}
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>
          )}

          {/* Retry Push button - show after 2 seconds */}
          {showRetryPush && !isExpired && pushStatus !== 'rejected' && (
            <Box sx={{ mb: 2, textAlign: 'center' }}>
              <Button
                size="small"
                variant="text"
                onClick={handleRetryPush}
                disabled={retryingPush}
                startIcon={retryingPush ? <CircularProgress size={16} /> : undefined}
              >
                {retryingPush ? 'Retrying...' : 'Retry Push'}
              </Button>
            </Box>
          )}

          {error && !isExpired && (
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
                      // Switch to SMS method
                      if (onMethodSelected) {
                        try {
                          await onMethodSelected('sms');
                        } catch (error) {
                          console.error('Failed to switch to SMS:', error);
                        }
                      }
                    }}
                  >
                    Use SMS Instead
                  </Button>
                </Box>
              )}
            </Alert>
          )}

          {pushStatus === 'rejected' && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Push notification was rejected. You selected an incorrect number on your mobile device.
              <Box sx={{ mt: 2 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    console.log('🔙 User clicked Back - cancelling auto-close and returning to MFA selection');
                    // Cancel the auto-close timeout
                    if (autoCloseTimeoutRef.current) {
                      clearTimeout(autoCloseTimeoutRef.current);
                      autoCloseTimeoutRef.current = null;
                    }
                    // Immediately close dialog - backend will invalidate transaction when user creates new one
                    handleCancel();
                  }}
                >
                  Back
                </Button>
              </Box>
            </Alert>
          )}

          {isExpired && pushStatus !== 'rejected' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Push notification has expired.
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={async () => {
                    // Restart Push flow by reinitiating challenge
                    console.log('🔄 Restarting Push after expiration - resetting all states');
                    // Reset all states first
                    setIsExpired(false);
                    setTimeLeft(10);
                    setBackendTimeLeft(10);
                    setPushStatus(null);
                    // CRITICAL: Reset polling flag to allow new polling to start
                    pollingStartedRef.current = false;
                    // Clear any existing interval
                    if (intervalRef.current) {
                      clearInterval(intervalRef.current);
                      intervalRef.current = null;
                    }
                    // Then reinitiate Push challenge
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
                    // Switch to SMS method - reset all states
                    console.log('🔄 Switching from expired Push to SMS');
                    setIsExpired(false);
                    setTimeLeft(10);
                    setBackendTimeLeft(10);
                    setPushStatus(null);
                    if (onMethodSelected) {
                      try {
                        await onMethodSelected('sms');
                      } catch (error) {
                        console.error('Failed to switch to SMS:', error);
                      }
                    }
                  }}
                >
                  Use SMS Instead
                </Button>
              </Box>
            </Alert>
          )}

          <Box sx={{ textAlign: 'center', py: 4 }}>
            {pushStatus === 'rejected' ? (
              <Box>
                <CancelIcon
                  sx={{
                    fontSize: 60,
                    color: 'error.main',
                    mb: 2
                  }}
                />
                <Typography variant="body1" gutterBottom>
                  Push notification rejected
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  You selected an incorrect number on your mobile device
                </Typography>
              </Box>
            ) : isExpired ? (
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
            ) : !hasDisplayNumber ? (
              <Box>
                <CircularProgress size={60} sx={{ mb: 2 }} />
                <Typography variant="body1" gutterBottom>
                  Generating number...
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Please wait while we prepare your push notification
                </Typography>
              </Box>
            ) : (
              <Box>
                <Typography variant="body1" gutterBottom sx={{ mb: 3 }}>
                  Your mobile device will show 3 numbers. Find and tap this number:
                </Typography>

                {/* Single display number (non-clickable) */}
                <Box sx={{ mb: 4 }}>
                  <Typography
                    variant="h1"
                    sx={{
                      fontSize: '6rem',
                      fontWeight: 'bold',
                      color: 'primary.main',
                      textAlign: 'center',
                      border: '3px solid',
                      borderColor: 'primary.main',
                      borderRadius: 3,
                      py: 2,
                      px: 4,
                      minWidth: 120,
                      display: 'inline-block',
                      backgroundColor: 'background.paper'
                    }}
                  >
                    {displayNumber}
                  </Typography>
                </Box>

                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                  Look for this number on your mobile push notification and tap it to proceed.
                </Typography>

                {/* Auto-mode information */}
                {isAutoMode && (
                  <Typography variant="body2" color="textSecondary" sx={{ mt: 2, fontStyle: 'italic' }}>
                    {username === 'mfauser' && 'Test mode: Will auto-approve after 5 seconds'}
                    {username === 'pushfail' && 'Test mode: Will auto-reject after 7 seconds'}
                    {username === 'pushexpired' && 'Test mode: Will timeout after 10 seconds'}
                  </Typography>
                )}

                {/* Waiting animation */}
                <Box sx={{ mt: 3 }}>
                  <CircularProgress size={40} sx={{ mb: 1 }} />
                  <Typography variant="body2" color="textSecondary">
                    Waiting for mobile device selection...
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 3 }}>
          <Button
            onClick={onBackToMethodSelection || handleCancel}
            color="inherit"
          >
            {onBackToMethodSelection ? 'Back' : 'Cancel'}
          </Button>
        </DialogActions>
      </>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={submitting || verifying}
      disableEnforceFocus={true}
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