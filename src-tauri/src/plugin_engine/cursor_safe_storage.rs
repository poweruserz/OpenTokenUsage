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

pub fn read_wrapped_key(local_state_json: &str) -> Result<Vec<u8>, String> {
    let json: serde_json::Value = serde_json::from_str(local_state_json)
        .map_err(|_| "could not read Cursor's Local State".to_string())?;
    let encoded = json
        .pointer("/os_crypt/encrypted_key")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let wrapped = BASE64_STANDARD
        .decode(encoded)
        .map_err(|_| "Cursor's Local State has no DPAPI key".to_string())?;
    if wrapped.len() < 5 || &wrapped[..5] != b"DPAPI" {
        return Err("Cursor's Local State has no DPAPI key".to_string());
    }
    Ok(wrapped[5..].to_vec())
}

#[cfg(windows)]
pub fn unwrap_dpapi(payload: &[u8]) -> Result<Vec<u8>, String> {
    use std::ptr;
    use windows_sys::Win32::Foundation::{LocalFree, HLOCAL};
    use windows_sys::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};

    const UI_FORBIDDEN: u32 = 0x1;
    let input = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(payload.len()).map_err(|_| "Windows DPAPI could not unwrap the key".to_string())?,
        pbData: payload.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &input,
            ptr::null_mut(),
            ptr::null(),
            ptr::null_mut(),
            ptr::null(),
            UI_FORBIDDEN,
            &mut output,
        )
    };
    if ok == 0 || output.pbData.is_null() {
        return Err("Windows DPAPI could not unwrap the key".to_string());
    }
    let key = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as HLOCAL);
    }
    if key.len() != 32 {
        return Err("Windows DPAPI returned an unexpected key".to_string());
    }
    Ok(key)
}

pub fn decrypt_cursor_value(raw: &str) -> Result<String, String> {
    if !raw.starts_with(SAFE_STORAGE_PREFIX) {
        return Ok(raw.to_string());
    }
    #[cfg(windows)]
    {
        let path = dirs::data_dir()
            .ok_or_else(|| "could not read Cursor's Local State".to_string())?
            .join("Cursor")
            .join("Local State");
        let json = std::fs::read_to_string(&path)
            .map_err(|_| "could not read Cursor's Local State".to_string())?;
        let wrapped = read_wrapped_key(&json)?;
        let key = unwrap_dpapi(&wrapped)?;
        decrypt_stored_value(raw, &key)
    }
    #[cfg(not(windows))]
    {
        Err("not supported on this platform".to_string())
    }
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

    #[cfg(all(test, windows))]
    fn protect_dpapi(plain: &[u8]) -> Vec<u8> {
        use std::ptr;
        use windows_sys::Win32::Foundation::{LocalFree, HLOCAL};
        use windows_sys::Win32::Security::Cryptography::{CryptProtectData, CRYPT_INTEGER_BLOB};

        let input = CRYPT_INTEGER_BLOB {
            cbData: plain.len() as u32,
            pbData: plain.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };
        let ok = unsafe {
            CryptProtectData(
                &input,
                ptr::null(),
                ptr::null(),
                ptr::null_mut(),
                ptr::null(),
                0x1,
                &mut output,
            )
        };
        assert_eq!(ok, 1, "CryptProtectData");
        let protected = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
        unsafe { LocalFree(output.pbData as HLOCAL); }
        protected
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

    #[test]
    fn read_wrapped_key_strips_dpapi_prefix() {
        let body = b"DPAPI0123456789abcdef0123456789ab";
        let json = format!(
            r#"{{"os_crypt":{{"encrypted_key":"{}"}}}}"#,
            BASE64_STANDARD.encode(body)
        );
        let wrapped = read_wrapped_key(&json).expect("wrapped");
        assert_eq!(wrapped, b"0123456789abcdef0123456789ab");
    }

    #[test]
    fn read_wrapped_key_rejects_other_prefixes() {
        let json = format!(
            r#"{{"os_crypt":{{"encrypted_key":"{}"}}}}"#,
            BASE64_STANDARD.encode(b"APPBnot-dpapi")
        );
        assert_eq!(
            read_wrapped_key(&json).expect_err("appb"),
            "Cursor's Local State has no DPAPI key"
        );
        assert_eq!(
            read_wrapped_key("{}").expect_err("missing"),
            "Cursor's Local State has no DPAPI key"
        );
    }

    #[cfg(windows)]
    #[test]
    fn dpapi_round_trip_returns_32_bytes() {
        let key = [3_u8; 32];
        let protected = protect_dpapi(&key);
        let opened = unwrap_dpapi(&protected).expect("unwrap");
        assert_eq!(opened, key);
    }
}
