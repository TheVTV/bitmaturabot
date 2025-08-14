const bcrypt = require("bcrypt");
const crypto = require("crypto");

// Konfiguracja szyfrowania
const SALT_ROUNDS = 12;
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const ALGORITHM = "aes-256-cbc";

/**
 * Szyfruje dane używając AES-256-CBC (symetryczne)
 * Lepsze niż bcrypt dla danych, które trzeba odszyfrować
 */
function encryptData(text) {
  if (!text) return null;

  try {
    const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Zwracamy iv + encrypted data
    return iv.toString("hex") + ":" + encrypted;
  } catch (error) {
    console.error("[CRYPTO] Błąd szyfrowania:", error.message);
    return text; // Fallback - zwróć oryginalny tekst
  }
}

/**
 * Odszyfrowuje dane używając AES-256-CBC
 */
function decryptData(encryptedData) {
  if (!encryptedData || !encryptedData.includes(":")) {
    return encryptedData; // Prawdopodobnie nieszyfrowane dane
  }

  try {
    const parts = encryptedData.split(":");
    if (parts.length !== 2) {
      return encryptedData; // Nieprawidłowy format
    }

    const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("[CRYPTO] Błąd deszyfrowania:", error.message);
    return encryptedData; // Fallback - zwróć zaszyfrowane dane
  }
}

/**
 * Hashuje dane używając bcrypt (jednostronne)
 * Używane dla emaili jako klucze wyszukiwania
 */
async function hashData(text) {
  if (!text) return null;

  try {
    return await bcrypt.hash(text.toLowerCase().trim(), SALT_ROUNDS);
  } catch (error) {
    console.error("[CRYPTO] Błąd hashowania:", error.message);
    return text; // Fallback
  }
}

/**
 * Sprawdza czy tekst pasuje do hashu
 */
async function verifyHash(text, hash) {
  if (!text || !hash) return false;

  try {
    return await bcrypt.compare(text.toLowerCase().trim(), hash);
  } catch (error) {
    console.error("[CRYPTO] Błąd weryfikacji hashu:", error.message);
    return false;
  }
}

/**
 * Generuje hash dla wyszukiwania (deterministyczny)
 * Używamy prostego SHA-256 dla szybkiego wyszukiwania
 */
function generateSearchHash(text) {
  if (!text) return null;

  try {
    return crypto
      .createHash("sha256")
      .update(
        text.toLowerCase().trim() + process.env.SEARCH_SALT || "default_salt"
      )
      .digest("hex");
  } catch (error) {
    console.error("[CRYPTO] Błąd generowania search hash:", error.message);
    return text;
  }
}

module.exports = {
  encryptData,
  decryptData,
  hashData,
  verifyHash,
  generateSearchHash,
};
