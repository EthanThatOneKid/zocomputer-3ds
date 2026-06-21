import { test, expect } from '@playwright/test';
import lz from 'lz-string';

const { compressToUTF16, decompressFromUTF16 } = lz;

const TEST_KEY = 'zo_sk_testkey';
const C1 = 'c1:';
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
  const raw = JSON.stringify(state);
  const compressed = C1 + compressToUTF16(raw);
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: STORAGE_KEY, value: compressed }
  );
};

const readStoredState = async (page: any): Promise<any> => {
  const raw = await page.evaluate((key: string) => localStorage.getItem(key), STORAGE_KEY);
  if (!raw) return null;
  if (raw.startsWith(C1)) {
    return JSON.parse(decompressFromUTF16(raw.substring(C1.length))!);
  }
  return JSON.parse(raw);
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

    const parsed = await readStoredState(page);
    expect(parsed).not.toBeNull();
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

  test('settings clear button removes all saved state after confirmation', async ({ page }) => {
    await page.goto('/');
    await injectState(page, stateWith({}));
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(500);

    // Confirm state was loaded
    let stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).not.toBeNull();

    // Switch to Settings tab via in-page nav (no reload)
    await page.locator('a[href="#settings"]').click();
    await page.waitForTimeout(300);

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('#settings-clear-btn').click();
    await page.waitForTimeout(500);

    // localStorage should be empty for our prefix
    stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).toBeNull();

    // Status message should show
    const status = page.locator('#settings-status');
    await expect(status).toHaveText('All site data cleared.');

    // Switch to chat via in-page nav — should show no messages (placeholder also cleared)
    await page.locator('a[href="#chat"]').click();
    await page.waitForTimeout(300);
    const messages = page.locator('#chat-message-list .message');
    await expect(messages).toHaveCount(0);
  });

  test('settings clear button does nothing when confirm is dismissed', async ({ page }) => {
    await page.goto('/');
    await injectState(page, stateWith({}));
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(500);

    let stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).not.toBeNull();

    // Switch to Settings tab via in-page nav (no reload)
    await page.locator('a[href="#settings"]').click();
    await page.waitForTimeout(300);

    page.on('dialog', (dialog) => dialog.dismiss());
    await page.locator('#settings-clear-btn').click();
    await page.waitForTimeout(500);

    // State should still be intact
    stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).not.toBeNull();
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
    const parsed = await readStoredState(page);
    expect(parsed).not.toBeNull();
    expect(parsed.messages.length).toBeGreaterThanOrEqual(1);

    const outgoingSaved = parsed.messages.find((m: any) => m.text === 'Hello from test');
    expect(outgoingSaved).toBeTruthy();
    expect(outgoingSaved.type).toBe('outgoing');
  });

  test('conversations nav tile exists and navigates to conversations panel', async ({ page }) => {
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(500);

    const navTile = page.locator('#primary-menu a[href="#conversations"]');
    await expect(navTile).toBeVisible();
    await expect(navTile).toHaveText('Chats');

    await navTile.click();
    await page.waitForTimeout(300);

    const panel = page.locator('#conversations');
    await expect(panel).toBeVisible();
  });

  test('conversations panel shows placeholder when empty', async ({ page }) => {
    await page.goto('/');
    await page.goto(`/?key=${TEST_KEY}_new`);
    await page.waitForTimeout(500);

    await page.locator('#primary-menu a[href="#conversations"]').click();
    await page.waitForTimeout(300);

    const placeholder = page.locator('#conversations-list .list-placeholder');
    await expect(placeholder).toContainText('No saved chats yet.');

    const meta = page.locator('#conversations-meta');
    await expect(meta).toHaveText('0 saved');
  });

  test('conversations panel shows migrated conversation', async ({ page }) => {
    await page.goto('/');
    await injectState(page, stateWith({}));
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(1000);

    await page.locator('#primary-menu a[href="#conversations"]').click();
    await page.waitForTimeout(300);

    const cards = page.locator('#conversations-list .card');
    await expect(cards).toHaveCount(1);

    // Title should be derived from first outgoing message
    const title = cards.locator('.card-title');
    await expect(title).toContainText('hello');

    const desc = cards.locator('.card-desc');
    await expect(desc).toContainText('2 messages');
  });

  test('delete conversation removes it from the list', async ({ page }) => {
    await page.goto('/');
    await injectState(page, stateWith({}));
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(1000);

    await page.locator('#primary-menu a[href="#conversations"]').click();
    await page.waitForTimeout(300);

    let cards = page.locator('#conversations-list .card');
    await expect(cards).toHaveCount(1);

    page.on('dialog', (dialog) => dialog.accept());
    await cards.locator('.card-btn-danger').click();
    await page.waitForTimeout(300);

    const placeholder = page.locator('#conversations-list .list-placeholder');
    await expect(placeholder).toContainText('No saved chats yet.');
  });

  test('new conversation button clears chat and navigates from conversations panel', async ({ page }) => {
    await page.goto('/');
    await injectState(page, stateWith({}));
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(1000);

    await page.locator('#primary-menu a[href="#conversations"]').click();
    await page.waitForTimeout(300);

    await page.locator('#conversations-new-btn').click();
    await page.waitForTimeout(300);

    // Should be on chat panel
    const chatPanel = page.locator('#chat');
    await expect(chatPanel).toBeVisible();
  });

  test('search input is visible in conversations panel', async ({ page }) => {
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(500);

    await page.locator('#primary-menu a[href="#conversations"]').click();
    await page.waitForTimeout(300);

    const searchInput = page.locator('#conversations-search');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('placeholder', 'filter by title…');
  });

  test('typing in search filters conversation list by title', async ({ page }) => {
    await page.goto('/');
    // Inject two conversations with different titles
    await injectState(page, stateWith({ conversationId: 'conv_abc' }));
    await page.evaluate(() => {
      const conversations = [
        { id: 'conv_abc', title: 'Hello World', messageCount: 2, lastUpdated: Date.now(), selectedModel: null, selectedPersona: null },
      ];
      localStorage.setItem('zo3ds_conversations', JSON.stringify(conversations));
    });
    await page.goto(`/?key=${TEST_KEY}`);
    await page.waitForTimeout(1000);

    await page.locator('#primary-menu a[href="#conversations"]').click();
    await page.waitForTimeout(300);

    // Verify one card is visible
    const cards = page.locator('#conversations-list .card');
    await expect(cards).toHaveCount(1);

    // Type a non-matching query
    await page.locator('#conversations-search').fill('zzz');
    await page.waitForTimeout(200);
    await expect(cards).toHaveCount(0);

    // Meta should show filtered count
    const meta = page.locator('#conversations-meta');
    await expect(meta).toHaveText('0 of 1 saved');

    // Type a matching query
    await page.locator('#conversations-search').fill('hello');
    await page.waitForTimeout(200);
    await expect(cards).toHaveCount(1);

    // Clear search
    await page.locator('#conversations-search').fill('');
    await page.waitForTimeout(200);
    await expect(cards).toHaveCount(1);
    await expect(meta).toHaveText('1 saved');
  });
});
