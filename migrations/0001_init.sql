CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  updated_at TEXT,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS article_chunks (
  id INTEGER PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  UNIQUE(article_id, ordinal)
);
CREATE VIRTUAL TABLE IF NOT EXISTS article_fts USING fts5(title,body,content='article_chunks',content_rowid='id',tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS article_chunks_ai AFTER INSERT ON article_chunks BEGIN
  INSERT INTO article_fts(rowid,title,body) VALUES(new.id,new.title,new.body);
END;
CREATE TRIGGER IF NOT EXISTS article_chunks_ad AFTER DELETE ON article_chunks BEGIN
  INSERT INTO article_fts(article_fts,rowid,title,body) VALUES('delete',old.id,old.title,old.body);
END;
CREATE TRIGGER IF NOT EXISTS article_chunks_au AFTER UPDATE ON article_chunks BEGIN
  INSERT INTO article_fts(article_fts,rowid,title,body) VALUES('delete',old.id,old.title,old.body);
  INSERT INTO article_fts(rowid,title,body) VALUES(new.id,new.title,new.body);
END;
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE
);
CREATE VIRTUAL TABLE IF NOT EXISTS video_fts USING fts5(title,content='videos',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS videos_ai AFTER INSERT ON videos BEGIN
  INSERT INTO video_fts(rowid,title) VALUES(new.rowid,new.title);
END;
CREATE TRIGGER IF NOT EXISTS videos_ad AFTER DELETE ON videos BEGIN
  INSERT INTO video_fts(video_fts,rowid,title) VALUES('delete',old.rowid,old.title);
END;
CREATE TRIGGER IF NOT EXISTS videos_au AFTER UPDATE ON videos BEGIN
  INSERT INTO video_fts(video_fts,rowid,title) VALUES('delete',old.rowid,old.title);
  INSERT INTO video_fts(rowid,title) VALUES(new.rowid,new.title);
END;
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS quotas (
  scope TEXT NOT NULL,
  bucket TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(scope,bucket)
);
