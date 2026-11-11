import { configureSessionCheck, reportUnauthorized, type SessionVerdict } from '@/services/sessionExpiry';

const mockState = { active: 'acct-1' };
jest.mock('@/stores/accounts', () => ({
  activeAccountId: () => mockState.active,
  tokenFor: () => 'tok',
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('session expiry', () => {
  let now = 1_000_000;
  const verify = jest.fn<Promise<SessionVerdict>, [string]>();
  const onExpired = jest.fn();
  const onLost = jest.fn();

  beforeAll(() => configureSessionCheck({ verify, onExpired, onLost }));
  beforeEach(() => {
    verify.mockReset();
    onExpired.mockReset();
    onLost.mockReset();
    // Each case starts outside the quiet period of the one before.
    now += 60_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('asks for sign-in again when the token is really expired', async () => {
    verify.mockResolvedValue('expired');
    reportUnauthorized('acct-1');
    await flush();
    expect(verify).toHaveBeenCalledWith('tok');
    expect(onExpired).toHaveBeenCalled();
    expect(onLost).not.toHaveBeenCalled();
  });

  it('shows the account-lost screen when access to the workspace was removed', async () => {
    verify.mockResolvedValue('lost');
    reportUnauthorized(null);
    await flush();
    expect(onLost).toHaveBeenCalled();
  });

  it('does nothing when the session is fine or the check could not tell', async () => {
    verify.mockResolvedValue('valid');
    reportUnauthorized('acct-1');
    await flush();
    now += 60_000;
    (Date.now as jest.Mock).mockReturnValue(now);
    verify.mockRejectedValue(new TypeError('Network request failed'));
    reportUnauthorized('acct-1');
    await flush();
    expect(onExpired).not.toHaveBeenCalled();
    expect(onLost).not.toHaveBeenCalled();
  });

  it('leaves accounts that are not on screen alone, and checks once for a burst of 401s', async () => {
    verify.mockResolvedValue('expired');
    reportUnauthorized('acct-2');
    expect(verify).not.toHaveBeenCalled();
    reportUnauthorized('acct-1');
    reportUnauthorized('acct-1');
    reportUnauthorized(null);
    await flush();
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
