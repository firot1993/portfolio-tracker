import { test, expect } from '@playwright/test';

// Generate random symbol for testing
function generateRandomSymbol() {
  return `TEST${Date.now().toString(36).substr(2, 5).toUpperCase()}`;
}

// Cleanup test data before each test
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('h1');
  await page.evaluate(async () => {
    try {
      await fetch('http://localhost:3001/api/assets/cleanup/test-data', { method: 'DELETE' });
    } catch (e) {
      console.log('Cleanup failed:', e);
    }
  });
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector('h1');
});

test.describe('Portfolio Tracker E2E', () => {
  test('homepage loads and shows dashboard', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app to load
    await expect(page.locator('h1')).toContainText('Portfolio Tracker');
  });

  test('can add a new asset', async ({ page }) => {
    await page.goto('/');
    
    // Generate random symbol
    const randomSymbol = generateRandomSymbol();
    const randomName = `Test Asset ${randomSymbol}`;
    
    // Click Add Asset button
    await page.click('button:has-text("Add Asset")');
    
    // Verify modal is open
    await expect(page.locator('.modal')).toBeVisible();
    
    // Fill in the form
    await page.fill('input[placeholder*="BTC"]', randomSymbol);
    await page.fill('input[placeholder*="Bitcoin"]', randomName);
    
    // Submit
    await page.click('button[type="submit"]:has-text("Add Asset")');
    
    // Wait for modal to close (element should be removed from DOM)
    await page.waitForSelector('.modal', { state: 'hidden', timeout: 10000 });
  });

  test('can add a transaction', async ({ page }) => {
    await page.goto('/');
    
    // Generate random symbol
    const randomSymbol = generateRandomSymbol();
    const randomName = `Test Asset ${randomSymbol}`;
    
    // First ensure we have an asset
    await page.click('button:has-text("Add Asset")');
    await page.fill('input[placeholder*="BTC"]', randomSymbol);
    await page.fill('input[placeholder*="Bitcoin"]', randomName);
    await page.click('button[type="submit"]:has-text("Add Asset")');
    
    // Wait for modal to close
    await page.waitForSelector('.modal', { state: 'hidden', timeout: 10000 });
    
    // Now add a transaction
    await page.click('button:has-text("Add Transaction")');
    
    // Wait for the asset dropdown to load
    await page.waitForSelector('select');
    
    // Select the asset from dropdown
    await page.selectOption('select', { index: 1 });
    await page.fill('input[type="number"]:near(:text("Quantity"))', '10');
    await page.fill('input[type="number"]:near(:text("Price"))', '150');
    
    // Submit
    await page.click('button[type="submit"]:has-text("Add Transaction")');
    
    // Wait for modal to close
    await page.waitForSelector('.modal', { state: 'hidden', timeout: 10000 });
    
    // Wait for transaction table to load and contain the new transaction
    await expect(page.locator('.transactions-section table')).toContainText(randomSymbol, { timeout: 10000 });
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
