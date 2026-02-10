import { query, run, lastInsertId, getDB, beginTransaction, commitTransaction, rollbackTransaction, saveDB } from './index.js';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export interface User {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export async function createUser(email: string, passwordHash: string): Promise<User> {
  const db = getDB();

  // Check if user already exists
  const existing = query<User>('SELECT id, email, password_hash, created_at FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    throw new Error('User with this email already exists');
  }

  beginTransaction();
  try {
    run(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, passwordHash]
    );

    const userId = lastInsertId();
    const user = query<User>(
      'SELECT id, email, password_hash, created_at FROM users WHERE id = ?',
      [userId]
    )[0];

    commitTransaction();
    saveDB();

    return user!;
  } catch (error) {
    rollbackTransaction();
    throw error;
  }
}

export function findUserByEmail(email: string): User | undefined {
  const results = query<User>(
    'SELECT id, email, password_hash, created_at FROM users WHERE email = ?',
    [email]
  );
  return results[0];
}

export function findUserById(id: number): User | undefined {
  const results = query<User>(
    'SELECT id, email, password_hash, created_at FROM users WHERE id = ?',
    [id]
  );
  return results[0];
}

export function findUserByIdWithoutPassword(id: number): { id: number; email: string; created_at: string } | undefined {
  const results = query<{ id: number; email: string; created_at: string }>(
    'SELECT id, email, created_at FROM users WHERE id = ?',
    [id]
  );
  return results[0];
}

export async function updatePassword(userId: number, newHash: string): Promise<void> {
  run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
  saveDB();
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}
