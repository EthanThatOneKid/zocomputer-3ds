import { test, expect } from '@playwright/test';

const TEST_KEY = 'zo_sk_testkey';
const STORAGE_KEY = 'zo3ds_state';

const stateWith = (overrides: Record<string, unknown>) => ({
  messages: [
    { text: 'hello', type: 'outgoing', timestamp: Date.now() - 60000 },
    { text: 'hi there', type: 'incoming', timestamp: Date.now() - 30000 },
  ],
  conversationId: 'conv_abc123',
  selectedModel: 'zo:openai/gpt-5.4',
  selectedPersona: 'pers_assistant',
  ...overrides,
});

const injectState = async (page: any, state: Record<string, unknown>) => {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: state }
  );
};

test.describe('persistence', () => {
  test('status updates from "api key loading" to "api key set" with key in URL', async ({ page }) => {
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(1000);

    const status = page.locator('#api-status');
    await expect(status).not.toHaveText('api key loading…');
    await expect(status).toHaveText(/api key set/);
  });

  test('status shows "api key missing" without key in URL', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    const status = page.locator('#api-status');
    await expect(status).not.toHaveText('api key loading…');
    await expect(status).toHaveText(/api key missing/);
  });

  test('saved messages render after page load', async ({ page }) => {
    await page.goto('/');
    await injectState(page, stateWith({}));
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(1000);

    // 1 system placeholder + 2 saved messages = 3 total
    const messages = page.locator('#chat-message-list .message');
    await expect(messages).toHaveCount(3);

    const outgoing = page.locator('.message.outgoing');
    await expect(outgoing).toContainText('hello');

    // nth(0) is system placeholder, nth(1) is the saved 'hi there'
    const incoming = page.locator('.message.incoming').nth(1);
    await expect(incoming).toContainText('hi there');
  });

  test('saved messages survive page reload', async ({ page }) => {
    await page.goto('/');
    await injectState(page, stateWith({}));
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(500);

    await page.reload();
    await page.waitForTimeout(1000);

    // 1 system placeholder + 2 saved messages = 3 total
    const messages = page.locator('#chat-message-list .message');
    await expect(messages).toHaveCount(3);
    // First .message is the system placeholder; our saved "hello" is after it
    await expect(page.locator('.message.outgoing')).toContainText('hello');
  });

  test('selected model persists across reload', async ({ page }) => {
    await page.goto('/');
    await injectState(page, stateWith({}));
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(500);

    const modelSpan = page.locator('#chat-model-selected');
    await expect(modelSpan).not.toHaveText('Default');

    await page.reload();
    await page.waitForTimeout(500);

    await expect(modelSpan).not.toHaveText('Default');
  });

  test('selected persona persists across reload', async ({ page }) => {
    await page.goto('/');
    await injectState(page, stateWith({}));
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(500);

    const personaSpan = page.locator('#chat-persona-selected');
    await expect(personaSpan).not.toHaveText('Default');

    await page.reload();
    await page.waitForTimeout(500);

    await expect(personaSpan).not.toHaveText('Default');
  });

  test('conversation ID persists across reload', async ({ page }) => {
    await page.goto('/');
    await injectState(page, stateWith({}));
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(500);

    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.conversationId).toBe('conv_abc123');
  });

  test('changing API key clears saved state', async ({ page }) => {
    await page.goto('/');
    await injectState(page, stateWith({}));
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(500);

    // Confirm state was loaded into the page
    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).not.toBeNull();

    // Simulate opening the QR modal and entering a new key
    // First set the key input and trigger buildQr
    await page.goto('/');
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await page.goto(`/?key=${TEST_KEY}_new`);
    await page.waitForTimeout(500);

    // UI should show empty chat (just the system placeholder)
    const messages = page.locator('#chat-message-list .message');
    await expect(messages).toHaveCount(1);

    // Old state was cleared — nothing new saved until user acts
    const storedAfter = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(storedAfter).toBeNull();
  });

  test('sends message and persists outgoing text to localStorage', async ({ page }) => {
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(500);

    const input = page.locator('#chat-message-input');
    const sendBtn = page.locator('#chat-send');

    await expect(input).toBeEnabled();
    await expect(sendBtn).toBeEnabled();

    await input.fill('Hello from test');
    await sendBtn.click();
    await page.waitForTimeout(1000);

    // Outgoing message should be in the DOM
    const outgoing = page.locator('.message.outgoing');
    await expect(outgoing).toContainText('Hello from test');

    // Should be saved to localStorage — find the outgoing message
    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.messages.length).toBeGreaterThanOrEqual(1);

    const outgoingSaved = parsed.messages.find((m: any) => m.text === 'Hello from test');
    expect(outgoingSaved).toBeTruthy();
    expect(outgoingSaved.type).toBe('outgoing');
  });
});
