use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};

pub const SAFE_STORAGE_PREFIX: &str = "cursor-safe-storage:v1:";

pub fn decrypt_stored_value(raw: &str, key: &[u8]) -> Result<String, String> {
    let Some(encoded) = raw.strip_prefix(SAFE_STORAGE_PREFIX) else {
        return Ok(raw.to_string());
    };
    let blob = BASE64_STANDARD
        .decode(encoded.trim())
        .map_err(|_| "decryption failed".to_string())?;
    decrypt_v10_blob(key, &blob)
}

pub fn decrypt_v10_blob(key: &[u8], blob: &[u8]) -> Result<String, String> {
    if key.len() != 32 {
        return Err("Windows DPAPI returned an unexpected key".to_string());
    }
    if blob.len() < 3 || &blob[..3] != b"v10" {
        return Err("unrecognized encryption version".to_string());
    }
    if blob.len() < 3 + 12 + 16 {
        return Err("encrypted value is truncated".to_string());
    }
    let nonce = Nonce::from_slice(&blob[3..15]);
    let tag_at = blob.len() - 16;
    let mut sealed = Vec::with_capacity(tag_at - 15 + 16);
    sealed.extend_from_slice(&blob[15..tag_at]);
    sealed.extend_from_slice(&blob[tag_at..]);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "decryption failed".to_string())?;
    let plain = cipher
        .decrypt(nonce, sealed.as_ref())
        .map_err(|_| "decryption failed".to_string())?;
    let text = String::from_utf8(plain).map_err(|_| "decrypted value is not a token".to_string())?;
    if text.is_empty() || !text.bytes().all(|byte| (0x21..=0x7e).contains(&byte)) {
        return Err("decrypted value is not a token".to_string());
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use aes_gcm::{
        aead::{Aead, KeyInit, Payload},
        Aes256Gcm,
    };
    use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};

    fn seal(key: &[u8; 32], nonce: &[u8; 12], plain: &str) -> Vec<u8> {
        let cipher = Aes256Gcm::new_from_slice(key).expect("cipher");
        let sealed = cipher
            .encrypt(nonce.into(), Payload { msg: plain.as_bytes(), aad: b"" })
            .expect("seal");
        let mut blob = b"v10".to_vec();
        blob.extend_from_slice(nonce);
        blob.extend_from_slice(&sealed);
        blob
    }

    #[test]
    fn decrypts_v10_and_passes_plaintext_through() {
        let key = [7_u8; 32];
        let nonce = [9_u8; 12];
        let token = "eyJhbGciOiJub25lIn0.eyJleHAiOjk5OX0.sig";
        let blob = seal(&key, &nonce, token);
        let stored = format!(
            "{}{}",
            SAFE_STORAGE_PREFIX,
            BASE64_STANDARD.encode(&blob)
        );

        assert_eq!(decrypt_stored_value(&stored, &key).expect("decrypt"), token);
        assert_eq!(
            decrypt_stored_value(token, &key).expect("plaintext"),
            token
        );
    }

    #[test]
    fn rejects_bad_tag_truncated_blob_and_wrong_version() {
        let key = [7_u8; 32];
        let mut blob = seal(&key, &[9_u8; 12], "token.ok");
        let last = blob.len() - 1;
        blob[last] ^= 0xff;
        let flipped = format!("{}{}", SAFE_STORAGE_PREFIX, BASE64_STANDARD.encode(&blob));
        assert_eq!(
            decrypt_stored_value(&flipped, &key).expect_err("tag"),
            "decryption failed"
        );

        let short = format!("{}{}", SAFE_STORAGE_PREFIX, BASE64_STANDARD.encode(b"v10short"));
        assert_eq!(
            decrypt_stored_value(&short, &key).expect_err("truncated"),
            "encrypted value is truncated"
        );

        let other = format!("{}{}", SAFE_STORAGE_PREFIX, BASE64_STANDARD.encode(b"v11abcdefghijklmnop"));
        assert_eq!(
            decrypt_stored_value(&other, &key).expect_err("version"),
            "unrecognized encryption version"
        );
    }

    #[test]
    fn rejects_non_token_plaintext() {
        let key = [7_u8; 32];
        let blob = seal(&key, &[9_u8; 12], "tem espaço");
        let stored = format!("{}{}", SAFE_STORAGE_PREFIX, BASE64_STANDARD.encode(&blob));
        assert_eq!(
            decrypt_stored_value(&stored, &key).expect_err("charset"),
            "decrypted value is not a token"
        );
    }
}
