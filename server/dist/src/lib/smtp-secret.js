import { createDecipheriv } from 'node:crypto';
import { encrypt, decrypt } from './encrypt.js';
export function encryptSmtpSecret(value) {
    return Buffer.from('ENCv1:' + encrypt(value), 'utf8');
}
export function decryptSmtpSecret(value) {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const text = buffer.toString('utf8');
    if (text.startsWith('ENCv1:'))
        return decrypt(text.slice(6));
    if (text.startsWith('PLAIN:') && process.env.NODE_ENV !== 'production')
        return text.slice(6);
    const key = process.env.SMTP_ENCRYPTION_KEY ?? '';
    if (!/^[0-9a-f]{64}$/i.test(key) || buffer.length < 29)
        throw new Error('SMTP credential must be re-saved with encryption enabled');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), buffer.subarray(0, 12));
    decipher.setAuthTag(buffer.subarray(12, 28));
    return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8');
}
//# sourceMappingURL=smtp-secret.js.map