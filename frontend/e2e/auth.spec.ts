import { test, expect } from '@playwright/test';

// Generate unique test credentials
function generateTestCredentials() {
  const timestamp = Date.now().toString(36);
  return {
    email: `e2e_test_${timestamp}@example.com`,
    password: 'TestPassword123!'
  };
}

test.describe('Authentication E2E', () => {
  test.describe('API Level Tests', () => {
    test('should register a new user via API', async ({ page }) => {
      const credentials = generateTestCredentials();
      
      const result = await page.evaluate(async (creds) => {
        const res = await fetch('http://localhost:3001/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds)
        });
        return { status: res.status, body: await res.json() };
      }, credentials);

      expect(result.status).toBe(201);
      expect(result.body.user).toBeDefined();
      expect(result.body.user.email).toBe(credentials.email);
    });

    test('should login with valid credentials via API', async ({ page }) => {
      const credentials = generateTestCredentials();
      
      // Register first
      await page.evaluate(async (creds) => {
        await fetch('http://localhost:3001/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds)
        });
      }, credentials);

      // Then login
      const result = await page.evaluate(async (creds) => {
        const res = await fetch('http://localhost:3001/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds),
          credentials: 'include'
        });
        return { status: res.status, body: await res.json() };
      }, credentials);

      expect(result.status).toBe(200);
      expect(result.body.user).toBeDefined();
      expect(result.body.user.email).toBe(credentials.email);
    });

    test('should reject login with invalid credentials via API', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const res = await fetch('http://localhost:3001/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'nonexistent@example.com',
            password: 'wrongpassword'
          })
        });
        return { status: res.status, body: await res.json() };
      });

      expect(result.status).toBe(401);
      expect(result.body.error).toBeDefined();
    });

    test('should reject registration with invalid email via API', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const res = await fetch('http://localhost:3001/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'invalid-email',
            password: 'password123'
          })
        });
        return { status: res.status, body: await res.json() };
      });

      expect(result.status).toBe(400);
      expect(result.body.error).toContain('Invalid email');
    });

    test('should reject registration with short password via API', async ({ page }) => {
      const timestamp = Date.now().toString(36);
      const result = await page.evaluate(async (ts) => {
        const res = await fetch('http://localhost:3001/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: `test_${ts}@example.com`,
            password: 'short'
          })
        });
        return { status: res.status, body: await res.json() };
      }, timestamp);

      expect(result.status).toBe(400);
      expect(result.body.error).toContain('at least 8 characters');
    });

    test('should get current user when authenticated via API', async ({ page }) => {
      const credentials = generateTestCredentials();
      
      // Register and get cookie
      await page.evaluate(async (creds) => {
        await fetch('http://localhost:3001/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds),
          credentials: 'include'
        });
      }, credentials);

      // Get current user
      const result = await page.evaluate(async () => {
        const res = await fetch('http://localhost:3001/api/auth/me', {
          credentials: 'include'
        });
        return { status: res.status, body: await res.json() };
      });

      expect(result.status).toBe(200);
      expect(result.body.user).toBeDefined();
      expect(result.body.user.email).toBe(credentials.email);
    });

    test('should reject unauthenticated access to protected endpoint via API', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const res = await fetch('http://localhost:3001/api/auth/me');
        return { status: res.status, body: await res.json() };
      });

      expect(result.status).toBe(401);
      expect(result.body.error).toContain('Authentication required');
    });

    test('should change password when authenticated via API', async ({ page }) => {
      const credentials = generateTestCredentials();
      const newPassword = 'NewPassword123!';
      
      // Register
      await page.evaluate(async (creds) => {
        await fetch('http://localhost:3001/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds),
          credentials: 'include'
        });
      }, credentials);

      // Change password
      const changeResult = await page.evaluate(async ({ currentPw, newPw }) => {
        const res = await fetch('http://localhost:3001/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentPassword: currentPw,
            newPassword: newPw
          }),
          credentials: 'include'
        });
        return { status: res.status, body: await res.json() };
      }, { currentPw: credentials.password, newPw: newPassword });

      expect(changeResult.status).toBe(200);
      expect(changeResult.body.message).toContain('Password changed');

      // Verify can login with new password
      const loginResult = await page.evaluate(async (creds) => {
        const res = await fetch('http://localhost:3001/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds)
        });
        return { status: res.status };
      }, { email: credentials.email, password: newPassword });

      expect(loginResult.status).toBe(200);
    });

    test('should logout successfully via API', async ({ page }) => {
      const credentials = generateTestCredentials();
      
      // Register
      await page.evaluate(async (creds) => {
        await fetch('http://localhost:3001/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds),
          credentials: 'include'
        });
      }, credentials);

      // Logout
      const logoutResult = await page.evaluate(async () => {
        const res = await fetch('http://localhost:3001/api/auth/logout', {
          method: 'POST',
          credentials: 'include'
        });
        return { status: res.status, body: await res.json() };
      });

      expect(logoutResult.status).toBe(200);
      expect(logoutResult.body.message).toContain('Logged out');
    });

    test('should delete account when authenticated via API', async ({ page }) => {
      const credentials = generateTestCredentials();
      
      // Register
      await page.evaluate(async (creds) => {
        await fetch('http://localhost:3001/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds),
          credentials: 'include'
        });
      }, credentials);

      // Delete account
      const deleteResult = await page.evaluate(async (password) => {
        const res = await fetch('http://localhost:3001/api/auth/account', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
          credentials: 'include'
        });
        return { status: res.status, body: await res.json() };
      }, credentials.password);

      expect(deleteResult.status).toBe(200);
      expect(deleteResult.body.message).toContain('Account deleted');

      // Verify cannot login anymore
      const loginResult = await page.evaluate(async (creds) => {
        const res = await fetch('http://localhost:3001/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds)
        });
        return { status: res.status };
      }, credentials);

      expect(loginResult.status).toBe(401);
    });
  });

  test.describe('UI Level Tests (when auth UI is implemented)', () => {
    test.skip('should show login form on initial visit when not authenticated', async ({ page }) => {
      // This test should be enabled once auth UI is implemented
      await page.goto('/');
      
      // Expect to see login form instead of dashboard
      await expect(page.locator('form')).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
    });

    test.skip('should login via UI form', async ({ page }) => {
      // This test should be enabled once auth UI is implemented
      const credentials = generateTestCredentials();
      
      // Register via API first
      await page.evaluate(async (creds) => {
        await fetch('http://localhost:3001/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds)
        });
      }, credentials);

      await page.goto('/');
      
      // Fill in login form
      await page.fill('input[type="email"]', credentials.email);
      await page.fill('input[type="password"]', credentials.password);
      await page.click('button[type="submit"]');
      
      // Should redirect to dashboard
      await expect(page.locator('h1')).toContainText('Portfolio Tracker');
    });

    test.skip('should show error on invalid login via UI', async ({ page }) => {
      // This test should be enabled once auth UI is implemented
      await page.goto('/');
      
      await page.fill('input[type="email"]', 'wrong@example.com');
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      
      // Should show error message
      await expect(page.locator('.error')).toContainText('Invalid');
    });

    test.skip('should logout via UI', async ({ page }) => {
      // This test should be enabled once auth UI is implemented
      const credentials = generateTestCredentials();
      
      // Login via API first
      await page.evaluate(async (creds) => {
        await fetch('http://localhost:3001/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds),
          credentials: 'include'
        });
      }, credentials);

      await page.goto('/');
      
      // Click logout button
      await page.click('button:has-text("Logout")');
      
      // Should redirect to login
      await expect(page.locator('input[type="email"]')).toBeVisible();
    });
  });
});
