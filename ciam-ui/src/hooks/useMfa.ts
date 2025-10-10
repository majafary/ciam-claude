import { useState, useCallback, useContext } from 'react';
import { AuthService } from '../services/AuthService';
import { UseMfaReturn, MFATransaction, MFAChallengeResponse, MFAVerifyResponse, ApiError } from '../types';
import { CiamContext } from '../components/CiamProvider';

export const useMfa = (): UseMfaReturn => {
  const context = useContext(CiamContext);

  if (!context) {
    throw new Error('useMfa must be used within a CiamProvider');
  }

  const { authService, config } = context;

  const [state, setState] = useState({
    transaction: null as MFATransaction | null,
    isLoading: false,
    error: null as string | null,
  });

  const initiateChallenge = useCallback(async (
    method: 'sms' | 'voice' | 'push',
    contextId: string,
    transactionId: string,
    mfaOptionId?: number
  ): Promise<MFAChallengeResponse> => {
    try {
      console.log('🔍 useMfa.initiateChallenge called with:', { method, contextId, transactionId, mfaOptionId });
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // For v3.0.0, we use context_id and transaction_id from login response
      const response = await authService.initiateMFAChallenge(contextId, transactionId, method, mfaOptionId);

      const transaction: MFATransaction = {
        transaction_id: response.transaction_id,
        method,
        expires_at: response.expires_at,
        created_at: new Date().toISOString(),
        display_number: response.display_number, // Single number to display on UI for push challenges
      };

      setState(prev => ({
        ...prev,
        isLoading: false,
        transaction,
      }));

      return response;
    } catch (error) {
      const apiError = error as ApiError;

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: apiError.message || 'Failed to initiate MFA challenge',
      }));

      throw error;
    }
  }, [authService]);

  const verifyOtp = useCallback(async (
    contextId: string,
    transactionId: string,
    otp: string
  ): Promise<MFAVerifyResponse> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await authService.verifyOTPChallenge(contextId, transactionId, otp);

      setState(prev => ({
        ...prev,
        isLoading: false,
      }));

      return response;
    } catch (error) {
      const apiError = error as ApiError;

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: apiError.message || 'OTP verification failed',
      }));

      throw error;
    }
  }, [authService]);

  const verifyPush = useCallback(async (
    contextId: string,
    transactionId: string
  ): Promise<MFAVerifyResponse> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await authService.verifyPushChallenge(contextId, transactionId);

      setState(prev => ({
        ...prev,
        isLoading: false,
      }));

      return response;
    } catch (error) {
      const apiError = error as ApiError;

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: apiError.message || 'Push verification failed',
      }));

      throw error;
    }
  }, [authService]);

  const pollPushStatus = useCallback(async (
    contextId: string,
    transactionId: string
  ): Promise<MFAVerifyResponse> => {
    try {
      // Use verifyPushChallenge for polling - returns MFA_PENDING if still pending
      const response = await authService.verifyPushChallenge(contextId, transactionId);

      return response;
    } catch (error) {
      const apiError = error as ApiError;

      setState(prev => ({
        ...prev,
        error: apiError.message || 'Failed to check push status',
      }));

      throw error;
    }
  }, [authService]);


  const cancelTransaction = useCallback(() => {
    setState(prev => ({
      ...prev,
      transaction: null,
      error: null,
    }));
  }, []);

  return {
    transaction: state.transaction,
    isLoading: state.isLoading,
    error: state.error,
    initiateChallenge,
    verifyOtp,
    verifyPush,
    pollPushStatus,
    cancelTransaction,
  };
};