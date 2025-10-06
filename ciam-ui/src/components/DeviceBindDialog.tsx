import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  PhoneAndroid as DeviceIcon,
  Security as TrustIcon,
} from '@mui/icons-material';

export interface DeviceBindDialogProps {
  open: boolean;
  username: string;
  deviceFingerprint: string;
  onTrust: () => Promise<void>;
  onCancel: () => void;
}

export const DeviceBindDialog: React.FC<DeviceBindDialogProps> = ({
  open,
  username,
  deviceFingerprint,
  onTrust,
  onCancel,
}) => {
  const [isBinding, setIsBinding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTrust = async () => {
    if (isBinding) return;

    try {
      setIsBinding(true);
      setError(null);
      await onTrust();
    } catch (err: any) {
      setError(err.message || 'Failed to trust device');
    } finally {
      setIsBinding(false);
    }
  };

  const handleCancel = () => {
    if (isBinding) return;
    setError(null);
    onCancel();
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isBinding}
      disableEnforceFocus={true}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <TrustIcon color="primary" />
          <Typography variant="h6" component="span">
            Trust This Device?
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" gutterBottom>
            Would you like to trust this device for future logins?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            If you trust this device, you won't need to complete multi-factor authentication on your next login.
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: 2,
            bgcolor: 'action.hover',
            borderRadius: 1,
            mt: 2,
          }}
        >
          <DeviceIcon color="primary" fontSize="large" />
          <Box>
            <Typography variant="body2" fontWeight="medium">
              Current Device
            </Typography>
            <Typography variant="caption" color="text.secondary">
              User: {username}
            </Typography>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button
          onClick={handleCancel}
          disabled={isBinding}
          color="inherit"
        >
          Not Now
        </Button>
        <Button
          onClick={handleTrust}
          disabled={isBinding}
          variant="contained"
          color="primary"
          startIcon={isBinding ? <CircularProgress size={16} /> : <TrustIcon />}
        >
          {isBinding ? 'Trusting Device...' : 'Trust Device'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
