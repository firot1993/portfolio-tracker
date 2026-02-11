export interface User {
  id: number;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  message?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AuthError {
  error: string;
  field?: 'email' | 'password' | 'currentPassword' | 'newPassword';
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
