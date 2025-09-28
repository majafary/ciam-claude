/**
 * Utility functions for saving and retrieving usernames from localStorage
 */

const USERNAME_STORAGE_KEY = 'ciam_saved_username';

export const usernameStorage = {
  /**
   * Save username to localStorage
   */
  save: (username: string): void => {
    try {
      if (username && username.trim()) {
        localStorage.setItem(USERNAME_STORAGE_KEY, username.trim());
      }
    } catch (error) {
      console.warn('Failed to save username to localStorage:', error);
    }
  },

  /**
   * Get saved username from localStorage
   */
  get: (): string => {
    try {
      return localStorage.getItem(USERNAME_STORAGE_KEY) || '';
    } catch (error) {
      console.warn('Failed to retrieve username from localStorage:', error);
      return '';
    }
  },

  /**
   * Remove saved username from localStorage
   */
  remove: (): void => {
    try {
      localStorage.removeItem(USERNAME_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to remove username from localStorage:', error);
    }
  },

  /**
   * Check if a username is currently saved
   */
  hasSaved: (): boolean => {
    try {
      return Boolean(localStorage.getItem(USERNAME_STORAGE_KEY));
    } catch (error) {
      console.warn('Failed to check saved username:', error);
      return false;
    }
  }
};