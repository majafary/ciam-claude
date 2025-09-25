import React, { useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  DevicesOther as DeviceIcon,
  Delete as DeleteIcon,
  Computer as ComputerIcon,
  PhoneAndroid as PhoneIcon,
  Tablet as TabletIcon,
} from '@mui/icons-material';
import { useSession } from '../hooks/useSession';
import { SessionManagerProps, SessionInfo } from '../types';

export const SessionManager: React.FC<SessionManagerProps> = ({
  onSessionRevoked,
  showDeviceInfo = true,
  allowSignOutAll = true,
  maxSessions = 10,
}) => {
  const {
    sessions,
    currentSession,
    isLoading,
    error,
    loadSessions,
    revokeSession,
    revokeAllOtherSessions,
  } = useSession();

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await revokeSession(sessionId);
      onSessionRevoked?.(sessionId);
    } catch (error) {
      console.error('Failed to revoke session:', error);
    }
  };

  const handleRevokeAllOthers = async () => {
    try {
      await revokeAllOtherSessions();

      // Calculate how many sessions were revoked
      const otherSessionsCount = sessions.length - 1;
      if (otherSessionsCount > 0) {
        console.log(`Revoked ${otherSessionsCount} other sessions`);
      }
    } catch (error) {
      console.error('Failed to revoke other sessions:', error);
    }
  };

  const getDeviceIcon = (userAgent?: string) => {
    if (!userAgent) return <DeviceIcon />;

    if (userAgent.includes('Mobile') || userAgent.includes('iPhone') || userAgent.includes('Android')) {
      return <PhoneIcon />;
    }

    if (userAgent.includes('iPad') || userAgent.includes('Tablet')) {
      return <TabletIcon />;
    }

    return <ComputerIcon />;
  };

  const formatLastSeen = (lastSeenAt: string): string => {
    const lastSeen = new Date(lastSeenAt);
    const now = new Date();
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }
  };

  const getSessionTitle = (session: SessionInfo): string => {
    if (session.deviceId) {
      return session.deviceId.replace(/^[^-]+-/, '').replace(/-\w+$/, '') || 'Unknown Device';
    }

    if (session.userAgent) {
      if (session.userAgent.includes('Chrome')) return 'Chrome Browser';
      if (session.userAgent.includes('Safari')) return 'Safari Browser';
      if (session.userAgent.includes('Firefox')) return 'Firefox Browser';
      if (session.userAgent.includes('Edge')) return 'Edge Browser';
    }

    return 'Unknown Device';
  };

  if (isLoading && sessions.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Active Sessions
      </Typography>

      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        These are the devices and browsers where your account is currently signed in.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {sessions.length > 0 && allowSignOutAll && (
        <Box sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            color="warning"
            onClick={handleRevokeAllOthers}
            disabled={isLoading || sessions.length <= 1}
          >
            Sign Out All Other Devices ({sessions.length - 1})
          </Button>
        </Box>
      )}

      {sessions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body2" color="textSecondary">
            No active sessions found.
          </Typography>
        </Box>
      ) : (
        <List>
          {sessions.slice(0, maxSessions).map((session, index) => {
            const isCurrentSession = session.sessionId === currentSession?.sessionId;

            return (
              <React.Fragment key={session.sessionId}>
                <ListItem>
                  <Box sx={{ mr: 2 }}>
                    {getDeviceIcon(session.userAgent)}
                  </Box>

                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle2">
                          {getSessionTitle(session)}
                        </Typography>
                        {isCurrentSession && (
                          <Chip
                            label="Current"
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2" color="textSecondary">
                          Last active: {formatLastSeen(session.lastSeenAt)}
                        </Typography>

                        {showDeviceInfo && (
                          <Box sx={{ mt: 0.5 }}>
                            {session.location && (
                              <Typography variant="caption" color="textSecondary">
                                📍 {session.location}
                              </Typography>
                            )}
                            {session.ip && (
                              <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>
                                IP: {session.ip}
                              </Typography>
                            )}
                          </Box>
                        )}
                      </Box>
                    }
                  />

                  <ListItemSecondaryAction>
                    {!isCurrentSession && (
                      <IconButton
                        edge="end"
                        aria-label="revoke session"
                        onClick={() => handleRevokeSession(session.sessionId)}
                        disabled={isLoading}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    )}
                  </ListItemSecondaryAction>
                </ListItem>

                {index < sessions.length - 1 && <Divider />}
              </React.Fragment>
            );
          })}
        </List>
      )}

      {sessions.length > maxSessions && (
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="textSecondary">
            Showing {maxSessions} of {sessions.length} sessions.
          </Typography>
          <Button size="small" onClick={loadSessions}>
            Show All
          </Button>
        </Box>
      )}

      <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="textSecondary">
          If you notice any suspicious activity, sign out of all devices and change your password.
        </Typography>
      </Box>
    </Paper>
  );
};