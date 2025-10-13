/**
 * Push Challenge Repository
 * Data access layer for push challenge storage
 * Extracted from auth-simple.ts lines 17-25, 64, 112-120
 */

export interface PushChallenge {
  transactionId: string;
  numbers: number[];
  correctNumber: number;
  username: string;
  createdAt: number;
  attempts: number;
}

/**
 * Generate 3 random numbers for push challenge
 * Extracted from auth-simple.ts lines 112-120
 */
function generatePushNumbers(): { numbers: number[], correctNumber: number } {
  const numbers = [
    Math.floor(Math.random() * 9) + 1,
    Math.floor(Math.random() * 9) + 1,
    Math.floor(Math.random() * 9) + 1
  ];
  const correctNumber = numbers[Math.floor(Math.random() * 3)];
  return { numbers, correctNumber };
}

class PushChallengeRepository {
  private challenges: Map<string, PushChallenge>;

  constructor() {
    this.challenges = new Map();
  }

  /**
   * Create a new push challenge
   */
  create(transactionId: string, username: string): PushChallenge {
    const { numbers, correctNumber } = generatePushNumbers();

    const challenge: PushChallenge = {
      transactionId,
      numbers,
      correctNumber,
      username,
      createdAt: Date.now(),
      attempts: 0
    };

    this.challenges.set(transactionId, challenge);

    console.log('🎲 [PUSH CHALLENGE] Created:', {
      transactionId,
      numbers,
      correctNumber,
      username
    });

    return challenge;
  }

  /**
   * Find challenge by transaction ID
   */
  findById(transactionId: string): PushChallenge | null {
    return this.challenges.get(transactionId) || null;
  }

  /**
   * Update challenge status
   */
  update(transactionId: string, updates: Partial<PushChallenge>): boolean {
    const challenge = this.findById(transactionId);

    if (!challenge) {
      return false;
    }

    Object.assign(challenge, updates);
    this.challenges.set(transactionId, challenge);

    console.log('🔄 [PUSH CHALLENGE] Updated:', { transactionId, updates });

    return true;
  }

  /**
   * Increment attempt counter
   */
  incrementAttempts(transactionId: string): number {
    const challenge = this.findById(transactionId);

    if (!challenge) {
      return 0;
    }

    challenge.attempts++;
    this.challenges.set(transactionId, challenge);

    console.log('🔢 [PUSH CHALLENGE] Attempt incremented:', {
      transactionId,
      attempts: challenge.attempts
    });

    return challenge.attempts;
  }

  /**
   * Verify selected number
   */
  verifyNumber(transactionId: string, selectedNumber: number): boolean {
    const challenge = this.findById(transactionId);

    if (!challenge) {
      return false;
    }

    return challenge.correctNumber === selectedNumber;
  }

  /**
   * Delete challenge
   */
  delete(transactionId: string): boolean {
    const deleted = this.challenges.delete(transactionId);

    if (deleted) {
      console.log('🗑️ [PUSH CHALLENGE] Deleted:', transactionId);
    }

    return deleted;
  }

  /**
   * Check if challenge exists
   */
  exists(transactionId: string): boolean {
    return this.challenges.has(transactionId);
  }

  /**
   * Get all challenges (for debugging)
   */
  getAll(): PushChallenge[] {
    return Array.from(this.challenges.values());
  }

  /**
   * Clear all challenges (for testing)
   */
  clear(): void {
    this.challenges.clear();
    console.log('🧹 [PUSH CHALLENGE] Cleared all challenges');
  }

  /**
   * Clean up expired challenges (older than 10 minutes)
   */
  cleanupExpired(): number {
    const now = Date.now();
    const expiryTime = 10 * 60 * 1000; // 10 minutes
    let cleaned = 0;

    for (const [transactionId, challenge] of this.challenges.entries()) {
      if (now - challenge.createdAt > expiryTime) {
        this.challenges.delete(transactionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [PUSH CHALLENGE] Cleaned up ${cleaned} expired challenges`);
    }

    return cleaned;
  }
}

// Export singleton instance
export const pushChallengeRepository = new PushChallengeRepository();

// Set up periodic cleanup (every 5 minutes)
setInterval(() => {
  pushChallengeRepository.cleanupExpired();
}, 5 * 60 * 1000);
