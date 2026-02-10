import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { initDB } from '../db/index.js';
import authRouter from '../routes/auth.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);

describe('Authentication API', () => {
  beforeAll(async () => {
    await initDB(true);
  });

  beforeEach(async () => {
    // Clean up users before each test
    const { run, saveDB } = await import('../db/index.js');
    run("DELETE FROM users WHERE email LIKE 'test_%' OR email LIKE 'auth_%'");
    saveDB();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test_register@example.com',
          password: 'password123'
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('test_register@example.com');
      expect(res.body.user.id).toBeDefined();
      expect(res.body.user.created_at).toBeDefined();
      expect(res.body.user.password_hash).toBeUndefined();
      
      // Should set httpOnly cookie
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('token=');
      expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
    });

    it('should reject registration with invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid email');
    });

    it('should reject registration with short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test_short@example.com',
          password: 'short'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('at least 8 characters');
    });

    it('should reject duplicate email registration', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test_duplicate@example.com',
          password: 'password123'
        });

      // Second registration with same email
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test_duplicate@example.com',
          password: 'password123'
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });

    it('should reject registration with missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test_missing@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test_login@example.com',
          password: 'password123'
        });
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test_login@example.com',
          password: 'password123'
        });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('test_login@example.com');
      
      // Should set httpOnly cookie
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('token=');
    });

    it('should reject login with invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test_login@example.com',
          password: 'wrongpassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid');
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid');
    });

    it('should reject login with missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test_login@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear the auth cookie on logout', async () => {
      const res = await request(app)
        .post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Logged out');
      
      // Should clear the cookie
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('token=;');
    });
  });

  describe('GET /api/auth/me', () => {
    let authCookie: string;

    beforeEach(async () => {
      // Register and login to get auth cookie
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test_me@example.com',
          password: 'password123'
        });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test_me@example.com',
          password: 'password123'
        });

      authCookie = loginRes.headers['set-cookie'][0];
    });

    it('should return current user when authenticated', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('test_me@example.com');
    });

    it('should reject request without auth cookie', async () => {
      const res = await request(app)
        .get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('should reject request with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', ['token=invalidtoken']);

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid or expired token');
    });
  });

  describe('POST /api/auth/change-password', () => {
    let authCookie: string;

    beforeEach(async () => {
      // Register and login to get auth cookie
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test_changepw@example.com',
          password: 'oldpassword123'
        });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test_changepw@example.com',
          password: 'oldpassword123'
        });

      authCookie = loginRes.headers['set-cookie'][0];
    });

    it('should change password with valid current password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', [authCookie])
        .send({
          currentPassword: 'oldpassword123',
          newPassword: 'newpassword123'
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Password changed');

      // Verify can login with new password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test_changepw@example.com',
          password: 'newpassword123'
        });

      expect(loginRes.status).toBe(200);
    });

    it('should reject change with incorrect current password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', [authCookie])
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123'
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('incorrect');
    });

    it('should reject change with short new password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', [authCookie])
        .send({
          currentPassword: 'oldpassword123',
          newPassword: 'short'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('at least 8 characters');
    });

    it('should reject change without authentication', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'oldpassword123',
          newPassword: 'newpassword123'
        });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/auth/account', () => {
    let authCookie: string;
    const testEmail = 'test_delete@example.com';
    const testPassword = 'password123';

    beforeEach(async () => {
      // Register and login to get auth cookie
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: testPassword
        });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      authCookie = loginRes.headers['set-cookie'][0];
    });

    it('should delete account with correct password', async () => {
      const res = await request(app)
        .delete('/api/auth/account')
        .set('Cookie', [authCookie])
        .send({ password: testPassword });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Account deleted');

      // Verify cookie is cleared
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('token=;');

      // Verify cannot login anymore
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword
        });

      expect(loginRes.status).toBe(401);
    });

    it('should reject deletion with incorrect password', async () => {
      const res = await request(app)
        .delete('/api/auth/account')
        .set('Cookie', [authCookie])
        .send({ password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('incorrect');
    });

    it('should reject deletion without authentication', async () => {
      const res = await request(app)
        .delete('/api/auth/account')
        .send({ password: testPassword });

      expect(res.status).toBe(401);
    });

    it('should reject deletion without password', async () => {
      const res = await request(app)
        .delete('/api/auth/account')
        .set('Cookie', [authCookie])
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });
  });
});
