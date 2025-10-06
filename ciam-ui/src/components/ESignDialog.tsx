import React, { useState, useEffect } from 'react';
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
  Divider,
  TextField,
} from '@mui/material';
import {
  Description as DocumentIcon,
  CheckCircle as AcceptIcon,
  Cancel as DeclineIcon,
} from '@mui/icons-material';
import { ESignComponentProps } from '../types';
import { AuthService } from '../services/AuthService';

interface ESignDialogProps extends ESignComponentProps {
  authService: AuthService;
  onExited?: () => void;
}

export const ESignDialog: React.FC<ESignDialogProps> = ({
  open,
  documentId,
  transactionId,
  mandatory,
  onAccept,
  onDecline,
  isLoading = false,
  error = null,
  authService,
  onExited,
}) => {
  const [documentContent, setDocumentContent] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState<string>('');
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineInput, setShowDeclineInput] = useState(false);

  // Fetch document when dialog opens
  useEffect(() => {
    if (open && documentId && !documentContent) {
      fetchDocument();
    }
  }, [open, documentId]);

  const fetchDocument = async () => {
    try {
      setLoadingDocument(true);
      setDocumentError(null);
      const doc = await authService.getESignDocument(documentId);
      setDocumentContent(doc.content);
      setDocumentTitle(doc.title);
    } catch (err: any) {
      setDocumentError(err.message || 'Failed to load document');
    } finally {
      setLoadingDocument(false);
    }
  };

  const handleAccept = async () => {
    if (accepting) return;

    try {
      setAccepting(true);
      await onAccept();
    } catch (err: any) {
      // Error handling in parent component
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (mandatory) {
      setShowDeclineInput(true);
      return;
    }

    try {
      setDeclining(true);
      await onDecline(declineReason);
    } catch (err: any) {
      // Error handling in parent component
    } finally {
      setDeclining(false);
    }
  };

  const handleConfirmDecline = async () => {
    try {
      setDeclining(true);
      await onDecline(declineReason || 'User declined mandatory terms');
      setShowDeclineInput(false);
    } catch (err: any) {
      // Error handling in parent component
    } finally {
      setDeclining(false);
    }
  };

  const handleCancelDecline = () => {
    setShowDeclineInput(false);
    setDeclineReason('');
  };

  const isProcessing = accepting || declining || loadingDocument;

  return (
    <Dialog
      open={open}
      maxWidth="md"
      fullWidth
      disableEscapeKeyDown={mandatory || isProcessing}
      disableEnforceFocus={true}
      sx={{
        zIndex: 1400,
      }}
      onClose={mandatory ? undefined : () => {}}
      TransitionProps={{
        onExited: onExited,
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <DocumentIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Box>
            <Typography variant="h6" component="div">
              {documentTitle || 'Terms and Conditions'}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {mandatory
                ? 'Please review and accept to continue'
                : 'Optional agreement for enhanced features'}
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ py: 3 }}>
        {(error || documentError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error || documentError}
          </Alert>
        )}

        {mandatory && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              This agreement is mandatory
            </Typography>
            <Typography variant="body2">
              You must accept these terms to continue using the service.
            </Typography>
          </Alert>
        )}

        {loadingDocument ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography variant="body2" color="textSecondary">
              Loading document...
            </Typography>
          </Box>
        ) : showDeclineInput ? (
          <Box>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                Are you sure you want to decline?
              </Typography>
              <Typography variant="body2">
                {mandatory
                  ? 'Declining will prevent you from accessing the service. You will be logged out.'
                  : 'You can accept these terms later to enable additional features.'}
              </Typography>
            </Alert>

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Reason for declining (optional)"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Please provide a reason for declining..."
              disabled={declining}
              sx={{ mt: 2 }}
            />
          </Box>
        ) : documentContent ? (
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              p: 3,
              maxHeight: 400,
              overflowY: 'auto',
              backgroundColor: 'background.paper',
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: documentContent }} />
          </Box>
        ) : null}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 3, gap: 1 }}>
        {showDeclineInput ? (
          <>
            <Button
              onClick={handleCancelDecline}
              disabled={declining}
              color="inherit"
            >
              Back
            </Button>
            <Button
              onClick={handleConfirmDecline}
              variant="outlined"
              color="error"
              disabled={declining}
              startIcon={declining ? <CircularProgress size={20} /> : <DeclineIcon />}
            >
              {declining ? 'Declining...' : 'Confirm Decline'}
            </Button>
          </>
        ) : (
          <>
            {!mandatory && (
              <Button
                onClick={handleDecline}
                disabled={isProcessing}
                color="inherit"
                startIcon={<DeclineIcon />}
              >
                Decline
              </Button>
            )}
            {mandatory && (
              <Button
                onClick={handleDecline}
                disabled={isProcessing}
                color="error"
                variant="outlined"
                startIcon={<DeclineIcon />}
              >
                Decline & Logout
              </Button>
            )}
            <Button
              onClick={handleAccept}
              variant="contained"
              disabled={isProcessing || loadingDocument}
              startIcon={accepting ? <CircularProgress size={20} /> : <AcceptIcon />}
              sx={{ minWidth: 120 }}
            >
              {accepting ? 'Accepting...' : 'Accept & Continue'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};
