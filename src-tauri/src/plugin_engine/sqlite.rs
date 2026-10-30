//! `ctx.host.sqlite` backend. Uses bundled SQLite (rusqlite) because Windows
//! has no `sqlite3` CLI. Query output keeps the `sqlite3 -json` shape plugins
//! parse: an array of row objects keyed by column name.

use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags};
use serde_json::{Map, Value};

/// Run a read-only query; returns the rows as a JSON array string.
pub fn query_json(path: &str, sql: &str) -> Result<String, String> {
    // Plain read-only open first so WAL contents are visible (common for app
    // state DBs). Fall back to immutable=1 when the WAL/SHM files are locked
    // or can't be opened.
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .and_then(|conn| rows_json(&conn, sql))
        .or_else(|primary_err| {
            let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI;
            Connection::open_with_flags(immutable_uri(path), flags)
                .and_then(|conn| rows_json(&conn, sql))
                .map_err(|e| format!("sqlite error: {} (fallback: {})", primary_err, e))
        })
}

/// Run write SQL. Never creates the database file.
pub fn exec(path: &str, sql: &str) -> Result<(), String> {
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .and_then(|conn| conn.execute_batch(sql))
        .map_err(|e| format!("sqlite error: {}", e))
}

fn rows_json(conn: &Connection, sql: &str) -> rusqlite::Result<String> {
    let mut stmt = conn.prepare(sql)?;
    let names: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
    let mut rows = stmt.query([])?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut obj = Map::new();
        for (i, name) in names.iter().enumerate() {
            obj.insert(name.clone(), to_json(row.get_ref(i)?));
        }
        out.push(Value::Object(obj));
    }
    Ok(Value::Array(out).to_string())
}

fn to_json(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => i.into(),
        ValueRef::Real(f) => serde_json::Number::from_f64(f).map_or(Value::Null, Value::Number),
        // Like `sqlite3 -json`, text and blobs both come out as strings.
        ValueRef::Text(bytes) | ValueRef::Blob(bytes) => {
            String::from_utf8_lossy(bytes).into_owned().into()
        }
    }
}

/// `file:` URI with immutable=1 (skips WAL/SHM locking). `%` is encoded first. A UNC path
/// (`\\wsl.localhost\<distro>\...`, where the locking open always fails) keeps its `//` after
/// the empty authority, or SQLite reads it as a folder on the current drive.
fn immutable_uri(path: &str) -> String {
    let encoded = path
        .replace('%', "%25")
        .replace(' ', "%20")
        .replace('#', "%23")
        .replace('?', "%3F")
        .replace('\\', "/");
    if encoded.starts_with("//") {
        return format!("file://{}?immutable=1", encoded);
    }
    format!("file:///{}?immutable=1", encoded.trim_start_matches('/'))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db(name: &str) -> String {
        let dir = std::env::temp_dir().join(format!("openusage sqlite {}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir.join(name).to_string_lossy().to_string()
    }

    fn seed(path: &str) {
        let conn = Connection::open(path).expect("create db");
        conn.execute_batch(
            "CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);
             INSERT INTO ItemTable VALUES ('auth', '{\"apiKey\":\"k\"}');
             INSERT INTO ItemTable VALUES ('blob', X'68656C6C6F');",
        )
        .expect("seed");
    }

    #[test]
    fn query_returns_sqlite3_json_shape() {
        let path = temp_db("state.vscdb");
        seed(&path);

        let json = query_json(
            &path,
            "SELECT value, 1 AS n, 1.5 AS r, NULL AS z FROM ItemTable WHERE key = 'auth' LIMIT 1;",
        )
        .expect("query");
        let rows: Value = serde_json::from_str(&json).expect("json");
        assert_eq!(
            rows,
            serde_json::json!([{ "value": "{\"apiKey\":\"k\"}", "n": 1, "r": 1.5, "z": null }])
        );

        let blob =
            query_json(&path, "SELECT value FROM ItemTable WHERE key = 'blob'").expect("blob");
        assert_eq!(blob, r#"[{"value":"hello"}]"#);

        let empty =
            query_json(&path, "SELECT value FROM ItemTable WHERE key = 'none'").expect("empty");
        assert_eq!(empty, "[]");
    }

    #[test]
    fn query_is_read_only_and_errors_loudly() {
        let path = temp_db("state.vscdb");
        seed(&path);

        assert!(query_json(&path, "DELETE FROM ItemTable").is_err());
        assert!(query_json(&path, "SELECT * FROM missing_table").is_err());
        assert!(query_json(&temp_db("missing.vscdb"), "SELECT 1").is_err());
    }

    #[test]
    fn exec_writes_and_never_creates_db() {
        let path = temp_db("state.vscdb");
        seed(&path);

        exec(
            &path,
            "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('auth', 'new');",
        )
        .expect("exec");
        let json =
            query_json(&path, "SELECT value FROM ItemTable WHERE key = 'auth'").expect("read");
        assert_eq!(json, r#"[{"value":"new"}]"#);

        let missing = temp_db("missing.vscdb");
        assert!(exec(&missing, "CREATE TABLE t (x)").is_err());
        assert!(!std::path::Path::new(&missing).exists());
    }

    // A WSL database (`\\wsl.localhost\...`) always answers "database is locked" to the plain
    // open; its fallback URI used to drop the UNC `//` and point at C:\wsl.localhost.
    #[test]
    fn immutable_uri_keeps_unc_paths() {
        assert_eq!(
            immutable_uri(r"\\wsl.localhost\Ubuntu\home\me\.local\share\opencode\open code.db"),
            "file:////wsl.localhost/Ubuntu/home/me/.local/share/opencode/open%20code.db?immutable=1"
        );
        assert_eq!(
            immutable_uri(r"C:\Users\me\state.vscdb"),
            "file:///C:/Users/me/state.vscdb?immutable=1"
        );
    }

    #[test]
    fn immutable_uri_opens_windows_paths_with_spaces() {
        let path = temp_db("Devin - Next#1.vscdb");
        seed(&path);

        let conn = Connection::open_with_flags(
            immutable_uri(&path),
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
        )
        .expect("open immutable");
        let json = rows_json(&conn, "SELECT count(*) AS c FROM ItemTable").expect("query");
        assert_eq!(json, r#"[{"c":2}]"#);
    }
}
