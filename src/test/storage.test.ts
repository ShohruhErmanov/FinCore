import { describe, expect, it, vi } from 'vitest';
import { readStorage, readStringArray, writeStorage } from '@/shared/lib/storage';

describe('safe browser storage', () => {
  it('reads, writes and validates string arrays', () => {
    expect(writeStorage('fincore.test', JSON.stringify(['one', 2, 'three']))).toBe(true);
    expect(readStorage('fincore.test')).toBe('["one",2,"three"]');
    expect(readStringArray('fincore.test')).toEqual(['one', 'three']);
  });

  it('returns safe fallbacks when browser storage rejects access', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });

    expect(readStorage('blocked')).toBeNull();
    expect(readStringArray('blocked')).toEqual([]);
    expect(writeStorage('blocked', 'value')).toBe(false);

    get.mockRestore();
    set.mockRestore();
  });
});
