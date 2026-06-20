const { test, expect } = require('@playwright/test');

test('keeps chat disabled until a key is present', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('api key missing · tap for QR')).toBeVisible();
  await expect(page.locator('#chat-message-input')).toBeDisabled();
  await expect(page.locator('#chat-send')).toBeDisabled();
});

test('prompts for a key before showing the QR code', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /api key missing/i }).click();

  await expect(page.locator('#qr-setup')).toBeVisible();
  await expect(page.locator('#qr-result')).toBeHidden();
  await expect(page.locator('#qr-copy')).toContainText('Enter an API key first');
});

test('unlocks chat and renders a local QR after a key is entered', async ({ page }) => {
  const key = '3ds-demo-key';

  await page.goto('/');
  await page.getByRole('button', { name: /api key missing/i }).click();
  await page.locator('#qr-key-input').fill(key);
  await page.getByRole('button', { name: 'Build QR' }).click();

  await expect(page.getByText('api key set · tap for QR')).toBeVisible();
  await expect(page.locator('#chat-message-input')).toBeEnabled();
  await expect(page.locator('#chat-send')).toBeEnabled();
  await expect(page.locator('#qr-setup')).toBeHidden();
  await expect(page.locator('#qr-result')).toBeVisible();
  await expect(page.locator('#qr-link')).toHaveAttribute('href', new RegExp(`key=${encodeURIComponent(key)}`));
  await expect(page.locator('#qr-image')).toHaveAttribute('viewBox', /0 0 \d+ \d+/);
  await expect(page.locator('#qr-image path')).toHaveCount(1);

  expect(await page.evaluate(() => window.ZO_API_KEY)).toBe(key);
});

test('hydrates the key from the URL on load', async ({ page }) => {
  const key = 'preloaded-key';

  await page.goto(`/?key=${encodeURIComponent(key)}`);
  await page.getByRole('button', { name: /api key set/i }).click();

  await expect(page.locator('#chat-message-input')).toBeEnabled();
  await expect(page.locator('#qr-setup')).toBeHidden();
  await expect(page.locator('#qr-result')).toBeVisible();
  await expect(page.locator('#qr-link')).toHaveAttribute('href', new RegExp(`key=${encodeURIComponent(key)}`));
  expect(await page.evaluate(() => window.ZO_API_KEY)).toBe(key);
});
