import { Request, Response } from 'express';
import { generateAccessToken, generateRefreshToken, verifyToken, generateJWKS } from '../utils/jwt-simple';

// ============================================================================
// IN-MEMORY STORAGE (Mock Database - Production would use Redis/PostgreSQL)
// ============================================================================

// Push Challenge Storage
interface PushChallenge {
  transactionId: string;
  numbers: number[];
  correctNumber: number;
  username: string;
  createdAt: number;
  attempts: number;
}

// Device Trust Storage with Expiry
interface DeviceTrust {
  deviceFingerprint: string;
  username: string;
  trustedAt: number;
  lastUsed: number;
  expiresAt: number; // Trust expiry timestamp
  trustDurationDays: number; // Default 30 days
}

// eSign Document Storage
interface ESignDocument {
  documentId: string;
  title: string;
  content: string;
  version: string;
  mandatory: boolean;
  createdAt: Date;
}

// eSign Acceptance Tracking
interface ESignAcceptance {
  documentId: string;
  username: string;
  acceptedAt: Date;
  ip?: string;
}

// Pending eSign Requirement Storage (tracks who needs to sign what)
interface PendingESign {
  username: string;
  documentId: string;
  mandatory: boolean;
  reason: 'first_login' | 'compliance' | 'policy_update';
}

const pushChallenges = new Map<string, PushChallenge>();
const deviceTrusts = new Map<string, DeviceTrust>(); // key: deviceFingerprint
const esignDocuments = new Map<string, ESignDocument>();
const esignAcceptances = new Map<string, ESignAcceptance>(); // key: username-documentId
const pendingESigns = new Map<string, PendingESign>(); // key: username
const userLoginTimes = new Map<string, { lastLogin: Date | null; currentLogin: Date }>();

// ============================================================================
// MOCK eSign DOCUMENTS
// ============================================================================

// Initialize mock eSign documents
const initializeESignDocuments = () => {
  esignDocuments.set('terms-v1-2025', {
    documentId: 'terms-v1-2025',
    title: 'Terms of Service - 2025',
    content: `
      <h1>Terms of Service Agreement</h1>
      <p>Last Updated: January 1, 2025</p>

      <h2>1. Acceptance of Terms</h2>
      <p>By accessing and using our services, you accept and agree to be bound by the terms and provision of this agreement.</p>

      <h2>2. Use License</h2>
      <p>Permission is granted to temporarily access our services for personal, non-commercial use only.</p>

      <h2>3. Privacy Policy</h2>
      <p>Your use of our service is also governed by our Privacy Policy.</p>

      <h2>4. Account Security</h2>
      <p>You are responsible for maintaining the security of your account and password.</p>

      <p><strong>By clicking "Accept", you agree to these terms and conditions.</strong></p>
    `,
    version: 'v1.0',
    mandatory: true,
    createdAt: new Date('2025-01-01')
  });
};

// Initialize documents on startup
initializeESignDocuments();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Generate 3 random numbers for push challenge
const generatePushNumbers = (): { numbers: number[], correctNumber: number } => {
  const numbers = [
    Math.floor(Math.random() * 9) + 1,
    Math.floor(Math.random() * 9) + 1,
    Math.floor(Math.random() * 9) + 1
  ];
  const correctNumber = numbers[Math.floor(Math.random() * 3)];
  return { numbers, correctNumber };
};

// Convert DRS action token to device fingerprint (simulates Transmit Security DRS)
const convertActionTokenToFingerprint = (actionToken: string): string => {
  const hash = actionToken.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return `device_${Math.abs(hash)}_${Date.now().toString(36)}`;
};

// Check if device is trusted and not expired
const isDeviceTrusted = (deviceFingerprint: string, username: string): boolean => {
  const trust = deviceTrusts.get(deviceFingerprint);
  if (!trust || trust.username !== username) {
    return false;
  }

  // Check if trust has expired
  const now = Date.now();
  if (now > trust.expiresAt) {
    console.log('🔒 Device trust expired:', { deviceFingerprint, username, expiredAt: new Date(trust.expiresAt) });
    return false;
  }

  return true;
};

// Check if device trust is expired (for specific error message)
const isDeviceTrustExpired = (deviceFingerprint: string, username: string): boolean => {
  const trust = deviceTrusts.get(deviceFingerprint);
  if (!trust || trust.username !== username) {
    return false;
  }

  const now = Date.now();
  return now > trust.expiresAt;
};

// Trust a device with expiry
// Default: 3650 days (10 years) = effectively non-expiring for practical purposes
const trustDevice = (deviceFingerprint: string, username: string, trustDurationDays: number = 3650): void => {
  const now = Date.now();
  const expiresAt = now + (trustDurationDays * 24 * 60 * 60 * 1000); // Convert days to ms

  deviceTrusts.set(deviceFingerprint, {
    deviceFingerprint,
    username,
    trustedAt: now,
    lastUsed: now,
    expiresAt,
    trustDurationDays
  });

  console.log('🔐 Device trusted:', {
    deviceFingerprint,
    username,
    expiresAt: new Date(expiresAt),
    trustDurationDays
  });
};

// Simulate risk detection (checks for unusual patterns)
const detectRisk = (username: string, deviceFingerprint?: string): boolean => {
  // For other users, could check:
  // - New device
  // - New location (would come from IP geolocation)
  // - Unusual time of day
  // - Multiple failed attempts recently

  return false;
};

// Update login timestamps
const updateLoginTime = (username: string): void => {
  const now = new Date();
  const existing = userLoginTimes.get(username);

  userLoginTimes.set(username, {
    lastLogin: existing?.currentLogin || null,
    currentLogin: now
  });
};

// Check if user needs eSign
const getPendingESign = (username: string): PendingESign | null => {
  return pendingESigns.get(username) || null;
};

// Mark eSign as completed
const completeESign = (username: string, documentId: string, ip?: string): void => {
  const key = `${username}-${documentId}`;
  esignAcceptances.set(key, {
    documentId,
    username,
    acceptedAt: new Date(),
    ip
  });

  // Remove from pending
  pendingESigns.delete(username);

  console.log('📝 eSign completed:', { username, documentId, ip });
};

// Check if user has accepted a document
const hasAcceptedDocument = (username: string, documentId: string): boolean => {
  const key = `${username}-${documentId}`;
  return esignAcceptances.has(key);
};

// ============================================================================
// TEST USER CONFIGURATION
// ============================================================================

// User scenarios configuration
const USER_SCENARIOS: Record<string, {
  password: string;
  scenario: 'success' | 'mfa_required' | 'trusted' | 'esign_required' | 'locked' | 'mfa_locked' | 'invalid';
  mfaBehavior?: 'normal' | 'push_fail' | 'push_expired';
  esignBehavior?: 'accept' | 'decline' | 'first_login' | 'compliance';
  trustBehavior?: 'normal' | 'expired' | 'corrupt';
  riskLevel?: 'low' | 'high';
  isFirstLogin?: boolean;
  adminReset?: boolean;
  availableMethods?: ('otp' | 'push')[];
}> = {
  // A1: Trusted Device - Instant Login
  'trusteduser': {
    password: 'password',
    scenario: 'trusted',
    trustBehavior: 'normal'
  },

  // A2: Trusted Device + eSign Required
  'trustedesignuser': {
    password: 'password',
    scenario: 'esign_required',
    trustBehavior: 'normal',
    esignBehavior: 'accept'
  },

  // B1 & B4: MFA Required (OTP or Push) - CONSOLIDATED USER
  'mfauser': {
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'normal'
  },

  // B2: MFA + eSign Accept
  'mfaesignuser': {
    password: 'password',
    scenario: 'mfa_required',
    esignBehavior: 'accept'
  },

  // B5: Push Rejection
  'pushfail': {
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'push_fail'
  },

  // B6: Push Timeout
  'pushexpired': {
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'push_expired'
  },

  // C1: Invalid Credentials (handled by default)
  // C2: Account Locked
  'lockeduser': {
    password: 'password',
    scenario: 'locked'
  },

  // C3: Non-existent user (handled by default)
  // MFA Locked
  'mfalockeduser': {
    password: 'password',
    scenario: 'mfa_locked'
  },

  // D1: Expired Device Trust
  'expiredtrustuser': {
    password: 'password',
    scenario: 'mfa_required',
    trustBehavior: 'expired'
  },

  // E3: Compliance User - eSign required for updated terms
  'complianceuser': {
    password: 'password',
    scenario: 'esign_required',
    esignBehavior: 'compliance'
  },

  // F1: OTP-only MFA User
  'otponlyuser': {
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'normal',
    availableMethods: ['otp']
  },

  // F2: Push-only MFA User
  'pushonlyuser': {
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'normal',
    availableMethods: ['push']
  }
};

// ============================================================================
// CONTROLLER METHODS
// ============================================================================

export const authController = {
  /**
   * Login endpoint - handles all user scenarios
   * POST /auth/login
   */
  login: async (req: Request, res: Response) => {
    const { username, password, drs_action_token } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        responseTypeCode: 'MISSING_CREDENTIALS',
        message: 'Username and password are required',
        timestamp: new Date().toISOString(),
        sessionId: '',
        transactionId: ''
      });
    }

    const sessionId = 'session-' + Date.now();
    const transactionId = 'txn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    // Process device fingerprint if provided
    let deviceFingerprint: string | undefined;
    if (drs_action_token) {
      deviceFingerprint = convertActionTokenToFingerprint(drs_action_token);
      console.log('🔍 Device fingerprint generated:', { actionToken: drs_action_token, deviceFingerprint });
    }

    // Get user scenario
    const userScenario = USER_SCENARIOS[username];

    // Check password
    if (!userScenario || userScenario.password !== password) {
      return res.status(401).json({
        responseTypeCode: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
        timestamp: new Date().toISOString(),
        sessionId,
        transactionId
      });
    }

    // Pre-trust devices for specific test scenarios (simulating returning users with trusted devices)
    if (deviceFingerprint && ['trusted', 'esign_required'].includes(userScenario.scenario)) {
      if (!isDeviceTrusted(deviceFingerprint, username)) {
        trustDevice(deviceFingerprint, username); // Use default duration (non-expiring)
        console.log('🔐 Pre-trusted device for test scenario:', { username, deviceFingerprint });
      }
    }

    // Handle locked scenarios
    if (userScenario.scenario === 'locked') {
      return res.status(423).json({
        responseTypeCode: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked',
        timestamp: new Date().toISOString(),
        sessionId,
        transactionId
      });
    }

    if (userScenario.scenario === 'mfa_locked') {
      return res.status(423).json({
        responseTypeCode: 'MFA_LOCKED',
        message: 'Your MFA has been locked due to too many failed attempts. Please call our call center at 1-800-SUPPORT to reset your MFA setup.',
        timestamp: new Date().toISOString(),
        sessionId,
        transactionId
      });
    }

    // Check device trust for trusted users
    if (userScenario.scenario === 'trusted' && deviceFingerprint && isDeviceTrusted(deviceFingerprint, username)) {
      console.log('🚀 Trusted device - instant login:', { username, deviceFingerprint });

      // Update device last used
      const trust = deviceTrusts.get(deviceFingerprint);
      if (trust) {
        trust.lastUsed = Date.now();
        deviceTrusts.set(deviceFingerprint, trust);
      }

      const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
      updateLoginTime(username);

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });

      return res.json({
        responseTypeCode: 'SUCCESS',
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
        sessionId,
        transactionId,
        deviceFingerprint,
        mfa_skipped: true,
        user
      });
    }

    // Handle eSign required scenarios (trusted device but needs eSign)
    if (userScenario.scenario === 'esign_required' && deviceFingerprint && isDeviceTrusted(deviceFingerprint, username)) {
      console.log('📝 eSign required for trusted user:', { username });

      // Add to pending eSigns
      pendingESigns.set(username, {
        username,
        documentId: 'terms-v1-2025',
        mandatory: true,
        reason: 'policy_update'
      });

      return res.json({
        responseTypeCode: 'ESIGN_REQUIRED',
        sessionId,
        transactionId,
        deviceFingerprint,
        esign_document_id: 'terms-v1-2025',
        esign_url: '/esign/document/terms-v1-2025',
        message: 'Please review and accept the updated terms and conditions'
      });
    }

    // Handle MFA required and success scenarios
    if (userScenario.scenario === 'mfa_required') {
      // Check if device is trusted and can bypass MFA
      if (deviceFingerprint && isDeviceTrusted(deviceFingerprint, username)) {
        console.log('🚀 MFA Skip - Device trusted:', { username, deviceFingerprint });

        const trust = deviceTrusts.get(deviceFingerprint);
        if (trust) {
          trust.lastUsed = Date.now();
          deviceTrusts.set(deviceFingerprint, trust);
        }

        const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
        updateLoginTime(username);

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        res.cookie('refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000,
          sameSite: 'strict'
        });

        // Check for pending eSign (compliance scenario)
        if (userScenario.esignBehavior === 'compliance' && !hasAcceptedDocument(username, 'terms-v1-2025')) {
          addPendingESign(username, 'terms-v1-2025', true, 'compliance');
          return res.json({
            responseTypeCode: 'ESIGN_REQUIRED',
            message: 'Updated terms and conditions require your acceptance',
            sessionId,
            transactionId,
            deviceFingerprint,
            mfa_skipped: true,
            esign_document_id: 'terms-v1-2025',
            is_mandatory: true
          });
        }

        return res.json({
          responseTypeCode: 'SUCCESS',
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 900,
          sessionId,
          transactionId,
          deviceFingerprint,
          mfa_skipped: true,
          user
        });
      }

      // Check for expired trust
      if (deviceFingerprint && isDeviceTrustExpired(deviceFingerprint, username)) {
        const trust = deviceTrusts.get(deviceFingerprint);
        return res.status(428).json({
          responseTypeCode: 'MFA_REQUIRED',
          message: 'Device trust expired. Please complete MFA to re-authenticate.',
          reason: 'TRUST_EXPIRED',
          trust_expired_at: trust ? new Date(trust.expiresAt).toISOString() : undefined,
          mfa_required: true,
          available_methods: userScenario.availableMethods || ['otp', 'push'],
          sessionId,
          transactionId,
          deviceFingerprint
        });
      }

      // Check for risk detection
      if (detectRisk(username, deviceFingerprint)) {
        return res.status(428).json({
          responseTypeCode: 'MFA_REQUIRED',
          message: 'Unusual activity detected. Please verify your identity.',
          reason: 'RISK_DETECTED',
          mfa_required: true,
          available_methods: userScenario.availableMethods || ['otp', 'push'],
          sessionId,
          transactionId,
          deviceFingerprint
        });
      }

      // Check for first-time login
      if (userScenario.isFirstLogin) {
        // Add to pending eSigns for post-MFA
        pendingESigns.set(username, {
          username,
          documentId: 'terms-v1-2025',
          mandatory: true,
          reason: 'first_login'
        });

        return res.status(428).json({
          responseTypeCode: 'MFA_REQUIRED',
          message: 'First-time login. MFA setup required.',
          mfa_required: true,
          available_methods: userScenario.availableMethods || ['otp', 'push'],
          sessionId,
          transactionId,
          deviceFingerprint
        });
      }

      // Check for admin reset
      if (userScenario.adminReset) {
        return res.status(428).json({
          responseTypeCode: 'MFA_REQUIRED',
          message: 'Admin reset detected. Fresh MFA required.',
          reason: 'ADMIN_RESET',
          mfa_required: true,
          available_methods: userScenario.availableMethods || ['otp', 'push'],
          sessionId,
          transactionId,
          deviceFingerprint
        });
      }

      // Check for eSign scenarios after MFA
      if (userScenario.esignBehavior && ['accept', 'decline'].includes(userScenario.esignBehavior)) {
        pendingESigns.set(username, {
          username,
          documentId: 'terms-v1-2025',
          mandatory: true,
          reason: 'policy_update'
        });
      }

      // Standard MFA required
      return res.status(428).json({
        responseTypeCode: 'MFA_REQUIRED',
        message: 'Multi-factor authentication required',
        mfa_required: true,
        available_methods: userScenario.availableMethods || ['otp', 'push'],
        sessionId,
        transactionId,
        deviceFingerprint
      });
    }

    // Handle success scenario (users with no pending eSign)
    if (userScenario.scenario === 'success') {
      const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
      updateLoginTime(username);

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });

      // Check for compliance pending
      if (userScenario.esignBehavior === 'compliance' && !hasAcceptedDocument(username, 'terms-v1-2025')) {
        addPendingESign(username, 'terms-v1-2025', true, 'compliance');
        return res.json({
          responseTypeCode: 'ESIGN_REQUIRED',
          message: 'Updated terms and conditions require your acceptance',
          sessionId,
          transactionId,
          deviceFingerprint,
          esign_document_id: 'terms-v1-2025',
          is_mandatory: true
        });
      }

      return res.json({
        responseTypeCode: 'SUCCESS',
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
        sessionId,
        transactionId,
        deviceFingerprint,
        user
      });
    }

    // Fallback - should not reach here
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Unexpected error occurred'
    });
  },

  /**
   * Logout endpoint
   * POST /auth/logout
   */
  logout: async (req: Request, res: Response) => {
    res.clearCookie('refresh_token');
    res.json({
      success: true,
      message: 'Logout successful'
    });
  },

  /**
   * Token refresh endpoint
   * POST /auth/refresh
   */
  refresh: async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'MISSING_REFRESH_TOKEN',
        message: 'Refresh token is required'
      });
    }

    const result = verifyToken(refreshToken, 'refresh');

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token'
      });
    }

    const user = {
      id: result.payload.sub,
      username: result.payload.sub,
      email: `${result.payload.sub}@example.com`,
      roles: ['user']
    };

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });

    return res.json({
      success: true,
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: 900
    });
  },

  /**
   * Token introspection endpoint
   * POST /auth/introspect
   */
  introspect: async (req: Request, res: Response) => {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TOKEN',
        message: 'Token is required'
      });
    }

    const result = verifyToken(token, 'access');

    if (result.valid) {
      return res.json({
        active: true,
        sub: result.payload.sub,
        username: result.payload.username,
        email: result.payload.email,
        roles: result.payload.roles,
        exp: result.payload.exp,
        iat: result.payload.iat
      });
    } else {
      return res.json({
        active: false
      });
    }
  },

  /**
   * Initiate MFA challenge
   * POST /auth/mfa/initiate
   */
  initiateMfaChallenge: async (req: Request, res: Response) => {
    const { method, username, sessionId } = req.body;

    console.log('🔍 MFA Challenge Request:', { method, username, sessionId });

    if (!method || !['otp', 'push'].includes(method)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MFA_METHOD',
        message: 'Valid MFA method (otp or push) is required'
      });
    }

    const transactionId = `mfa-${method}-${username}-${Date.now()}`;
    console.log('🎫 Generated transaction ID:', transactionId);
    const expiresAt = new Date(Date.now() + 10 * 1000).toISOString();

    if (method === 'otp') {
      return res.json({
        success: true,
        transactionId,
        challengeStatus: 'PENDING',
        expiresAt,
        message: 'OTP sent to your device'
      });
    }

    if (method === 'push') {
      const { numbers, correctNumber } = generatePushNumbers();

      const pushChallenge: PushChallenge = {
        transactionId,
        numbers,
        correctNumber,
        username,
        createdAt: Date.now(),
        attempts: 0
      };

      pushChallenges.set(transactionId, pushChallenge);
      console.log('🎲 Push challenge created:', { transactionId, numbers, correctNumber, username });

      return res.json({
        success: true,
        transactionId,
        challengeStatus: 'PENDING',
        expiresAt,
        displayNumber: correctNumber,
        message: 'Push notification sent. Select the number shown below on your mobile device'
      });
    }

    // Fallback (should never reach here due to validation above)
    return res.status(400).json({
      success: false,
      error: 'INVALID_MFA_METHOD',
      message: 'Unsupported MFA method'
    });
  },

  /**
   * Check MFA transaction status (for polling)
   * GET /mfa/transaction/:transactionId
   */
  checkMfaStatus: async (req: Request, res: Response) => {
    const { transactionId } = req.params;

    console.log('🔍 MFA Status Check for transaction:', transactionId);

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TRANSACTION_ID',
        message: 'Transaction ID is required'
      });
    }

    if (transactionId.includes('push')) {
      const challenge = pushChallenges.get(transactionId);

      if (!challenge) {
        return res.status(404).json({
          success: false,
          error: 'CHALLENGE_NOT_FOUND',
          message: 'Push challenge not found or expired'
        });
      }

      const timeElapsed = Date.now() - challenge.createdAt;
      console.log('⏱️ Time elapsed:', timeElapsed, 'ms');

      let challengeStatus = 'PENDING';
      let message = 'Push challenge pending user selection';
      let selectedNumber: number | undefined;

      if (transactionId.includes('pushfail')) {
        console.log('🚫 pushfail user detected');
        if (timeElapsed > 7000) {
          const wrongNumbers = challenge.numbers.filter(n => n !== challenge.correctNumber);
          selectedNumber = wrongNumbers[0];
          challengeStatus = 'REJECTED';
          message = `User selected wrong number: ${selectedNumber}`;
          console.log('❌ pushfail: auto-selected wrong number', selectedNumber);
        }
      } else if (transactionId.includes('pushexpired')) {
        console.log('⏰ pushexpired user detected - should remain PENDING');
        challengeStatus = 'PENDING';
      } else {
        console.log('✅ mfauser (default) detected');
        if (timeElapsed > 5000) {
          selectedNumber = challenge.correctNumber;
          challengeStatus = 'APPROVED';
          message = `User selected correct number: ${selectedNumber}`;
          console.log('✅ auto-selected correct number', selectedNumber);
        }
      }

      console.log('📊 Final status:', challengeStatus, 'message:', message);

      return res.json({
        transactionId,
        challengeStatus,
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(challenge.createdAt + 10 * 1000).toISOString(),
        displayNumber: challenge.correctNumber,
        selectedNumber,
        message
      });
    }

    const transactionCreated = parseInt(transactionId.split('-').pop() || '0');
    const timeElapsed = Date.now() - transactionCreated;

    console.log('⏱️ Time elapsed:', timeElapsed, 'ms');

    let challengeStatus = 'PENDING';
    let message = 'Challenge pending';

    console.log('📊 Final status:', challengeStatus, 'message:', message);

    return res.json({
      transactionId,
      challengeStatus,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 1000).toISOString(),
      message
    });
  },

  /**
   * Verify MFA
   * POST /auth/mfa/verify
   */
  verifyMfa: async (req: Request, res: Response) => {
    const { transactionId, method, code, pushResult, selectedNumber, deviceFingerprint } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TRANSACTION_ID',
        message: 'Transaction ID is required'
      });
    }

    // Extract username from transaction ID
    const username = transactionId.split('-')[2] || 'unknown';
    const userScenario = USER_SCENARIOS[username];

    if (method === 'otp') {
      if (code === '1234') {
        const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
        updateLoginTime(username);

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        res.cookie('refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000,
          sameSite: 'strict'
        });

        if (deviceFingerprint) {
          trustDevice(deviceFingerprint, username);
        }

        // Check if eSign is required after MFA
        const pendingESign = getPendingESign(username);
        if (pendingESign) {
          return res.json({
            responseTypeCode: 'ESIGN_REQUIRED',
            sessionId: `session-${Date.now()}`,
            transactionId,
            deviceFingerprint,
            device_bound: !!deviceFingerprint,
            esign_document_id: pendingESign.documentId,
            is_mandatory: pendingESign.mandatory,
            message: 'Please review and accept the terms and conditions'
          });
        }

        return res.json({
          success: true,
          id_token: accessToken,
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 900,
          sessionId: `session-${Date.now()}`,
          transactionId,
          deviceFingerprint,
          device_bound: !!deviceFingerprint,
          message: 'MFA verification successful'
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'INVALID_MFA_CODE',
          message: 'Invalid or expired MFA code'
        });
      }
    }

    if (method === 'push' || selectedNumber !== undefined) {
      const challenge = pushChallenges.get(transactionId);

      if (!challenge) {
        return res.status(400).json({
          success: false,
          error: 'CHALLENGE_NOT_FOUND',
          message: 'Push challenge not found or expired'
        });
      }

      challenge.attempts += 1;
      pushChallenges.set(transactionId, challenge);

      console.log('🎯 Push verification attempt:', {
        transactionId,
        selectedNumber,
        correctNumber: challenge.correctNumber,
        attempts: challenge.attempts
      });

      if (selectedNumber === challenge.correctNumber) {
        pushChallenges.delete(transactionId);

        const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
        updateLoginTime(username);

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        res.cookie('refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000,
          sameSite: 'strict'
        });

        console.log('✅ Push verification successful:', { username, selectedNumber });

        if (deviceFingerprint) {
          trustDevice(deviceFingerprint, username);
        }

        // Check if eSign is required after MFA
        const pendingESign = getPendingESign(username);
        if (pendingESign) {
          return res.json({
            responseTypeCode: 'ESIGN_REQUIRED',
            sessionId: `session-${Date.now()}`,
            transactionId,
            deviceFingerprint,
            device_bound: !!deviceFingerprint,
            esign_document_id: pendingESign.documentId,
            is_mandatory: pendingESign.mandatory,
            message: 'Please review and accept the terms and conditions'
          });
        }

        return res.json({
          success: true,
          id_token: accessToken,
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 900,
          sessionId: `session-${Date.now()}`,
          transactionId,
          deviceFingerprint,
          device_bound: !!deviceFingerprint,
          message: `Push verification successful - correct number selected: ${selectedNumber}`
        });
      } else {
        console.log('❌ Push verification failed:', { selectedNumber, correctNumber: challenge.correctNumber });

        return res.status(400).json({
          success: false,
          error: 'INCORRECT_NUMBER',
          message: `Incorrect number selected. You selected ${selectedNumber}, but that was not the correct number.`,
          attempts: challenge.attempts,
          canRetry: challenge.attempts < 3
        });
      }
    }

    // Legacy support for old pushResult format
    if (pushResult === 'APPROVED') {
      const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
      updateLoginTime(username);

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });

      if (deviceFingerprint) {
        trustDevice(deviceFingerprint, username);
      }

      return res.json({
        success: true,
        id_token: accessToken,
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
        sessionId: `session-${Date.now()}`,
        transactionId,
        deviceFingerprint,
        device_bound: !!deviceFingerprint,
        message: 'Push notification verified successfully'
      });
    } else if (pushResult === 'REJECTED') {
      return res.status(400).json({
        success: false,
        error: 'PUSH_REJECTED',
        message: 'Push notification was rejected'
      });
    }

    return res.status(400).json({
      success: false,
      error: 'UNSUPPORTED_MFA_METHOD',
      message: 'MFA method not supported'
    });
  },

  /**
   * Get eSign document
   * GET /esign/document/:documentId
   */
  getESignDocument: async (req: Request, res: Response) => {
    const { documentId } = req.params;

    const document = esignDocuments.get(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'DOCUMENT_NOT_FOUND',
        message: 'eSign document not found'
      });
    }

    return res.json({
      documentId: document.documentId,
      title: document.title,
      content: document.content,
      version: document.version,
      mandatory: document.mandatory
    });
  },

  /**
   * Accept eSign document
   * POST /esign/accept
   */
  acceptESign: async (req: Request, res: Response) => {
    const { transactionId, documentId, acceptanceIp } = req.body;

    if (!transactionId || !documentId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'Transaction ID and document ID are required'
      });
    }

    // Extract username from pending eSigns
    let username: string | null = null;
    for (const [user, pending] of pendingESigns.entries()) {
      if (pending.documentId === documentId) {
        username = user;
        break;
      }
    }

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'NO_PENDING_ESIGN',
        message: 'No pending eSign found for this document'
      });
    }

    const userScenario = USER_SCENARIOS[username];

    // Handle decline behavior
    if (userScenario.esignBehavior === 'decline') {
      // Simulate user declining (this would come from UI, but for testing we auto-decline)
      // In real scenario, this endpoint wouldn't be called, the decline endpoint would be used
      console.log('📝 eSign acceptance processed (but will auto-decline for testing):', { username, documentId });
    }

    // Mark as accepted
    completeESign(username, documentId, acceptanceIp);

    // Generate tokens
    const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });

    // Check if device binding is needed (extract deviceFingerprint from transactionId context)
    const deviceFingerprint = req.body.deviceFingerprint || `device_${username}_${Date.now()}`;
    const isTrusted = isDeviceTrusted(deviceFingerprint, username);

    return res.json({
      responseTypeCode: 'SUCCESS',
      access_token: accessToken,
      id_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      sessionId: `session-${Date.now()}`,
      transactionId,
      esign_accepted: true,
      esign_accepted_at: new Date().toISOString(),
      device_bound: isTrusted,
      deviceFingerprint: deviceFingerprint,
      message: 'Terms and conditions accepted successfully'
    });
  },

  /**
   * Decline eSign document
   * POST /esign/decline
   */
  declineESign: async (req: Request, res: Response) => {
    const { transactionId, documentId, reason } = req.body;

    if (!transactionId || !documentId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'Transaction ID and document ID are required'
      });
    }

    // Extract username from pending eSigns
    let username: string | null = null;
    for (const [user, pending] of pendingESigns.entries()) {
      if (pending.documentId === documentId) {
        username = user;
        break;
      }
    }

    console.log('❌ eSign declined:', { username, documentId, reason });

    // Remove from pending (user must re-authenticate to try again)
    if (username) {
      pendingESigns.delete(username);
    }

    return res.status(400).json({
      responseTypeCode: 'ESIGN_DECLINED',
      message: 'Authentication failed. Terms and conditions must be accepted to proceed.',
      sessionId: '',
      transactionId,
      can_retry: true
    });
  },

  /**
   * Post-MFA check (for first-time users or compliance)
   * POST /auth/post-mfa-check
   */
  postMfaCheck: async (req: Request, res: Response) => {
    const { sessionId, transactionId, username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_USERNAME',
        message: 'Username is required'
      });
    }

    const pendingESign = getPendingESign(username);

    if (pendingESign) {
      return res.json({
        responseTypeCode: 'ESIGN_REQUIRED',
        message: pendingESign.reason === 'first_login'
          ? 'Welcome! Please review and accept our terms of service.'
          : 'Please review and accept the updated terms and conditions.',
        esign_document_id: pendingESign.documentId,
        is_mandatory: pendingESign.mandatory
      });
    }

    return res.json({
      responseTypeCode: 'SUCCESS',
      message: 'No additional actions required'
    });
  },

  /**
   * Post-login check (for compliance scenarios)
   * POST /auth/post-login-check
   */
  postLoginCheck: async (req: Request, res: Response) => {
    const { sessionId, username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_USERNAME',
        message: 'Username is required'
      });
    }

    const userScenario = USER_SCENARIOS[username];

    if (userScenario?.esignBehavior === 'compliance' && !hasAcceptedDocument(username, 'terms-v1-2025')) {
      return res.json({
        responseTypeCode: 'ESIGN_REQUIRED',
        message: 'Updated terms and conditions require your acceptance',
        esign_document_id: 'terms-v1-2025',
        is_mandatory: true,
        force_logout_if_declined: true,
        compliance_pending: true
      });
    }

    return res.json({
      responseTypeCode: 'SUCCESS',
      message: 'No compliance actions required'
    });
  },

  /**
   * JWKS endpoint
   * GET /.well-known/jwks.json
   */
  jwks: async (req: Request, res: Response) => {
    res.set({
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/json'
    });

    return res.json(generateJWKS());
  },

  /**
   * User info endpoint
   * GET /userinfo
   */
  userinfo: async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'MISSING_TOKEN',
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const result = verifyToken(token);

    if (!result.valid) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired access token'
      });
    }

    const decoded = result.payload;
    const loginTimes = userLoginTimes.get(decoded.username);
    const lastLoginAt = loginTimes?.lastLogin ? loginTimes.lastLogin.toISOString() : null;

    return res.json({
      sub: decoded.sub,
      preferred_username: decoded.username,
      email: decoded.email,
      email_verified: true,
      given_name: decoded.username.charAt(0).toUpperCase() + decoded.username.slice(1),
      family_name: 'User',
      roles: decoded.roles || ['user'],
      lastLoginAt
    });
  },

  /**
   * Bind device (trust device)
   * POST /device/bind
   */
  bindDevice: async (req: Request, res: Response) => {
    const { username, deviceFingerprint } = req.body;

    if (!username || !deviceFingerprint) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'Username and device fingerprint are required'
      });
    }

    // Verify user exists
    const userScenario = USER_SCENARIOS[username];
    if (!userScenario) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    // Check if device is already trusted
    if (isDeviceTrusted(deviceFingerprint, username)) {
      return res.json({
        success: true,
        message: 'Device is already trusted',
        deviceFingerprint,
        username,
        alreadyTrusted: true
      });
    }

    // Trust the device
    trustDevice(deviceFingerprint, username);

    console.log('🔐 Device bound via /device/bind:', { username, deviceFingerprint });

    return res.json({
      success: true,
      message: 'Device trusted successfully',
      deviceFingerprint,
      username,
      trustedAt: new Date().toISOString()
    });
  }
};
