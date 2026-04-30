CREATE TABLE IF NOT EXISTS sobot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  game_code TEXT,
  canvas_code TEXT,
  source_route TEXT,
  event_key TEXT NOT NULL,
  event_label_zh TEXT NOT NULL,
  payload_id TEXT,
  pid TEXT,
  nick TEXT,
  uname TEXT,
  email TEXT,
  tel TEXT,
  qq TEXT,
  remark TEXT,
  is_vip TEXT,
  vip_level TEXT,
  user_label TEXT,
  contact_id TEXT,
  trigger_id TEXT,
  ext_param TEXT,
  raw_payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sobot_events_received_at ON sobot_events(received_at);
CREATE INDEX IF NOT EXISTS idx_sobot_events_event_key ON sobot_events(event_key);
CREATE INDEX IF NOT EXISTS idx_sobot_events_tel ON sobot_events(tel);
CREATE INDEX IF NOT EXISTS idx_sobot_events_contact_id ON sobot_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_sobot_events_pid ON sobot_events(pid);
CREATE INDEX IF NOT EXISTS idx_sobot_events_game_code ON sobot_events(game_code);
CREATE INDEX IF NOT EXISTS idx_sobot_events_canvas_code ON sobot_events(canvas_code);
CREATE INDEX IF NOT EXISTS idx_sobot_events_game_canvas_received ON sobot_events(game_code, canvas_code, received_at);
