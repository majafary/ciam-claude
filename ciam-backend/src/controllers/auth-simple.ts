import { Request, Response } from 'express';
import { generateAccessToken, generateRefreshToken, verifyToken, generateJWKS } from '../utils/jwt-simple';

// ============================================================================
// IN-MEMORY STORAGE (Mock Database - Production would use Redis/PostgreSQL)
// ============================================================================

// MFA Transaction Storage (track username for transaction_id)
interface MFATransaction {
  transaction_id: string;
  username: string;
  createdAt: number;
  method?: 'sms' | 'voice' | 'push';
}

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

const mfaTransactions = new Map<string, MFATransaction>(); // key: transaction_id
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

// Add pending eSign requirement
const addPendingESign = (username: string, documentId: string, mandatory: boolean, reason: 'first_login' | 'compliance' | 'policy_update'): void => {
  pendingESigns.set(username, {
    username,
    documentId,
    mandatory,
    reason
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
  availableMethods?: ('sms' | 'voice' | 'push')[];
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

  // F1: SMS-only MFA User (v3.0.0)
  'otponlyuser': {
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'normal',
    availableMethods: ['sms']
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
    const { username, password, drs_action_token, app_id, app_version } = req.body;

    const context_id = 'session-' + Date.now();

    if (!username || !password) {
      return res.status(400).json({
        error_code: 'MISSING_CREDENTIALS',
        context_id: context_id
      });
    }

    if (!app_id || !app_version) {
      return res.status(400).json({
        error_code: 'MISSING_APP_INFO',
        context_id: context_id
      });
    }
    const transaction_id = 'txn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

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
        error_code: 'CIAM_E01_01_001',
        context_id: context_id
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
        error_code: 'CIAM_E01_01_002',
        context_id: context_id
      });
    }

    if (userScenario.scenario === 'mfa_locked') {
      return res.status(423).json({
        error_code: 'CIAM_E01_01_005',
        context_id: context_id
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
      const idToken = generateAccessToken(user); // In production, this would be different
      const refreshToken = generateRefreshToken(user);

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });

      return res.status(201).json({
        response_type_code: 'SUCCESS',
        access_token: accessToken,
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 900,
        context_id: context_id,
        device_bound: true
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

      return res.status(200).json({
        response_type_code: 'ESIGN_REQUIRED',
        context_id: context_id,
        transaction_id: transaction_id,
        esign_document_id: 'terms-v1-2025',
        esign_url: '/esign/document/terms-v1-2025',
        is_mandatory: true
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
        const idToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        res.cookie('refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 30 * 24 * 60 * 60 * 1000,
          sameSite: 'strict'
        });

        // Check for pending eSign (compliance scenario)
        if (userScenario.esignBehavior === 'compliance' && !hasAcceptedDocument(username, 'terms-v1-2025')) {
          addPendingESign(username, 'terms-v1-2025', true, 'compliance');
          return res.status(200).json({
            response_type_code: 'ESIGN_REQUIRED',
            context_id: context_id,
            transaction_id: transaction_id,
            esign_document_id: 'terms-v1-2025',
            esign_url: '/esign/document/terms-v1-2025',
            is_mandatory: true
          });
        }

        return res.status(201).json({
          response_type_code: 'SUCCESS',
          access_token: accessToken,
          id_token: idToken,
          token_type: 'Bearer',
          expires_in: 900,
          context_id: context_id,
          device_bound: true
        });
      }

      // Check for eSign scenarios after MFA
      if (userScenario.esignBehavior && ['accept', 'decline'].includes(userScenario.esignBehavior)) {
        console.log('📝 [LOGIN] Setting pending eSign for user after MFA:', { username, esignBehavior: userScenario.esignBehavior });
        pendingESigns.set(username, {
          username,
          documentId: 'terms-v1-2025',
          mandatory: true,
          reason: 'policy_update'
        });
        console.log('📝 [LOGIN] Pending eSign set:', pendingESigns.get(username));
      }

      // Determine available MFA methods based on user scenario (v3.0.0)
      const availableMethods = userScenario.availableMethods || ['sms', 'push'];

      // Build otp_methods array (simulate multiple phone numbers) - v3.0.0: includes both sms and voice
      const otp_methods = (availableMethods.includes('sms') || availableMethods.includes('voice')) ? [
        { value: '1234', mfa_option_id: 1 },
        { value: '5678', mfa_option_id: 2 }
      ] : [];

      // Determine mobile approve status
      let mobile_approve_status: 'NOT_REGISTERED' | 'ENABLED' | 'DISABLED';
      if (!availableMethods.includes('push')) {
        mobile_approve_status = 'NOT_REGISTERED';
      } else if (username === 'pushonlyuser') {
        mobile_approve_status = 'ENABLED';
      } else {
        mobile_approve_status = 'ENABLED';
      }

      // Store MFA transaction for username retrieval during verify
      mfaTransactions.set(transaction_id, {
        transaction_id,
        username,
        createdAt: Date.now()
      });
      console.log('📝 [LOGIN] Stored MFA transaction:', { transaction_id, username });

      // Standard MFA required
      return res.status(200).json({
        response_type_code: 'MFA_REQUIRED',
        otp_methods: otp_methods,
        mobile_approve_status: mobile_approve_status,
        context_id: context_id,
        transaction_id: transaction_id
      });
    }

    // Handle success scenario (users with no pending eSign)
    if (userScenario.scenario === 'success') {
      const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
      updateLoginTime(username);

      const accessToken = generateAccessToken(user);
      const idToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });

      // Check for compliance pending
      if (userScenario.esignBehavior === 'compliance' && !hasAcceptedDocument(username, 'terms-v1-2025')) {
        addPendingESign(username, 'terms-v1-2025', true, 'compliance');
        return res.status(200).json({
          response_type_code: 'ESIGN_REQUIRED',
          context_id: context_id,
          transaction_id: transaction_id,
          esign_document_id: 'terms-v1-2025',
          esign_url: '/esign/document/terms-v1-2025',
          is_mandatory: true
        });
      }

      return res.status(201).json({
        response_type_code: 'SUCCESS',
        access_token: accessToken,
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 900,
        context_id: context_id,
        device_bound: deviceFingerprint ? isDeviceTrusted(deviceFingerprint, username) : false
      });
    }

    // Fallback - should not reach here
    return res.status(503).json({
      error_code: 'CIAM_E05_00_001',
      context_id: context_id
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
    const context_id = 'refresh-' + Date.now();

    if (!refreshToken) {
      return res.status(401).json({
        error_code: 'CIAM_E01_02_001',
        context_id: context_id
      });
    }

    const result = verifyToken(refreshToken, 'refresh');

    if (!result.valid) {
      return res.status(401).json({
        error_code: 'CIAM_E01_02_002',
        context_id: context_id
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
    const context_id = 'introspect-' + Date.now();

    if (!token) {
      return res.status(400).json({
        error_code: 'MISSING_TOKEN',
        context_id: context_id
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
    const { method, transaction_id, mfa_option_id, context_id } = req.body;

    console.log('🔍 MFA Challenge Request:', { method, transaction_id, mfa_option_id, context_id });

    if (!transaction_id) {
      return res.status(400).json({
        error_code: 'MISSING_TRANSACTION_ID',
        context_id: context_id || ''
      });
    }

    // v3.0.0: Accept 'sms', 'voice', or 'push' methods
    if (!method || !['sms', 'voice', 'push'].includes(method)) {
      return res.status(400).json({
        error_code: 'INVALID_MFA_METHOD',
        context_id: context_id || ''
      });
    }

    // v3.0.0: mfa_option_id is required for OTP methods (sms/voice)
    if ((method === 'sms' || method === 'voice') && !mfa_option_id) {
      return res.status(400).json({
        error_code: 'MISSING_MFA_OPTION_ID',
        context_id: context_id || ''
      });
    }

    // Retrieve username from MFA transaction storage
    const mfaTransaction = mfaTransactions.get(transaction_id);
    if (!mfaTransaction) {
      console.log('❌ [MFA INITIATE] No MFA transaction found for:', transaction_id);
      return res.status(400).json({
        error_code: 'INVALID_TRANSACTION',
        context_id: context_id || ''
      });
    }

    const username = mfaTransaction.username;
    console.log('✅ [MFA INITIATE] Retrieved username from transaction:', { transaction_id, username });

    const expires_at = new Date(Date.now() + 10 * 1000).toISOString();

    // v3.0.0: Handle OTP methods (sms/voice) - both work the same way
    if (method === 'sms' || method === 'voice') {
      return res.json({
        success: true,
        transaction_id: transaction_id,
        expires_at: expires_at
      });
    }

    if (method === 'push') {
      const { numbers, correctNumber } = generatePushNumbers();

      const pushChallenge: PushChallenge = {
        transactionId: transaction_id,
        numbers,
        correctNumber,
        username,
        createdAt: Date.now(),
        attempts: 0
      };

      pushChallenges.set(transaction_id, pushChallenge);
      console.log('🎲 Push challenge created:', { transaction_id, numbers, correctNumber, username });

      return res.json({
        success: true,
        transaction_id: transaction_id,
        expires_at: expires_at,
        display_number: correctNumber
      });
    }

    // Fallback (should never reach here due to validation above)
    return res.status(400).json({
      error_code: 'INVALID_MFA_METHOD',
      context_id: context_id || ''
    });
  },

  /**
   * Check MFA transaction status (for polling)
   * GET /mfa/transaction/:transactionId
   */
  checkMfaStatus: async (req: Request, res: Response) => {
    const { transactionId } = req.params;
    const context_id = 'status-' + Date.now();

    console.log('🔍 MFA Status Check for transaction:', transactionId);

    if (!transactionId) {
      return res.status(400).json({
        error_code: 'MISSING_TRANSACTION_ID',
        context_id: context_id
      });
    }

    // Check if this is a Push challenge by looking in the pushChallenges Map
    const challenge = pushChallenges.get(transactionId);
    if (challenge) {
      console.log('📱 Found Push challenge for transaction:', transactionId);

      const timeElapsed = Date.now() - challenge.createdAt;
      console.log('⏱️ Push challenge time elapsed:', timeElapsed, 'ms');

      let challenge_status = 'PENDING';
      let selected_number: number | undefined;

      // Check username from challenge object, not transaction_id string
      if (challenge.username === 'pushfail') {
        console.log('🚫 pushfail user detected');
        if (timeElapsed > 7000) {
          const wrongNumbers = challenge.numbers.filter(n => n !== challenge.correctNumber);
          selected_number = wrongNumbers[0];
          challenge_status = 'REJECTED';
          console.log('❌ pushfail: auto-selected wrong number', selected_number);
        }
      } else if (challenge.username === 'pushexpired') {
        console.log('⏰ pushexpired user detected - should remain PENDING');
        challenge_status = 'PENDING';
      } else {
        console.log('✅ mfauser (or default) detected');
        if (timeElapsed > 5000) {
          selected_number = challenge.correctNumber;
          challenge_status = 'APPROVED';
          console.log('✅ auto-selected correct number', selected_number);
        }
      }

      console.log('📊 Final status:', challenge_status);

      return res.json({
        transaction_id: transactionId,
        updated_at: new Date().toISOString(),
        expires_at: new Date(challenge.createdAt + 10 * 1000).toISOString(),
        display_number: challenge.correctNumber,
        selected_number: selected_number
      });
    }

    const transactionCreated = parseInt(transactionId.split('-').pop() || '0');
    const timeElapsed = Date.now() - transactionCreated;

    console.log('⏱️ Time elapsed:', timeElapsed, 'ms');

    let challenge_status = 'PENDING';

    console.log('📊 Final status:', challenge_status);

    return res.json({
      transaction_id: transactionId,
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 10 * 1000).toISOString()
    });
  },

  /**
   * Verify Push MFA challenge (v3 - POST-based polling)
   * POST /mfa/transaction/:transaction_id
   */
  verifyPushChallenge: async (req: Request, res: Response) => {
    const { transaction_id } = req.params;
    const { context_id } = req.body;

    console.log('🔍 [PUSH VERIFY] Request:', { transaction_id, context_id });

    if (!transaction_id) {
      return res.status(400).json({
        error_code: 'MISSING_TRANSACTION_ID',
        context_id: context_id || ''
      });
    }

    if (!context_id) {
      return res.status(400).json({
        error_code: 'MISSING_CONTEXT_ID',
        context_id: ''
      });
    }

    // Retrieve username from MFA transaction storage
    const mfaTransaction = mfaTransactions.get(transaction_id);
    if (!mfaTransaction) {
      console.log('❌ [PUSH VERIFY] No MFA transaction found for:', transaction_id);
      return res.status(404).json({
        error_code: 'TRANSACTION_NOT_FOUND',
        context_id: context_id
      });
    }

    const username = mfaTransaction.username;
    console.log('✅ [PUSH VERIFY] Retrieved username from transaction:', { transaction_id, username });

    // Check if this is a Push challenge
    const challenge = pushChallenges.get(transaction_id);
    if (!challenge) {
      console.log('❌ [PUSH VERIFY] No push challenge found for:', transaction_id);
      return res.status(400).json({
        error_code: 'CHALLENGE_NOT_FOUND',
        context_id: context_id
      });
    }

    // Determine current challenge status based on elapsed time and user scenario
    const timeElapsed = Date.now() - challenge.createdAt;
    let challenge_status = 'PENDING';

    if (challenge.username === 'pushfail') {
      if (timeElapsed > 7000) {
        challenge_status = 'REJECTED';
      }
    } else if (challenge.username === 'pushexpired') {
      if (timeElapsed > 10000) {
        challenge_status = 'EXPIRED';
      } else {
        challenge_status = 'PENDING';
      }
    } else {
      // Normal mfauser - auto-approve after 5 seconds
      if (timeElapsed > 5000) {
        challenge_status = 'APPROVED';
      }
    }

    console.log('📊 [PUSH VERIFY] Challenge status:', { challenge_status, timeElapsed });

    // V3: Return MFA_PENDING for polling when still pending
    if (challenge_status === 'PENDING') {
      return res.status(200).json({
        response_type_code: 'MFA_PENDING',
        transaction_id: transaction_id,
        context_id: context_id,
        expires_at: new Date(challenge.createdAt + 10 * 1000).toISOString(),
        retry_after: 1000
      });
    }

    // Handle REJECTED status
    if (challenge_status === 'REJECTED') {
      console.log('❌ [PUSH VERIFY] Push notification rejected');
      pushChallenges.delete(transaction_id);
      // Invalid push - delete MFA transaction (single-use security)
      mfaTransactions.delete(transaction_id);
      return res.status(400).json({
        error_code: 'PUSH_REJECTED',
        context_id: context_id
      });
    }

    // Handle EXPIRED status
    if (challenge_status === 'EXPIRED') {
      console.log('⏰ [PUSH VERIFY] Push notification expired');
      pushChallenges.delete(transaction_id);
      return res.status(410).json({
        error_code: 'TRANSACTION_EXPIRED',
        context_id: context_id
      });
    }

    // Transaction is APPROVED - generate tokens
    console.log('✅ [PUSH VERIFY] Push approved, generating tokens');
    pushChallenges.delete(transaction_id);

    const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
    updateLoginTime(username);

    const accessToken = generateAccessToken(user);
    const idToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });

    // Check if eSign is required after MFA
    const pendingESign = getPendingESign(username);
    if (pendingESign) {
      console.log('📝 [PUSH VERIFY] eSign required after push MFA');
      return res.status(200).json({
        response_type_code: 'ESIGN_REQUIRED',
        context_id: context_id,
        transaction_id: transaction_id,
        esign_document_id: pendingESign.documentId,
        esign_url: `/esign/document/${pendingESign.documentId}`,
        is_mandatory: pendingESign.mandatory
      });
    }

    return res.status(201).json({
      response_type_code: 'SUCCESS',
      access_token: accessToken,
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 900,
      context_id: context_id,
      transaction_id: transaction_id,
      device_bound: false
    });
  },

  /**
   * Verify MFA
   * POST /auth/mfa/verify
   */
  verifyMfa: async (req: Request, res: Response) => {
    const { transaction_id, method, code, context_id } = req.body;

    console.log('🔍 [MFA VERIFY] Request:', { transaction_id, method, context_id });

    if (!transaction_id) {
      return res.status(400).json({
        error_code: 'MISSING_TRANSACTION_ID',
        context_id: context_id || ''
      });
    }

    if (!method) {
      return res.status(400).json({
        error_code: 'MISSING_METHOD',
        context_id: context_id || ''
      });
    }

    // Retrieve username from MFA transaction storage
    const mfaTransaction = mfaTransactions.get(transaction_id);
    if (!mfaTransaction) {
      console.log('❌ [OTP VERIFY] No MFA transaction found for:', transaction_id);
      return res.status(400).json({
        error_code: 'INVALID_TRANSACTION',
        context_id: context_id || ''
      });
    }

    const username = mfaTransaction.username;
    console.log('✅ [OTP VERIFY] Retrieved username from transaction:', { transaction_id, username });
    const userScenario = USER_SCENARIOS[username];

    // v3.0.0: Handle OTP methods (sms/voice)
    if (method === 'sms' || method === 'voice') {
      if (!code) {
        return res.status(400).json({
          error_code: 'MISSING_CODE',
          context_id: context_id || ''
        });
      }

      if (code === '1234') {
        const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
        updateLoginTime(username);

        const accessToken = generateAccessToken(user);
        const idToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        res.cookie('refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 30 * 24 * 60 * 60 * 1000,
          sameSite: 'strict'
        });

        // Check if eSign is required after MFA
        console.log('🔍 [OTP VERIFY] Checking for pending eSign:', { username, transaction_id });
        const pendingESign = getPendingESign(username);
        console.log('🔍 [OTP VERIFY] Pending eSign result:', pendingESign);
        if (pendingESign) {
          return res.status(200).json({
            response_type_code: 'ESIGN_REQUIRED',
            context_id: context_id,
            transaction_id: transaction_id,
            esign_document_id: pendingESign.documentId,
            esign_url: `/esign/document/${pendingESign.documentId}`,
            is_mandatory: pendingESign.mandatory
          });
        }

        return res.status(201).json({
          response_type_code: 'SUCCESS',
          access_token: accessToken,
          id_token: idToken,
          token_type: 'Bearer',
          expires_in: 900,
          context_id: context_id,
          transaction_id: transaction_id,
          device_bound: false
        });
      } else {
        // Invalid OTP - delete MFA transaction (single-use security)
        mfaTransactions.delete(transaction_id);
        return res.status(400).json({
          error_code: 'INVALID_MFA_CODE',
          context_id: context_id || ''
        });
      }
    }

    if (method === 'push') {
      // For push, check the transaction status
      const challenge = pushChallenges.get(transaction_id);

      if (!challenge) {
        return res.status(400).json({
          error_code: 'CHALLENGE_NOT_FOUND',
          context_id: context_id || ''
        });
      }

      // Check current status (would be APPROVED if user selected correct number on mobile)
      const timeElapsed = Date.now() - challenge.createdAt;
      let challenge_status = 'PENDING';

      if (transaction_id.includes('pushfail')) {
        if (timeElapsed > 7000) {
          challenge_status = 'REJECTED';
        }
      } else if (transaction_id.includes('pushexpired')) {
        challenge_status = 'PENDING';
      } else {
        if (timeElapsed > 5000) {
          challenge_status = 'APPROVED';
        }
      }

      if (challenge_status !== 'APPROVED') {
        return res.status(400).json({
          error_code: challenge_status === 'REJECTED' ? 'PUSH_REJECTED' : 'TRANSACTION_NOT_APPROVED',
          context_id: context_id || ''
        });
      }

      // Push approved - issue tokens
      pushChallenges.delete(transaction_id);

      const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
      updateLoginTime(username);

      const accessToken = generateAccessToken(user);
      const idToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });

      console.log('✅ Push verification successful:', { username });

      // Check if eSign is required after MFA
      const pendingESign = getPendingESign(username);
      if (pendingESign) {
        return res.status(200).json({
          response_type_code: 'ESIGN_REQUIRED',
          context_id: context_id,
          transaction_id: transaction_id,
          esign_document_id: pendingESign.documentId,
          esign_url: `/esign/document/${pendingESign.documentId}`,
          is_mandatory: pendingESign.mandatory
        });
      }

      return res.status(201).json({
        response_type_code: 'SUCCESS',
        access_token: accessToken,
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 900,
        context_id: context_id,
        transaction_id: transaction_id,
        device_bound: false
      });
    }

    return res.status(400).json({
      error_code: 'UNSUPPORTED_MFA_METHOD',
      context_id: context_id || ''
    });
  },

  /**
   * Get eSign document
   * GET /esign/document/:documentId
   */
  getESignDocument: async (req: Request, res: Response) => {
    const { documentId } = req.params;
    const context_id = 'esign-get-' + Date.now();

    const document = esignDocuments.get(documentId);

    if (!document) {
      return res.status(404).json({
        error_code: 'DOCUMENT_NOT_FOUND',
        context_id: context_id
      });
    }

    return res.json({
      document_id: document.documentId,
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
    const { transaction_id, document_id, acceptance_ip, acceptance_timestamp, context_id } = req.body;

    console.log('🔍 [ESIGN ACCEPT] Request:', { transaction_id, document_id, context_id });

    if (!transaction_id || !document_id) {
      return res.status(400).json({
        error_code: 'MISSING_REQUIRED_FIELDS',
        context_id: context_id || ''
      });
    }

    // Extract username from pending eSigns
    let username: string | null = null;
    for (const [user, pending] of Array.from(pendingESigns.entries())) {
      if (pending.documentId === document_id) {
        username = user;
        break;
      }
    }

    if (!username) {
      return res.status(400).json({
        error_code: 'NO_PENDING_ESIGN',
        context_id: context_id || ''
      });
    }

    const userScenario = USER_SCENARIOS[username];

    // Mark as accepted
    completeESign(username, document_id, acceptance_ip);

    // v3.0.0: Check if device binding is needed (extract deviceFingerprint from context)
    const deviceFingerprint = req.body.drs_action_token
      ? convertActionTokenToFingerprint(req.body.drs_action_token)
      : undefined;
    const device_bound = deviceFingerprint ? isDeviceTrusted(deviceFingerprint, username) : false;

    // v3.0.0: If device is not bound, return DEVICE_BIND_REQUIRED
    if (!device_bound) {
      console.log('📱 [ESIGN ACCEPT] Device not bound, returning DEVICE_BIND_REQUIRED:', { username, deviceFingerprint });
      return res.status(200).json({
        response_type_code: 'DEVICE_BIND_REQUIRED',
        context_id: context_id,
        transaction_id: transaction_id
      });
    }

    // v3.0.0: Device already bound, return SUCCESS with tokens
    console.log('✅ [ESIGN ACCEPT] Device already bound, returning tokens:', { username, deviceFingerprint });

    // Generate tokens
    const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
    const accessToken = generateAccessToken(user);
    const idToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });

    return res.status(201).json({
      response_type_code: 'SUCCESS',
      access_token: accessToken,
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 900,
      context_id: context_id,
      transaction_id: transaction_id,
      device_bound: true
    });
  },

  /**
   * Decline eSign document
   * POST /esign/decline
   */
  declineESign: async (req: Request, res: Response) => {
    const { transactionId, documentId, reason, context_id } = req.body;

    console.log('🔍 [ESIGN DECLINE] Request:', { transactionId, documentId, context_id });

    if (!transactionId || !documentId) {
      return res.status(400).json({
        error_code: 'MISSING_REQUIRED_FIELDS',
        context_id: context_id || ''
      });
    }

    // Extract username from pending eSigns
    let username: string | null = null;
    for (const [user, pending] of Array.from(pendingESigns.entries())) {
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
      error_code: 'ESIGN_DECLINED',
      context_id: context_id || '',
      transaction_id: transactionId,
      can_retry: true
    });
  },

  /**
   * Post-MFA check (for first-time users or compliance)
   * POST /auth/post-mfa-check
   */
  postMfaCheck: async (req: Request, res: Response) => {
    const { sessionId, transactionId, username } = req.body;
    const context_id = 'post-mfa-' + Date.now();

    if (!username) {
      return res.status(400).json({
        error_code: 'MISSING_USERNAME',
        context_id: context_id
      });
    }

    const pendingESign = getPendingESign(username);

    if (pendingESign) {
      return res.json({
        response_type_code: 'ESIGN_REQUIRED',
        message: pendingESign.reason === 'first_login'
          ? 'Welcome! Please review and accept our terms of service.'
          : 'Please review and accept the updated terms and conditions.',
        esign_document_id: pendingESign.documentId,
        is_mandatory: pendingESign.mandatory
      });
    }

    return res.json({
      response_type_code: 'SUCCESS',
      message: 'No additional actions required'
    });
  },

  /**
   * Post-login check (for compliance scenarios)
   * POST /auth/post-login-check
   */
  postLoginCheck: async (req: Request, res: Response) => {
    const { sessionId, username } = req.body;
    const context_id = 'post-login-' + Date.now();

    if (!username) {
      return res.status(400).json({
        error_code: 'MISSING_USERNAME',
        context_id: context_id
      });
    }

    const userScenario = USER_SCENARIOS[username];

    if (userScenario?.esignBehavior === 'compliance' && !hasAcceptedDocument(username, 'terms-v1-2025')) {
      return res.json({
        response_type_code: 'ESIGN_REQUIRED',
        message: 'Updated terms and conditions require your acceptance',
        esign_document_id: 'terms-v1-2025',
        is_mandatory: true,
        force_logout_if_declined: true,
        compliance_pending: true
      });
    }

    return res.json({
      response_type_code: 'SUCCESS',
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
    const context_id = 'userinfo-' + Date.now();

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error_code: 'MISSING_TOKEN',
        context_id: context_id
      });
    }

    const token = authHeader.substring(7);
    const result = verifyToken(token);

    if (!result.valid) {
      return res.status(401).json({
        error_code: 'INVALID_TOKEN',
        context_id: context_id
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
   * Bind device (trust device) - v3.0.0
   * POST /device/bind
   */
  bindDevice: async (req: Request, res: Response) => {
    const { transaction_id, context_id, bind_device } = req.body;

    console.log('🔍 [DEVICE BIND] Request:', { transaction_id, context_id, bind_device });

    // v3.0.0: bind_device is required
    if (!transaction_id || bind_device === undefined) {
      return res.status(400).json({
        error_code: 'MISSING_REQUIRED_FIELDS',
        context_id: context_id || ''
      });
    }

    // Retrieve username from MFA transaction storage
    const mfaTransaction = mfaTransactions.get(transaction_id);
    if (!mfaTransaction) {
      console.log('❌ [DEVICE BIND] No MFA transaction found for:', transaction_id);
      return res.status(404).json({
        error_code: 'TRANSACTION_NOT_FOUND',
        context_id: context_id || ''
      });
    }

    const username = mfaTransaction.username;
    console.log('✅ [DEVICE BIND] Retrieved username from transaction:', { transaction_id, username });

    // Verify user exists
    const userScenario = USER_SCENARIOS[username];
    if (!userScenario) {
      return res.status(404).json({
        error_code: 'TRANSACTION_NOT_FOUND',
        context_id: context_id || ''
      });
    }

    // Generate device fingerprint from DRS token if available
    const deviceFingerprint = req.body.drs_action_token
      ? convertActionTokenToFingerprint(req.body.drs_action_token)
      : `device_${username}_${Date.now()}`;

    // v3.0.0: Handle bind_device parameter
    let device_bound = false;
    if (bind_device === true) {
      // User chose to trust the device
      trustDevice(deviceFingerprint, username);
      device_bound = true;
      console.log('🔐 Device bound via /device/bind:', { username, deviceFingerprint });
    } else {
      // User declined to trust the device
      console.log('⏭️ Device binding skipped by user:', { username, deviceFingerprint });
    }

    // v3.0.0: Generate and return tokens
    const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
    updateLoginTime(username);

    const accessToken = generateAccessToken(user);
    const idToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });

    return res.status(200).json({
      response_type_code: 'SUCCESS',
      access_token: accessToken,
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 900,
      context_id: context_id,
      device_bound: device_bound
    });
  }
};
