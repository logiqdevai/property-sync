import type { Page } from 'playwright';
import { BlockHandlingConfig } from './block-handling.interface';
import { waitForBotChallengeClearance } from './block-handling.utils';

type Snapshot = {
  title: string;
  text: string;
  html: string;
  path: string;
  scriptContent: string;
};

const PARDON: Snapshot = {
  title: 'Pardon Our Interruption',
  text: 'Pardon Our Interruption As you were browsing something about your browser made us think you were a bot',
  html: '<div class="h-captcha" data-sitekey="k"></div>',
  path: '/',
  scriptContent: '',
};
const REAL_PAGE: Snapshot = {
  title: 'Listings',
  text: 'Real listing page '.repeat(20),
  html: '<div class="listing-item"></div>',
  path: '/',
  scriptContent: '',
};

// Minimal Playwright Page double: evaluate() returns the current snapshot, `solved` flips it.
function fakePage() {
  const state = { snapshot: PARDON };
  const page = {
    evaluate: jest.fn(async () => state.snapshot),
    waitForTimeout: jest.fn(async () => undefined),
    url: () => 'https://example.test/',
  } as unknown as Page;
  return { page, state };
}

describe('waitForBotChallengeClearance captcha hook', () => {
  it('returns the challenge state when no hook is configured', async () => {
    const { page } = fakePage();
    const state = await waitForBotChallengeClearance(page, undefined, 50);
    expect(state).toBe('challenge');
  });

  it('calls the hook once the page is still challenged and returns the cleared state', async () => {
    const { page, state } = fakePage();
    const hook = jest.fn(async () => {
      state.snapshot = REAL_PAGE;
      return true;
    });
    const config: BlockHandlingConfig = { version: 1, captcha_solver: hook };

    const result = await waitForBotChallengeClearance(page, config, 50);

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith(page);
    expect(result).toBe('ok');
  });

  it('keeps the challenge state when the hook could not solve it', async () => {
    const { page } = fakePage();
    const hook = jest.fn(async () => false);
    const result = await waitForBotChallengeClearance(
      page,
      { version: 1, captcha_solver: hook },
      50,
    );
    expect(hook).toHaveBeenCalledTimes(1);
    expect(result).toBe('challenge');
  });

  it('survives a hook that throws and keeps the original state', async () => {
    const { page } = fakePage();
    const hook = jest.fn(async () => {
      throw new Error('2captcha down');
    });
    const result = await waitForBotChallengeClearance(
      page,
      { version: 1, captcha_solver: hook },
      50,
    );
    expect(result).toBe('challenge');
  });

  it('does not call the hook for a page that is fine', async () => {
    const { page, state } = fakePage();
    state.snapshot = REAL_PAGE;
    const hook = jest.fn(async () => true);
    const result = await waitForBotChallengeClearance(
      page,
      { version: 1, captcha_solver: hook },
      50,
    );
    expect(hook).not.toHaveBeenCalled();
    expect(result).toBe('ok');
  });
});
