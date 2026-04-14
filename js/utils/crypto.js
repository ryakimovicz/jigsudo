/**
 * v1.0.0: Local Crypto Utility
 * Provides a lightweight obfuscation layer for LocalStorage data.
 * Protects against casual inspection of game state and rankings.
 */

const SECRET_KEY = "jigsudo_S1_secret_@2026";

/**
 * Encrypts a JS object or string into an obfuscated Base64 string.
 * @param {any} data - The data to encrypt.
 * @returns {string} 
 */
export function encryptData(data) {
  try {
    const jsonStr = JSON.stringify(data);
    let output = "";
    
    // Simple XOR + Substitution obfuscation
    for (let i = 0; i < jsonStr.length; i++) {
        const charCode = jsonStr.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
        output += String.fromCharCode(charCode);
    }
    
    // Convert to Base64 (using btoa with support for UTF-8 via encodeURIComponent)
    return btoa(encodeURIComponent(output));
  } catch (e) {
    console.error("[Crypto] Encryption failed:", e);
    return null;
  }
}

/**
 * Decrypts an obfuscated string back into its original form.
 * @param {string} encryptedStr - The string to decrypt.
 * @returns {any}
 */
export function decryptData(encryptedStr) {
  if (!encryptedStr) return null;
  try {
    // Decode from Base64
    const encrypted = decodeURIComponent(atob(encryptedStr));
    let output = "";
    
    for (let i = 0; i < encrypted.length; i++) {
        const charCode = encrypted.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
        output += String.fromCharCode(charCode);
    }
    
    return JSON.parse(output);
  } catch (e) {
    // If it's not encrypted (legacy data), return null so the caller can handle fallback
    console.warn("[Crypto] Decryption failed or legacy data detected.");
    return null;
  }
}
