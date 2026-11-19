import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash';

describe('Web Crypto Hash Utility', () => {
  it('computes accurate SHA-256 hex digest for known test vector', async () => {
    // Known SHA-256 of empty string is e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const emptyHash = await sha256Hex('');
    expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

    // Known SHA-256 of "hello world" is b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
    const helloHash = await sha256Hex('hello world');
    expect(helloHash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });
});

