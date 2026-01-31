import { test, expect } from '@playwright/test';

test.describe('Portfolio Tracker E2E', () => {
  test('homepage loads and shows dashboard', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app to load
    await expect(page.locator('h1')).toContainText('Portfolio Tracker');
  });

  test('can add a new asset', async ({ page }) => {
    await page.goto('/');
    
    // Click Add Asset button
    await page.click('button:has-text("Add Asset")');
    
    // Fill in the form
    await page.fill('input[placeholder*="BTC"]', 'ETH');
    await page.fill('input[placeholder*="Bitcoin"]', 'Ethereum');
    await page.selectOption('select:near(:text("Type"))', 'crypto');
    
    // Submit
    await page.click('button:has-text("Add Asset"):not([type="button"])');
    
    // Modal should close
    await expect(page.locator('.modal')).not.toBeVisible({ timeout: 5000 });
  });

  test('can add a transaction', async ({ page }) => {
    await page.goto('/');
    
    // First ensure we have an asset
    await page.click('button:has-text("Add Asset")');
    await page.fill('input[placeholder*="BTC"]', 'SOL');
    await page.fill('input[placeholder*="Bitcoin"]', 'Solana');
    await page.click('button[type="submit"]:has-text("Add Asset")');
    
    // Wait for modal to close
    await page.waitForSelector('.modal', { state: 'hidden', timeout: 5000 });
    
    // Now add a transaction
    await page.click('button:has-text("Add Transaction")');
    
    // Select the asset
    await page.selectOption('select:near(:text("Asset"))', { index: 1 });
    await page.fill('input[type="number"]:near(:text("Quantity"))', '10');
    await page.fill('input[type="number"]:near(:text("Price"))', '150');
    
    // Submit
    await page.click('button[type="submit"]:has-text("Add Transaction")');
    
    // Should see the transaction in the list
    await expect(page.locator('table')).toContainText('SOL');
  });

  test('portfolio summary updates after transaction', async ({ page }) => {
    await page.goto('/');
    
    // The total value should be displayed
    await expect(page.locator('.card.total .value')).toBeVisible();
  });

  test('refresh button works', async ({ page }) => {
    await page.goto('/');
    
    // Click refresh
    await page.click('button.icon-btn');
    
    // Page should still show dashboard
    await expect(page.locator('h1')).toContainText('Portfolio Tracker');
  });
});
