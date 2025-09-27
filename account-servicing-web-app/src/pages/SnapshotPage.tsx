import React, { useEffect, useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  AccountBalance,
  CreditCard,
  TrendingUp,
  Security,
  History,
  CheckCircle,
  Warning,
} from '@mui/icons-material';
import { useAuth } from 'ciam-ui';

interface AccountSnapshot {
  accountNumber: string;
  accountType: string;
  balance: number;
  availableCredit: number;
  creditLimit: number;
  lastLogin: string;
  accountStatus: 'active' | 'locked' | 'pending';
  mfaEnabled: boolean;
  recentTransactions: Transaction[];
  securityScore: number;
  alerts: AccountAlert[];
}

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: 'credit' | 'debit';
  category: string;
}

interface AccountAlert {
  id: string;
  type: 'info' | 'warning' | 'error';
  message: string;
  date: string;
}

const SnapshotPage: React.FC = () => {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccountSnapshot = async () => {
      try {
        setLoading(true);

        // Mock data - in real implementation, this would call the CIAM backend
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call

        const mockSnapshot: AccountSnapshot = {
          accountNumber: '****-****-****-1234',
          accountType: 'Premium Checking',
          balance: 12547.83,
          availableCredit: 8500.00,
          creditLimit: 10000.00,
          lastLogin: new Date().toISOString(),
          accountStatus: 'active',
          mfaEnabled: true,
          securityScore: 92,
          recentTransactions: [
            {
              id: '1',
              description: 'Online Purchase - Amazon.com',
              amount: -89.99,
              date: '2023-12-01T10:30:00Z',
              type: 'debit',
              category: 'Shopping'
            },
            {
              id: '2',
              description: 'Payroll Deposit',
              amount: 3250.00,
              date: '2023-11-30T08:00:00Z',
              type: 'credit',
              category: 'Income'
            },
            {
              id: '3',
              description: 'Grocery Store Purchase',
              amount: -156.42,
              date: '2023-11-29T18:15:00Z',
              type: 'debit',
              category: 'Groceries'
            },
          ],
          alerts: [
            {
              id: '1',
              type: 'info',
              message: 'Your monthly statement is ready for download',
              date: '2023-12-01T09:00:00Z'
            },
            {
              id: '2',
              type: 'warning',
              message: 'Credit utilization is at 15% - consider paying down balance',
              date: '2023-11-28T14:00:00Z'
            }
          ]
        };

        setSnapshot(mockSnapshot);
      } catch (err) {
        setError('Failed to load account snapshot. Please try again later.');
        console.error('Error fetching account snapshot:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAccountSnapshot();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 4 }}>
          <LinearProgress />
          <Typography variant="h4" sx={{ mt: 2, mb: 1 }}>
            Loading Account Snapshot...
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Please wait while we gather your account information.
          </Typography>
        </Box>
      </Container>
    );
  }

  if (error || !snapshot) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">
          {error || 'Unable to load account information.'}
        </Alert>
      </Container>
    );
  }

  const creditUtilization = ((snapshot.creditLimit - snapshot.availableCredit) / snapshot.creditLimit) * 100;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          Account Snapshot
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Welcome back, {user?.given_name || user?.preferred_username}. Here's your current account overview.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Account Summary Cards */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <AccountBalance color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Account Balance</Typography>
              </Box>
              <Typography variant="h4" color="primary">
                {formatCurrency(snapshot.balance)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {snapshot.accountType} • {snapshot.accountNumber}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <CreditCard color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Available Credit</Typography>
              </Box>
              <Typography variant="h4" color="primary">
                {formatCurrency(snapshot.availableCredit)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {creditUtilization.toFixed(1)}% utilization
              </Typography>
              <LinearProgress
                variant="determinate"
                value={creditUtilization}
                sx={{ mt: 1 }}
                color={creditUtilization > 30 ? 'warning' : 'primary'}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Security color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Security Score</Typography>
              </Box>
              <Typography variant="h4" color="primary">
                {snapshot.securityScore}%
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, gap: 1 }}>
                <Chip
                  label={snapshot.accountStatus.toUpperCase()}
                  color={snapshot.accountStatus === 'active' ? 'success' : 'warning'}
                  size="small"
                />
                {snapshot.mfaEnabled && (
                  <Chip
                    label="MFA"
                    color="success"
                    size="small"
                    icon={<CheckCircle />}
                  />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Transactions */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <History color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Recent Transactions</Typography>
              </Box>
              <List>
                {snapshot.recentTransactions.map((transaction, index) => (
                  <React.Fragment key={transaction.id}>
                    <ListItem>
                      <ListItemIcon>
                        <TrendingUp
                          color={transaction.type === 'credit' ? 'success' : 'action'}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={transaction.description}
                        secondary={`${transaction.category} • ${formatDate(transaction.date)}`}
                      />
                      <Typography
                        variant="body1"
                        color={transaction.type === 'credit' ? 'success.main' : 'text.primary'}
                        fontWeight="bold"
                      >
                        {transaction.type === 'credit' ? '+' : ''}{formatCurrency(transaction.amount)}
                      </Typography>
                    </ListItem>
                    {index < snapshot.recentTransactions.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Alerts & Notifications */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Warning color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Alerts</Typography>
              </Box>
              {snapshot.alerts.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {snapshot.alerts.map((alert) => (
                    <Alert
                      key={alert.id}
                      severity={alert.type}
                      sx={{ fontSize: '0.875rem' }}
                    >
                      {alert.message}
                      <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                        {formatDate(alert.date)}
                      </Typography>
                    </Alert>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No alerts at this time.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Account Information */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Account Information
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Account Number
                </Typography>
                <Typography variant="body1">
                  {snapshot.accountNumber}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Account Type
                </Typography>
                <Typography variant="body1">
                  {snapshot.accountType}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Credit Limit
                </Typography>
                <Typography variant="body1">
                  {formatCurrency(snapshot.creditLimit)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Last Login
                </Typography>
                <Typography variant="body1">
                  {formatDate(snapshot.lastLogin)}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default SnapshotPage;