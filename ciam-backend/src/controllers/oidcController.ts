import { Request, Response } from 'express';
import { generateJWKS } from '../utils/jwt';
import { handleInternalError } from '../utils/errors';
import { OIDCConfiguration, JWKSResponse } from '../types';

/**
 * OIDC Discovery endpoint
 * GET /.well-known/openid-configuration
 */
export const getOIDCConfiguration = async (req: Request, res: Response): Promise<void> => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const configuration: OIDCConfiguration = {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      userinfo_endpoint: `${baseUrl}/userinfo`,
      revocation_endpoint: `${baseUrl}/revoke`,
      introspection_endpoint: `${baseUrl}/introspect`,
      jwks_uri: `${baseUrl}/jwks.json`,
      response_types_supported: ['code', 'id_token', 'token id_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256', 'HS256'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      claims_supported: [
        'sub',
        'iss',
        'aud',
        'exp',
        'iat',
        'auth_time',
        'nonce',
        'preferred_username',
        'email',
        'email_verified',
        'given_name',
        'family_name',
        'roles'
      ],
      code_challenge_methods_supported: ['plain', 'S256']
    };

    // Cache for 24 hours
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(configuration);
  } catch (error) {
    handleInternalError(res, error instanceof Error ? error : new Error('Failed to get OIDC configuration'));
  }
};

/**
 * JWKS endpoint
 * GET /jwks.json
 */
export const getJWKS = async (req: Request, res: Response): Promise<void> => {
  try {
    const jwks: JWKSResponse = generateJWKS();

    // Cache for 24 hours
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(jwks);
  } catch (error) {
    handleInternalError(res, error instanceof Error ? error : new Error('Failed to get JWKS'));
  }
};

/**
 * Health check endpoint
 * GET /health
 */
export const healthCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      services: {
        database: 'healthy', // Mock - in production check actual DB connection
        cache: 'healthy',    // Mock - in production check Redis connection
        external_apis: 'healthy' // Mock - check external dependencies
      }
    };

    res.json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Health check failed'
    });
  }
};