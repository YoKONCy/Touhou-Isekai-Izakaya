
// Wrapper for Web Crypto API for AES-GCM encryption
export class CryptoService {
  private static instance: CryptoService;

  private constructor() {}

  public static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  // Derive a key from a password using PBKDF2
  public async deriveKey(password: string, salt: string = 'touhou-isekai-salt'): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode(salt),
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true, // Extractable (not strictly needed but useful for debugging if needed, though secure practice prefers false)
      ["encrypt", "decrypt"]
    );
  }

  // Encrypt data (JSON object)
  public async encrypt(data: any, key: CryptoKey): Promise<{ ciphertext: string, iv: string }> {
    const enc = new TextEncoder();
    const encodedData = enc.encode(JSON.stringify(data));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedContent = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      encodedData
    );

    return {
      ciphertext: this.arrayBufferToBase64(encryptedContent),
      iv: this.arrayBufferToBase64(iv.buffer)
    };
  }

  // Decrypt data
  public async decrypt(ciphertext: string, iv: string, key: CryptoKey): Promise<any> {
    const dec = new TextDecoder();
    const encryptedData = this.base64ToArrayBuffer(ciphertext);
    const ivData = this.base64ToArrayBuffer(iv);

    try {
      const decryptedContent = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: ivData
        },
        key,
        encryptedData
      );

      return JSON.parse(dec.decode(decryptedContent));
    } catch (e) {
      console.error('Decryption failed:', e);
      throw new Error('Decryption failed - Wrong password?');
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      const byte = bytes[i];
      if (byte !== undefined) {
        binary += String.fromCharCode(byte);
      }
    }
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export const cryptoService = CryptoService.getInstance();
