// tests/unit/ConnectionStateMachine.test.ts
import { ConnectionStateMachine } from '../../src/core/connections/ConnectionsStateMachine';

describe('ConnectionStateMachine', () => {
  describe('canTransition', () => {
    it('should allow invited -> requested transition', () => {
      expect(ConnectionStateMachine.canTransition('invited', 'requested')).toBe(true);
    });

    it('should allow requested -> responded transition', () => {
      expect(ConnectionStateMachine.canTransition('requested', 'responded')).toBe(true);
    });

    it('should allow responded -> complete transition', () => {
      expect(ConnectionStateMachine.canTransition('responded', 'complete')).toBe(true);
    });

    it('should not allow invited -> complete transition', () => {
      expect(ConnectionStateMachine.canTransition('invited', 'complete')).toBe(false);
    });

    it('should not allow complete -> any transition', () => {
      expect(ConnectionStateMachine.canTransition('complete', 'responded')).toBe(false);
    });

    it('should allow any state -> error transition', () => {
      expect(ConnectionStateMachine.canTransition('invited', 'error')).toBe(true);
      expect(ConnectionStateMachine.canTransition('requested', 'error')).toBe(true);
      expect(ConnectionStateMachine.canTransition('responded', 'error')).toBe(true);
      expect(ConnectionStateMachine.canTransition('complete', 'error')).toBe(true);
    });
  });

  describe('validateTransition', () => {
    it('should not throw for valid transition', () => {
      expect(() => {
        ConnectionStateMachine.validateTransition('invited', 'requested');
      }).not.toThrow();
    });

    it('should throw for invalid transition', () => {
      expect(() => {
        ConnectionStateMachine.validateTransition('invited', 'complete');
      }).toThrow('Invalid state transition');
    });
  });

  describe('getNextState', () => {
    it('should return next state for invited', () => {
      expect(ConnectionStateMachine.getNextState('invited')).toBe('requested');
    });

    it('should return error for complete (optional recovery path)', () => {
      expect(ConnectionStateMachine.getNextState('complete')).toBe('error');
    });
  });
});