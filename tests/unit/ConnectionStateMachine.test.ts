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

    it('should allow responded -> active transition', () => {
      expect(ConnectionStateMachine.canTransition('responded', 'active')).toBe(true);
    });

    it('should allow active -> completed transition', () => {
      expect(ConnectionStateMachine.canTransition('active', 'completed')).toBe(true);
    });

    it('should not allow invited -> active transition', () => {
      expect(ConnectionStateMachine.canTransition('invited', 'active')).toBe(false);
    });

    it('should not allow completed -> any transition', () => {
      expect(ConnectionStateMachine.canTransition('completed', 'active')).toBe(false);
    });

    it('should allow any state -> error transition', () => {
      expect(ConnectionStateMachine.canTransition('invited', 'error')).toBe(true);
      expect(ConnectionStateMachine.canTransition('requested', 'error')).toBe(true);
      expect(ConnectionStateMachine.canTransition('responded', 'error')).toBe(true);
      expect(ConnectionStateMachine.canTransition('active', 'error')).toBe(true);
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
        ConnectionStateMachine.validateTransition('invited', 'active');
      }).toThrow('Invalid state transition');
    });
  });

  describe('getNextState', () => {
    it('should return next state for invited', () => {
      expect(ConnectionStateMachine.getNextState('invited')).toBe('requested');
    });

    it('should return null for completed', () => {
      expect(ConnectionStateMachine.getNextState('completed')).toBeNull();
    });
  });
});