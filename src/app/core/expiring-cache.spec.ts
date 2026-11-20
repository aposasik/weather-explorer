import { ExpiringCache } from './expiring-cache';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('ExpiringCache', () => {
  it('returns a value while fresh and forgets it after the TTL', () => {
    let now = 1_000;
    const cache = new ExpiringCache<number>(100, undefined, 'x:', () => now);
    cache.set('a', 42);
    now += 99;
    expect(cache.get('a')).toBe(42);
    now += 2;
    expect(cache.get('a')).toBeUndefined();
  });

  it('survives a "reload" through storage', () => {
    const storage = fakeStorage();
    const now = () => 5_000;
    new ExpiringCache<string>(1_000, storage, 'x:', now).set('k', 'saved');
    const afterReload = new ExpiringCache<string>(1_000, storage, 'x:', now);
    expect(afterReload.get('k')).toBe('saved');
  });

  it('keeps working when storage throws (private mode)', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    };
    const cache = new ExpiringCache<number>(1_000, broken);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });
});
