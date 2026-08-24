//! On-disk media index. Paths and metadata only — never the file bytes.
//! Thumbnails and decode happen in WebView2 for the current (and next) item.
//! Playlists and studio settings are stored as JSON in the `kv` table.

use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use walkdir::WalkDir;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  recursive INTEGER NOT NULL DEFAULT 1,
  last_scan INTEGER
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  folder_id INTEGER NOT NULL,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS media_folder ON media(folder_id);
CREATE INDEX IF NOT EXISTS media_kind ON media(kind);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

const EXT: &[(&str, &str, &str)] = &[
    ("jpg", "image/jpeg", "photo"),
    ("jpeg", "image/jpeg", "photo"),
    ("png", "image/png", "photo"),
    ("webp", "image/webp", "photo"),
    ("gif", "image/gif", "gif"),
    ("mp4", "video/mp4", "live"),
    ("webm", "video/webm", "live"),
    ("mov", "video/quicktime", "live"),
];

#[derive(Debug, Clone, Serialize)]
pub struct FolderRow {
    pub id: i64,
    pub path: String,
    pub recursive: bool,
    pub last_scan: Option<i64>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MediaRow {
    pub id: String,
    pub folder_id: i64,
    pub path: String,
    pub title: String,
    pub kind: String,
    pub mime: String,
    pub size: i64,
    pub mtime: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanReport {
    pub folder_id: i64,
    pub added: u32,
    pub removed: u32,
    pub total: i64,
}

pub struct Library {
    conn: Mutex<Connection>,
}

impl Library {
    pub fn open(dir: &Path) -> Result<Arc<Self>, String> {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let path = dir.join("library.sqlite");
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;")
            .map_err(|e| e.to_string())?;
        conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        Ok(Arc::new(Self {
            conn: Mutex::new(conn),
        }))
    }

    pub fn kv_get(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT value FROM kv WHERE key = ?1")
            .map_err(|e| e.to_string())?;
        match stmt.query_row(params![key], |r| r.get::<_, String>(0)) {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn kv_set(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO kv(key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn folders(&self) -> Result<Vec<FolderRow>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT f.id, f.path, f.recursive, f.last_scan,
                        (SELECT COUNT(*) FROM media m WHERE m.folder_id = f.id)
                 FROM folders f ORDER BY f.path",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(FolderRow {
                    id: r.get(0)?,
                    path: r.get(1)?,
                    recursive: r.get::<_, i64>(2)? != 0,
                    last_scan: r.get(3)?,
                    count: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn add_folder(&self, path: &str) -> Result<FolderRow, String> {
        let p = PathBuf::from(path);
        if !p.is_dir() {
            return Err("Not a folder".into());
        }
        let canon = p.canonicalize().unwrap_or(p);
        let s = normalize_fs_path(&canon);
        {
            let conn = self.conn.lock();
            conn.execute(
                "INSERT OR IGNORE INTO folders(path, recursive) VALUES (?1, 1)",
                params![s],
            )
            .map_err(|e| e.to_string())?;
        }
        self.scan_path(&s)?;
        self.folders()?
            .into_iter()
            .find(|f| f.path == s)
            .ok_or_else(|| "folder not found after add".into())
    }

    pub fn remove_folder(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM media WHERE folder_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM folders WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list(
        &self,
        query: Option<String>,
        kind: Option<String>,
        offset: i64,
        limit: i64,
    ) -> Result<(Vec<MediaRow>, i64), String> {
        let conn = self.conn.lock();
        let mut where_sql = String::from("WHERE 1=1");
        let mut binds: Vec<String> = Vec::new();
        if let Some(k) = kind {
            if k != "all" && !k.is_empty() {
                where_sql.push_str(" AND kind = ?");
                binds.push(k);
            }
        }
        if let Some(q) = query {
            let t = q.trim();
            if !t.is_empty() {
                where_sql.push_str(" AND (title LIKE ? OR path LIKE ?)");
                let like = format!("%{t}%");
                binds.push(like.clone());
                binds.push(like);
            }
        }
        let count_sql = format!("SELECT COUNT(*) FROM media {where_sql}");
        let mut count_stmt = conn.prepare(&count_sql).map_err(|e| e.to_string())?;
        let refs: Vec<&dyn rusqlite::types::ToSql> =
            binds.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
        let total: i64 = count_stmt
            .query_row(refs.as_slice(), |r| r.get(0))
            .map_err(|e| e.to_string())?;

        let list_sql = format!(
            "SELECT id, folder_id, path, title, kind, mime, size, mtime FROM media {where_sql} ORDER BY title COLLATE NOCASE LIMIT ? OFFSET ?"
        );
        let mut list_stmt = conn.prepare(&list_sql).map_err(|e| e.to_string())?;
        let mut all_binds: Vec<&dyn rusqlite::types::ToSql> = binds
            .iter()
            .map(|s| s as &dyn rusqlite::types::ToSql)
            .collect();
        let lim = limit.clamp(1, 500);
        let off = offset.max(0);
        all_binds.push(&lim);
        all_binds.push(&off);
        let rows = list_stmt
            .query_map(all_binds.as_slice(), |r| {
                Ok(MediaRow {
                    id: r.get(0)?,
                    folder_id: r.get(1)?,
                    path: r.get(2)?,
                    title: r.get(3)?,
                    kind: r.get(4)?,
                    mime: r.get(5)?,
                    size: r.get(6)?,
                    mtime: r.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let items = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        Ok((items, total))
    }

    pub fn get(&self, id: &str) -> Result<Option<MediaRow>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT id, folder_id, path, title, kind, mime, size, mtime FROM media WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let row = stmt.query_row(params![id], |r| {
            Ok(MediaRow {
                id: r.get(0)?,
                folder_id: r.get(1)?,
                path: r.get(2)?,
                title: r.get(3)?,
                kind: r.get(4)?,
                mime: r.get(5)?,
                size: r.get(6)?,
                mtime: r.get(7)?,
            })
        });
        match row {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn scan_all(&self) -> Result<Vec<ScanReport>, String> {
        let folders = self.folders()?;
        let mut out = Vec::new();
        for f in folders {
            out.push(self.scan_id(f.id)?);
        }
        Ok(out)
    }

    pub fn scan_id(&self, id: i64) -> Result<ScanReport, String> {
        let path = {
            let conn = self.conn.lock();
            conn.query_row("SELECT path FROM folders WHERE id = ?1", params![id], |r| {
                r.get::<_, String>(0)
            })
            .map_err(|e| e.to_string())?
        };
        self.scan_folder_id(id, &path)
    }

    fn scan_path(&self, path: &str) -> Result<ScanReport, String> {
        let id: i64 = {
            let conn = self.conn.lock();
            conn.query_row("SELECT id FROM folders WHERE path = ?1", params![path], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?
        };
        self.scan_folder_id(id, path)
    }

    fn scan_folder_id(&self, folder_id: i64, root: &str) -> Result<ScanReport, String> {
        let mut seen = Vec::new();
        let mut added = 0u32;
        for entry in WalkDir::new(root)
            .follow_links(false)
            .max_depth(12)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let Some((mime, kind)) = classify(path) else {
                continue;
            };
            let s = normalize_fs_path(path);
            seen.push(s.clone());
            let meta = entry.metadata().ok();
            let size = meta.as_ref().map(|m| m.len() as i64).unwrap_or(0);
            let mtime = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            let title = path
                .file_stem()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| s.clone());
            let id = format!("fs-{:x}", fnv(&s));
            let conn = self.conn.lock();
            let changed = conn
                .execute(
                    "INSERT INTO media(id, folder_id, path, title, kind, mime, size, mtime)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                     ON CONFLICT(path) DO UPDATE SET
                       title=excluded.title, kind=excluded.kind, mime=excluded.mime,
                       size=excluded.size, mtime=excluded.mtime, folder_id=excluded.folder_id",
                    params![id, folder_id, s, title, kind, mime, size, mtime],
                )
                .map_err(|e| e.to_string())?;
            if changed > 0 {
                added += 1;
            }
        }

        let mut removed = 0u32;
        {
            let conn = self.conn.lock();
            let existing: Vec<(String, String)> = {
                let mut stmt = conn
                    .prepare("SELECT id, path FROM media WHERE folder_id = ?1")
                    .map_err(|e| e.to_string())?;
                let rows: Vec<(String, String)> = stmt
                    .query_map(params![folder_id], |r| Ok((r.get(0)?, r.get(1)?)))
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;
                drop(stmt);
                rows
            };
            for (id, path) in existing {
                if !seen.iter().any(|p| p == &path) {
                    conn.execute("DELETE FROM media WHERE id = ?1", params![id])
                        .map_err(|e| e.to_string())?;
                    removed += 1;
                }
            }
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            conn.execute(
                "UPDATE folders SET last_scan = ?1 WHERE id = ?2",
                params![now, folder_id],
            )
            .map_err(|e| e.to_string())?;
        }

        let total = {
            let conn = self.conn.lock();
            conn.query_row(
                "SELECT COUNT(*) FROM media WHERE folder_id = ?1",
                params![folder_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?
        };
        Ok(ScanReport {
            folder_id,
            added,
            removed,
            total,
        })
    }
}

fn normalize_fs_path(p: &Path) -> String {
    let s = p.to_string_lossy();
    #[cfg(windows)]
    {
        let trimmed = s.strip_prefix(r"\\?\").unwrap_or(s.as_ref());
        return trimmed.replace('/', "\\");
    }
    #[cfg(not(windows))]
    s.into_owned()
}

fn classify(path: &Path) -> Option<(&'static str, &'static str)> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    EXT.iter()
        .find(|(e, _, _)| *e == ext)
        .map(|(_, mime, kind)| (*mime, *kind))
}

fn fnv(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}
