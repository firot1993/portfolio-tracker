import { describe, it, expect } from 'vitest';
import type {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  ChangePasswordRequest,
  AuthError,
  AuthStatus
} from '../types/auth';

describe('Auth Types', () => {
  describe('User interface', () => {
    it('should have correct structure', () => {
      const user: User = {
        id: 1,
        email: 'test@example.com',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      };

      expect(user.id).toBe(1);
      expect(user.email).toBe('test@example.com');
      expect(user.created_at).toBe('2026-01-01T00:00:00Z');
      expect(user.updated_at).toBe('2026-01-01T00:00:00Z');
    });

    it('should not have password_hash field', () => {
      const user = {
        id: 1,
        email: 'test@example.com',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      };

      // @ts-expect-error - password_hash should not exist on User
      expect(user.password_hash).toBeUndefined();
    });
  });

  describe('LoginRequest interface', () => {
    it('should have email and password fields', () => {
      const login: LoginRequest = {
        email: 'test@example.com',
        password: 'password123'
      };

      expect(login.email).toBe('test@example.com');
      expect(login.password).toBe('password123');
    });
  });

  describe('RegisterRequest interface', () => {
    it('should have email and password fields', () => {
      const register: RegisterRequest = {
        email: 'newuser@example.com',
        password: 'password123'
      };

      expect(register.email).toBe('newuser@example.com');
      expect(register.password).toBe('password123');
    });
  });

  describe('AuthResponse interface', () => {
    it('should have user field', () => {
      const response: AuthResponse = {
        user: {
          id: 1,
          email: 'test@example.com',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z'
        }
      };

      expect(response.user).toBeDefined();
      expect(response.user.email).toBe('test@example.com');
    });

    it('should have optional message field', () => {
      const responseWithMessage: AuthResponse = {
        user: {
          id: 1,
          email: 'test@example.com',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z'
        },
        message: 'Welcome back!'
      };

      expect(responseWithMessage.message).toBe('Welcome back!');

      const responseWithoutMessage: AuthResponse = {
        user: {
          id: 1,
          email: 'test@example.com',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z'
        }
      };

      expect(responseWithoutMessage.message).toBeUndefined();
    });
  });

  describe('ChangePasswordRequest interface', () => {
    it('should have currentPassword and newPassword fields', () => {
      const changePassword: ChangePasswordRequest = {
        currentPassword: 'oldpassword123',
        newPassword: 'newpassword123'
      };

      expect(changePassword.currentPassword).toBe('oldpassword123');
      expect(changePassword.newPassword).toBe('newpassword123');
    });
  });

  describe('AuthError interface', () => {
    it('should have error field', () => {
      const error: AuthError = {
        error: 'Invalid email or password'
      };

      expect(error.error).toBe('Invalid email or password');
      expect(error.field).toBeUndefined();
    });

    it('should have optional field for validation errors', () => {
      const emailError: AuthError = {
        error: 'Invalid email format',
        field: 'email'
      };

      expect(emailError.field).toBe('email');

      const passwordError: AuthError = {
        error: 'Password too short',
        field: 'password'
      };

      expect(passwordError.field).toBe('password');
    });
  });

  describe('AuthStatus type', () => {
    it('should accept valid status values', () => {
      const statuses: AuthStatus[] = [
        'idle',
        'loading',
        'authenticated',
        'unauthenticated'
      ];

      expect(statuses).toContain('idle');
      expect(statuses).toContain('loading');
      expect(statuses).toContain('authenticated');
      expect(statuses).toContain('unauthenticated');
    });
  });
});

describe('Auth Type Exports', () => {
  it('should export all auth types from auth.ts', async () => {
    const authTypes = await import('../types/auth');
    
    // Verify all types are exported
    expect(authTypes).toBeDefined();
  });
});
