import { expect, it } from 'vitest';
import { encryptSmtpSecret, decryptSmtpSecret } from '../../src/lib/smtp-secret.js';
it('encrypts credentials with random nonces and rejects corrupted values',()=>{
 const a=encryptSmtpSecret('example-secret'),b=encryptSmtpSecret('example-secret');
 expect(a.equals(b)).toBe(false);expect(a.toString()).not.toContain('example-secret');
 expect(decryptSmtpSecret(a)).toBe('example-secret');
 expect(()=>decryptSmtpSecret(Buffer.from('broken'))).toThrow();
});
