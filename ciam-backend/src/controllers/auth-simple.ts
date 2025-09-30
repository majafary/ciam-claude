import { Request, Response } from 'express';
import { generateAccessToken, generateRefreshToken, verifyToken, generateJWKS } from '../utils/jwt-simple';

// In-memory storage for push challenges (in production, use Redis or database)
interface PushChallenge {
  transactionId: string;
  numbers: number[];
  correctNumber: number;
  username: string;
  createdAt: number;
  attempts: number;
}

// In-memory storage for device trust (in production, use Redis or database)
interface DeviceTrust {
  deviceFingerprint: string;
  username: string;
  trustedAt: number;
  lastUsed: number;
}

const pushChallenges = new Map<string, PushChallenge>();
const deviceTrusts = new Map<string, DeviceTrust>(); // key: deviceFingerprint

// In-memory store for user login timestamps (in production, use proper database)
const userLoginTimes = new Map<string, {
  lastLogin: Date | null;
  currentLogin: Date;
}>();

// Helper function to generate 3 random numbers
const generatePushNumbers = (): { numbers: number[], correctNumber: number } => {
  const numbers = [
    Math.floor(Math.random() * 9) + 1,
    Math.floor(Math.random() * 9) + 1,
    Math.floor(Math.random() * 9) + 1
  ];
  const correctNumber = numbers[Math.floor(Math.random() * 3)];
  return { numbers, correctNumber };
};

// Mock function to convert actionToken to deviceFingerprint (simulates Transmit Security DRS)
const convertActionTokenToFingerprint = (actionToken: string): string => {
  // In production, this would call Transmit Security API
  // For demo: create deterministic fingerprint from actionToken
  const hash = actionToken.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return `device_${Math.abs(hash)}_${Date.now().toString(36)}`;
};

// Helper function to check if device is trusted for user
const isDeviceTrusted = (deviceFingerprint: string, username: string): boolean => {
  const trust = deviceTrusts.get(deviceFingerprint);
  return trust ? trust.username === username : false;
};

// Helper function to update login timestamps
const updateLoginTime = (username: string): void => {
  const now = new Date();
  const existing = userLoginTimes.get(username);

  // Set previous current login as last login, and update current to now
  userLoginTimes.set(username, {
    lastLogin: existing?.currentLogin || null,
    currentLogin: now
  });
};

// Helper function to trust a device for user
const trustDevice = (deviceFingerprint: string, username: string): void => {
  const now = Date.now();
  deviceTrusts.set(deviceFingerprint, {
    deviceFingerprint,
    username,
    trustedAt: now,
    lastUsed: now
  });
  console.log('🔐 Device trusted:', { deviceFingerprint, username });
};

// Simple auth controller for quick Docker build
export const authController = {
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

    // Generate sessionId and transactionId for tracking
    const sessionId = 'session-' + Date.now();
    const transactionId = 'txn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    // Process device fingerprint if actionToken provided
    let deviceFingerprint: string | undefined;
    if (drs_action_token) {
      deviceFingerprint = convertActionTokenToFingerprint(drs_action_token);
      console.log('🔍 Device fingerprint generated:', { actionToken: drs_action_token, deviceFingerprint });
    }

    // Mock user validation
    if (username === 'testuser' && password === 'password') {
      const user = {
        id: 'testuser',
        username: 'testuser',
        email: 'testuser@example.com',
        roles: ['user']
      };

      // Track login timestamp for this user
      updateLoginTime(username);

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Set refresh token as HTTP-only cookie
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
        user
      });
    }

    if (username === 'lockeduser') {
      return res.status(423).json({
        responseTypeCode: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked',
        timestamp: new Date().toISOString(),
        sessionId,
        transactionId
      });
    }

    if ((username === 'mfauser' || username === 'pushexpired' || username === 'pushfail') && password === 'password') {
      // Check if device is already trusted for this user (MFA skip)
      if (deviceFingerprint && isDeviceTrusted(deviceFingerprint, username)) {
        console.log('🚀 MFA Skip - Device trusted:', { username, deviceFingerprint });

        // Update device last used time
        const trust = deviceTrusts.get(deviceFingerprint);
        if (trust) {
          trust.lastUsed = Date.now();
          deviceTrusts.set(deviceFingerprint, trust);
        }

        const user = {
          id: username,
          username: username,
          email: `${username}@example.com`,
          roles: ['user']
        };

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Set refresh token as HTTP-only cookie
        res.cookie('refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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

      // Device not trusted, require MFA
      return res.status(428).json({
        responseTypeCode: 'MFA_REQUIRED',
        message: 'Multi-factor authentication required',
        mfa_required: true,
        available_methods: ['otp', 'push'],
        sessionId,
        transactionId,
        deviceFingerprint
      });
    }

    if (username === 'mfalockeduser') {
      return res.status(423).json({
        responseTypeCode: 'MFA_LOCKED',
        message: 'Your MFA has been locked due to too many failed attempts. Please call our call center at 1-800-SUPPORT to reset your MFA setup.',
        timestamp: new Date().toISOString(),
        sessionId,
        transactionId
      });
    }


    return res.status(401).json({
      responseTypeCode: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password',
      timestamp: new Date().toISOString(),
      sessionId,
      transactionId
    });
  },

  logout: async (req: Request, res: Response) => {
    res.clearCookie('refresh_token');
    res.json({
      success: true,
      message: 'Logout successful'
    });
  },

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

    res.json({
      success: true,
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: 900
    });
  },

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
      res.json({
        active: true,
        sub: result.payload.sub,
        username: result.payload.username,
        email: result.payload.email,
        roles: result.payload.roles,
        exp: result.payload.exp,
        iat: result.payload.iat
      });
    } else {
      res.json({
        active: false
      });
    }
  },

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
    const expiresAt = new Date(Date.now() + 10 * 1000).toISOString(); // 10 seconds

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
      // Generate 3 random numbers for push challenge
      const { numbers, correctNumber } = generatePushNumbers();

      // Store push challenge in memory
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
        displayNumber: correctNumber, // Send only the correct number to display on UI
        message: 'Push notification sent. Select the number shown below on your mobile device'
      });
    }
  },

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

    // For push transactions, check stored challenge
    if (transactionId.includes('push')) {
      const challenge = pushChallenges.get(transactionId);

      if (!challenge) {
        return res.status(404).json({
          success: false,
          error: 'CHALLENGE_NOT_FOUND',
          message: 'Push challenge not found or expired'
        });
      }

      // Extract transaction creation time and determine user behavior
      const timeElapsed = Date.now() - challenge.createdAt;
      console.log('⏱️ Time elapsed:', timeElapsed, 'ms');

      let challengeStatus = 'PENDING';
      let message = 'Push challenge pending user selection';
      let selectedNumber: number | undefined;

      if (transactionId.includes('pushfail')) {
        console.log('🚫 pushfail user detected');
        // pushfail user: auto-select wrong number after 7 seconds
        if (timeElapsed > 7000) {
          // Select a wrong number (different from correct)
          const wrongNumbers = challenge.numbers.filter(n => n !== challenge.correctNumber);
          selectedNumber = wrongNumbers[0];
          challengeStatus = 'REJECTED';
          message = `User selected wrong number: ${selectedNumber}`;
          console.log('❌ pushfail: auto-selected wrong number', selectedNumber);
        }
      } else if (transactionId.includes('pushexpired')) {
        console.log('⏰ pushexpired user detected - should remain PENDING');
        // pushexpired user: let it timeout (frontend handles expiry)
        challengeStatus = 'PENDING';
      } else {
        console.log('✅ mfauser (default) detected');
        // mfauser: auto-select correct number after 5 seconds
        if (timeElapsed > 5000) {
          selectedNumber = challenge.correctNumber;
          challengeStatus = 'APPROVED';
          message = `User selected correct number: ${selectedNumber}`;
          console.log('✅ mfauser: auto-selected correct number', selectedNumber);
        }
      }

      console.log('📊 Final status:', challengeStatus, 'message:', message);

      return res.json({
        transactionId,
        challengeStatus,
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(challenge.createdAt + 10 * 1000).toISOString(),
        displayNumber: challenge.correctNumber, // Return only the number to display on UI
        selectedNumber, // Return selected number if auto-selected
        message
      });
    }

    // For non-push transactions (like OTP), use original logic
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

  verifyMfa: async (req: Request, res: Response) => {
    const { transactionId, method, code, pushResult, selectedNumber, deviceFingerprint } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TRANSACTION_ID',
        message: 'Transaction ID is required'
      });
    }

    if (method === 'otp') {
      if (code === '1234') {
        // Get username from challenge data, similar to push verification
        const challenge = pushChallenges.get(transactionId);
        const username = challenge?.username || 'mfauser';

        const user = {
          id: username,
          username: username,
          email: `${username}@example.com`,
          roles: ['user']
        };

        // Track login timestamp for this user
        updateLoginTime(username);

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Set refresh token as HTTP-only cookie
        res.cookie('refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          sameSite: 'strict'
        });

        // Atomically bind device if deviceFingerprint provided
        if (deviceFingerprint) {
          trustDevice(deviceFingerprint, 'mfauser');
        }

        return res.json({
          success: true,
          id_token: accessToken,
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 900,
          sessionId: 'session-' + Date.now(),
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
      // Get the stored push challenge
      const challenge = pushChallenges.get(transactionId);

      if (!challenge) {
        return res.status(400).json({
          success: false,
          error: 'CHALLENGE_NOT_FOUND',
          message: 'Push challenge not found or expired'
        });
      }

      // Track attempt
      challenge.attempts += 1;
      pushChallenges.set(transactionId, challenge);

      console.log('🎯 Push verification attempt:', {
        transactionId,
        selectedNumber,
        correctNumber: challenge.correctNumber,
        attempts: challenge.attempts
      });

      // Check if selected number is correct
      if (selectedNumber === challenge.correctNumber) {
        // Remove challenge from memory after successful verification
        pushChallenges.delete(transactionId);

        // Determine user from transaction ID or default to mfauser
        let username = challenge.username || 'mfauser';

        const user = {
          id: username,
          username: username,
          email: `${username}@example.com`,
          roles: ['user']
        };

        // Track login timestamp for this user
        updateLoginTime(username);

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Set refresh token as HTTP-only cookie
        res.cookie('refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          sameSite: 'strict'
        });

        console.log('✅ Push verification successful:', { username, selectedNumber });

        // Atomically bind device if deviceFingerprint provided
        if (deviceFingerprint) {
          trustDevice(deviceFingerprint, username);
        }

        return res.json({
          success: true,
          id_token: accessToken,
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 900,
          sessionId: 'session-' + Date.now(),
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
          canRetry: challenge.attempts < 3 // Allow up to 3 attempts
        });
      }
    }

    // Legacy support for old pushResult format
    if (pushResult === 'APPROVED') {
      // Determine user from transaction ID or default to mfauser
      let username = 'mfauser';
      if (transactionId.includes('pushexpired')) {
        username = 'pushexpired';
      }

      const user = {
        id: username,
        username: username,
        email: `${username}@example.com`,
        roles: ['user']
      };

      // Track login timestamp for this user
      updateLoginTime(username);

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Set refresh token as HTTP-only cookie
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'strict'
      });

      // Atomically bind device if deviceFingerprint provided (legacy support)
      if (deviceFingerprint) {
        trustDevice(deviceFingerprint, username);
      }

      return res.json({
        success: true,
        id_token: accessToken,
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
        sessionId: 'session-' + Date.now(),
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

  jwks: async (req: Request, res: Response) => {
    res.set({
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/json'
    });

    res.json(generateJWKS());
  },

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

    // Get login timestamp for this user
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
  }
};