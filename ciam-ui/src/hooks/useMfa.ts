import { useState, useCallback, useContext } from 'react';
import { AuthService } from '../services/AuthService';
import { UseMfaReturn, MFATransaction, MFAChallengeResponse, MFAVerifyResponse, MFATransactionStatusResponse, ApiError } from '../types';
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
    method: 'otp' | 'push',
    username?: string
  ): Promise<MFAChallengeResponse> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await authService.initiateMFAChallenge(method, username);

      const transaction: MFATransaction = {
        transactionId: response.transactionId,
        method,
        status: response.challengeStatus,
        expiresAt: response.expiresAt,
        createdAt: new Date().toISOString(),
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
    transactionId: string,
    otp: string
  ): Promise<MFAVerifyResponse> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await authService.verifyMFAChallenge(transactionId, otp);

      // Update transaction status
      setState(prev => ({
        ...prev,
        isLoading: false,
        transaction: prev.transaction ? {
          ...prev.transaction,
          status: 'APPROVED',
        } : null,
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
    transactionId: string,
    pushResult: 'APPROVED' | 'REJECTED' = 'APPROVED'
  ): Promise<MFAVerifyResponse> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await authService.verifyMFAChallenge(transactionId, undefined, pushResult);

      // Update transaction status
      setState(prev => ({
        ...prev,
        isLoading: false,
        transaction: prev.transaction ? {
          ...prev.transaction,
          status: pushResult,
        } : null,
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

  const checkStatus = useCallback(async (
    transactionId: string
  ): Promise<MFATransactionStatusResponse> => {
    try {
      const response = await authService.getMFATransactionStatus(transactionId);

      // Update local transaction status
      setState(prev => ({
        ...prev,
        transaction: prev.transaction && prev.transaction.transactionId === transactionId
          ? {
              ...prev.transaction,
              status: response.challengeStatus,
            }
          : prev.transaction,
      }));

      return response;
    } catch (error) {
      const apiError = error as ApiError;

      setState(prev => ({
        ...prev,
        error: apiError.message || 'Failed to check MFA status',
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
    checkStatus,
    cancelTransaction,
  };
};