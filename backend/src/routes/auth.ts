import { Router, Response } from 'express';
import { AuthenticatedRequest, authMiddleware, generateToken } from '../middleware/auth.js';
import { createUser, findUserByEmail, hashPassword, verifyPassword, updatePassword } from '../db/users.js';
import { query, run, saveDB } from '../db/index.js';

const router = Router();

// Register new user
router.post('/register', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser(email, passwordHash);

    const token = generateToken({ userId: user.id, email: user.email });

    // Set httpOnly cookie
    // Note: secure:false is required for localhost cross-port cookies
    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      user: { id: user.id, email: user.email, created_at: user.created_at },
    });
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken({ userId: user.id, email: user.email });

    // Set httpOnly cookie
    // Note: secure:false is required for localhost cross-port cookies
    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      user: { id: user.id, email: user.email, created_at: user.created_at },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
router.post('/logout', (_req: AuthenticatedRequest, res: Response) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.json({ message: 'Logged out successfully' });
});

// Get current user
router.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    user: {
      id: req.user!.id,
      email: req.user!.email,
    },
  });
});

// Change password
router.post('/change-password', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const user = findUserByEmail(req.user!.email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await verifyPassword(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(newPassword);
    await updatePassword(user.id, newHash);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Delete account
router.delete('/account', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const user = findUserByEmail(req.user!.email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    // Delete all user data (cascade should handle this via queries)
    // First delete user-specific data
    const userId = req.user!.id;

    // Delete transactions, holdings (will be handled by cascade if FK constraints exist)
    // Delete user's assets (owned by user)
    run('DELETE FROM transactions WHERE user_id = ?', [userId]);
    run('DELETE FROM holdings WHERE user_id = ?', [userId]);
    run('DELETE FROM accounts WHERE user_id = ?', [userId]);
    run('DELETE FROM price_history WHERE user_id = ?', [userId]);

    // Finally delete the user
    run('DELETE FROM users WHERE id = ?', [userId]);
    saveDB();

    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;
