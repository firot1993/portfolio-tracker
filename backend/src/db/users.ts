import { eq } from 'drizzle-orm';
import { getDB, getSqliteDB, users, type User } from './index.js';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export type { User };

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export async function createUser(email: string, passwordHash: string): Promise<User> {
  const db = getDB();
  const sqliteDb = getSqliteDB();

  // Check if user already exists
  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    throw new Error('User with this email already exists');
  }

  // Use better-sqlite3 transaction
  const transaction = sqliteDb.transaction(() => {
    const result = db.insert(users).values({
      email,
      passwordHash,
    }).returning().get();

    return result;
  });

  return transaction()!;
}

export function findUserByEmail(email: string): User | undefined {
  const db = getDB();
  return db.select().from(users).where(eq(users.email, email)).get();
}

export function findUserById(id: number): User | undefined {
  const db = getDB();
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function findUserByIdWithoutPassword(id: number): { id: number; email: string; createdAt: string | null } | undefined {
  const db = getDB();
  const result = db.select({
    id: users.id,
    email: users.email,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, id)).get();
  return result;
}

export async function updatePassword(userId: number, newHash: string): Promise<void> {
  const db = getDB();
  db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId)).run();
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}
