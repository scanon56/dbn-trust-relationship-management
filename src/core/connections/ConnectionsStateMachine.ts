// src/core/connections/ConnectionStateMachine.ts
import { ConnectionState } from '../../types/connection.types';
import { ConnectionError } from '../../utils/errors';

export class ConnectionStateMachine {
  private static readonly validTransitions: Record<ConnectionState, ConnectionState[]> = {
    invited: ['requested', 'error'],
    requested: ['responded', 'error'],
    responded: ['active', 'error'],
    active: ['completed', 'error'],
    completed: [],
    error: ['invited', 'requested'], // Allow retry
  };

  /**
   * Check if transition is valid
   */
  static canTransition(from: ConnectionState, to: ConnectionState): boolean {
    const allowedStates = this.validTransitions[from];
    return allowedStates.includes(to);
  }

  /**
   * Validate and throw if invalid
   */
  static validateTransition(from: ConnectionState, to: ConnectionState): void {
    if (!this.canTransition(from, to)) {
      throw new ConnectionError(
        `Invalid state transition from ${from} to ${to}`,
        'INVALID_STATE_TRANSITION',
        { from, to, allowedTransitions: this.validTransitions[from] }
      );
    }
  }

  /**
   * Get next expected state
   */
  static getNextState(current: ConnectionState): ConnectionState | null {
    const transitions = this.validTransitions[current];
    if (transitions.length === 0) return null;
    return transitions[0]; // Return primary next state
  }
}