export interface Env {
  WEBHOOK_SECRET?: string;
  API_QUERY_TOKEN?: string;
  SOBOT_DB: D1Database;
  REPORT_TZ_OFFSET_HOURS?: string;
}

type EventKey =
  | "entered"
  | "send-failed"
  | "sent"
  | "delivered"
  | "read"
  | "replied"
  | "button-clicked";

type EventMeta = {
  key: EventKey;
  labelZh: string;
};

type SobotPayload = {
  id?: string;
  pid?: string;
  nick?: string;
  uname?: string;
  email?: string;
  tel?: string;
  qq?: string;
  remark?: string;
  is_vip?: string;
  vip_level?: string;
  user_label?: string;
  face?: string;
  ex_fields?: Record<string, unknown>;
  webhook_info?: {
    Contact_id?: string;
    "trigger-id"?: string;
    extParam?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type CountRow = {
  event_key: EventKey;
  total: number;
};

type SummaryRow = {
  total_events: number;
  unique_users: number;
  vip_events: number;
};

type FailedRow = {
  received_at: string;
  nick: string | null;
  tel: string | null;
  payload_id: string | null;
  pid: string | null;
  trigger_id: string | null;
};

type ColumnInfoRow = {
  name: string;
};

type EventRow = {
  received_at: string;
  game_code: string;
  canvas_code: string | null;
  event_key: EventKey;
  event_label_zh: string;
  payload_id: string | null;
  pid: string | null;
  nick: string | null;
  uname: string | null;
  tel: string | null;
  contact_id: string | null;
  trigger_id: string | null;
  user_label: string | null;
  remark: string | null;
  is_vip: string | null;
  vip_level: string | null;
};

type UserProfileRow = {
  nick: string | null;
  uname: string | null;
  tel: string | null;
  contact_id: string | null;
  user_label: string | null;
  is_vip: string | null;
  vip_level: string | null;
};

type ReportWindow = {
  labelDate: string;
  startIso: string;
  endIso: string;
};

type QueryFilters = {
  gameCode: string;
  canvasCode?: string;
};

type WebhookRouteMatch = {
  gameCode: string;
  canvasCode: string;
  eventMeta: EventMeta;
  sourceRoute: string;
};

type DailyReportData = {
  date: string;
  summary: {
    totalEvents: number;
    uniqueUsers: number;
    vipEvents: number;
    readRate: string;
    replyRate: string;
  };
  counts: {
    entered: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    sendFailed: number;
    buttonClicked: number;
  };
  topLabels: Array<{ label: string; count: number }>;
  failedExamples: Array<{
    receivedAt: string;
    nick: string | null;
    tel: string | null;
    payloadId: string | null;
    pid: string | null;
    triggerId: string | null;
  }>;
};

const SOBOT_SUCCESS = { code: 0, status: 0 };
const DEFAULT_REPORT_TZ_OFFSET_HOURS = 8;
const DEFAULT_EVENT_LIMIT = 50;
const DEFAULT_LEGACY_GAME_CODE = "ptslg";
const DEFAULT_LEGACY_CANVAS_CODE = "default";

const EVENT_META_MAP: Record<EventKey, EventMeta> = {
  entered: { key: "entered", labelZh: "\u547d\u4e2d\u89c4\u5219" },
  "send-failed": { key: "send-failed", labelZh: "\u53d1\u9001\u5931\u8d25" },
  sent: { key: "sent", labelZh: "\u5df2\u53d1\u9001" },
  delivered: { key: "delivered", labelZh: "\u5df2\u9001\u8fbe" },
  read: { key: "read", labelZh: "\u5df2\u9605\u8bfb" },
  replied: { key: "replied", labelZh: "\u5df2\u56de\u590d" },
  "button-clicked": { key: "button-clicked", labelZh: "\u70b9\u51fb\u6309\u94ae" },
};

const CREATE_EVENTS_TABLE_SQL =
  "CREATE TABLE IF NOT EXISTS sobot_events (id INTEGER PRIMARY KEY AUTOINCREMENT, received_at TEXT NOT NULL, game_code TEXT, canvas_code TEXT, source_route TEXT, event_key TEXT NOT NULL, event_label_zh TEXT NOT NULL, payload_id TEXT, pid TEXT, nick TEXT, uname TEXT, email TEXT, tel TEXT, qq TEXT, remark TEXT, is_vip TEXT, vip_level TEXT, user_label TEXT, contact_id TEXT, trigger_id TEXT, ext_param TEXT, raw_payload TEXT NOT NULL);";

const INDEX_STATEMENTS = [
  "CREATE INDEX IF NOT EXISTS idx_sobot_events_received_at ON sobot_events(received_at);",
  "CREATE INDEX IF NOT EXISTS idx_sobot_events_event_key ON sobot_events(event_key);",
  "CREATE INDEX IF NOT EXISTS idx_sobot_events_tel ON sobot_events(tel);",
  "CREATE INDEX IF NOT EXISTS idx_sobot_events_contact_id ON sobot_events(contact_id);",
  "CREATE INDEX IF NOT EXISTS idx_sobot_events_pid ON sobot_events(pid);",
  "CREATE INDEX IF NOT EXISTS idx_sobot_events_game_code ON sobot_events(game_code);",
  "CREATE INDEX IF NOT EXISTS idx_sobot_events_canvas_code ON sobot_events(canvas_code);",
  "CREATE INDEX IF NOT EXISTS idx_sobot_events_game_canvas_received ON sobot_events(game_code, canvas_code, received_at);",
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      await ensureSchema(env.SOBOT_DB);

      const url = new URL(request.url);
      const pathname = normalizePath(url.pathname);

      if (pathname.startsWith("/api/")) {
        return await handleApiRequest(request, env, url, pathname);
      }

      return await handleWebhookRequest(request, env, pathname);
    } catch (err) {
      console.error("Unhandled error:", err);
      return json({ ok: false, error: "Internal Server Error" }, 500);
    }
  },
};

async function handleWebhookRequest(request: Request, env: Env, pathname: string): Promise<Response> {
  const routeMatch = parseWebhookRoute(pathname);

  if (!routeMatch) {
    return json({ ok: false, error: "Not Found" }, 404);
  }

  if (request.method !== "POST" && request.method !== "PUT") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }

  if (!env.WEBHOOK_SECRET?.trim()) {
    console.error("Missing WEBHOOK_SECRET");
    return json({ ok: false, error: "Server Misconfigured" }, 500);
  }

  const authResult = validateWebhookSecret(request, env.WEBHOOK_SECRET);
  if (!authResult.ok) {
    return json({ ok: false, error: authResult.error }, 401);
  }

  const payload = await safeParseJson<SobotPayload>(request);
  if (!payload.ok) {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  await storeSobotEvent(env.SOBOT_DB, routeMatch, payload.data);

  const id = valueOrDash(payload.data.id);
  const triggerId = valueOrDash(payload.data.webhook_info?.["trigger-id"]);
  console.log(
    `Sobot event stored: route=${pathname}, game=${routeMatch.gameCode}, canvas=${routeMatch.canvasCode}, event=${routeMatch.eventMeta.key}, id=${id}, trigger-id=${triggerId}`
  );

  return json(SOBOT_SUCCESS, 200);
}

async function handleApiRequest(request: Request, env: Env, url: URL, pathname: string): Promise<Response> {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }

  if (!env.API_QUERY_TOKEN?.trim()) {
    console.error("Missing API_QUERY_TOKEN");
    return json({ ok: false, error: "Server Misconfigured" }, 500);
  }

  const authResult = validateApiToken(request, env.API_QUERY_TOKEN);
  if (!authResult.ok) {
    return json({ ok: false, error: authResult.error }, 401);
  }

  const tzOffsetHours = parseOffsetHours(env.REPORT_TZ_OFFSET_HOURS);

  if (pathname === "/api/health") {
    return json({ ok: true, data: { service: "sobot-report-api", tzOffsetHours } });
  }

  if (pathname === "/api/report/daily") {
    const date = requiredDate(url.searchParams.get("date"));
    if (!date.ok) return json({ ok: false, error: date.error }, 400);
    const filters = requiredQueryFilters(url.searchParams);
    if (!filters.ok) return json({ ok: false, error: filters.error }, 400);

    const data = await getDailyReportData(env.SOBOT_DB, date.value, tzOffsetHours, filters.value);
    return json({ ok: true, data });
  }

  if (pathname === "/api/stats/overview") {
    const from = requiredDate(url.searchParams.get("from"));
    const to = requiredDate(url.searchParams.get("to"));
    if (!from.ok) return json({ ok: false, error: from.error }, 400);
    if (!to.ok) return json({ ok: false, error: to.error }, 400);
    if (from.value > to.value) return json({ ok: false, error: "Invalid date range: from must be <= to" }, 400);
    const filters = requiredQueryFilters(url.searchParams);
    if (!filters.ok) return json({ ok: false, error: filters.error }, 400);

    const data = await getOverviewData(env.SOBOT_DB, from.value, to.value, tzOffsetHours, filters.value);
    return json({ ok: true, data });
  }

  if (pathname === "/api/users/search") {
    const tel = requiredParam(url.searchParams.get("tel"), "Missing tel");
    if (!tel.ok) return json({ ok: false, error: tel.error }, 400);
    const filters = requiredQueryFilters(url.searchParams);
    if (!filters.ok) return json({ ok: false, error: filters.error }, 400);

    const data = await getUserEventsByTel(env.SOBOT_DB, tel.value, DEFAULT_EVENT_LIMIT, filters.value);
    return json({ ok: true, data });
  }

  if (pathname.startsWith("/api/conversations/") && pathname.endsWith("/events")) {
    const pid = decodeURIComponent(pathname.slice("/api/conversations/".length, -"/events".length));
    if (!pid.trim()) return json({ ok: false, error: "Missing pid" }, 400);
    const filters = requiredQueryFilters(url.searchParams);
    if (!filters.ok) return json({ ok: false, error: filters.error }, 400);

    const data = await getConversationEvents(env.SOBOT_DB, pid.trim(), DEFAULT_EVENT_LIMIT, filters.value);
    return json({ ok: true, data });
  }

  if (pathname === "/api/events/failed") {
    const date = requiredDate(url.searchParams.get("date"));
    if (!date.ok) return json({ ok: false, error: date.error }, 400);
    const filters = requiredQueryFilters(url.searchParams);
    if (!filters.ok) return json({ ok: false, error: filters.error }, 400);

    const data = await getFailedEventsByDate(env.SOBOT_DB, date.value, tzOffsetHours, DEFAULT_EVENT_LIMIT, filters.value);
    return json({ ok: true, data });
  }

  return json({ ok: false, error: "Not Found" }, 404);
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function validateWebhookSecret(
  request: Request,
  configuredSecret: string
): { ok: true } | { ok: false; error: string } {
  const incoming = request.headers.get("x-webhook-secret")?.trim();
  if (!incoming) return { ok: false, error: "Missing x-webhook-secret" };
  if (incoming !== configuredSecret.trim()) return { ok: false, error: "Invalid webhook secret" };
  return { ok: true };
}

function validateApiToken(
  request: Request,
  configuredToken: string
): { ok: true } | { ok: false; error: string } {
  const rawAuth = request.headers.get("authorization")?.trim();
  if (!rawAuth) return { ok: false, error: "Missing Authorization header" };

  const match = rawAuth.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, error: "Invalid Authorization header" };
  if (match[1].trim() !== configuredToken.trim()) return { ok: false, error: "Invalid API token" };
  return { ok: true };
}

async function safeParseJson<T>(request: Request): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    const raw = await request.text();
    const normalized = raw.replace(/^\uFEFF/, "");
    if (!normalized.trim()) return { ok: false };
    const data = JSON.parse(normalized) as T;
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

async function ensureSchema(db: D1Database): Promise<void> {
  await db.exec(CREATE_EVENTS_TABLE_SQL);

  const columns = await getExistingColumns(db, "sobot_events");
  await ensureColumn(db, columns, "sobot_events", "game_code", "TEXT");
  await ensureColumn(db, columns, "sobot_events", "canvas_code", "TEXT");
  await ensureColumn(db, columns, "sobot_events", "source_route", "TEXT");
  await backfillLegacyScope(db);

  for (const statement of INDEX_STATEMENTS) {
    await db.exec(statement);
  }
}

async function storeSobotEvent(db: D1Database, routeMatch: WebhookRouteMatch, payload: SobotPayload): Promise<void> {
  const nowIso = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO sobot_events (
      received_at, game_code, canvas_code, source_route, event_key, event_label_zh, payload_id, pid, nick, uname, email, tel, qq,
      remark, is_vip, vip_level, user_label, contact_id, trigger_id, ext_param, raw_payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  await stmt
    .bind(
      nowIso,
      routeMatch.gameCode,
      routeMatch.canvasCode,
      routeMatch.sourceRoute,
      routeMatch.eventMeta.key,
      routeMatch.eventMeta.labelZh,
      nullableText(payload.id),
      nullableText(payload.pid),
      nullableText(payload.nick),
      nullableText(payload.uname),
      nullableText(payload.email),
      nullableText(payload.tel),
      nullableText(payload.qq),
      nullableText(payload.remark),
      nullableText(payload.is_vip),
      nullableText(payload.vip_level),
      nullableText(payload.user_label),
      nullableText(payload.webhook_info?.Contact_id),
      nullableText(payload.webhook_info?.["trigger-id"]),
      nullableText(payload.webhook_info?.extParam),
      JSON.stringify(payload)
    )
    .run();
}

async function getDailyReportData(db: D1Database, date: string, offsetHours: number, filters: QueryFilters): Promise<DailyReportData> {
  const window = getDateWindow(date, offsetHours);
  return buildReportData(db, window, filters);
}

async function getOverviewData(
  db: D1Database,
  from: string,
  to: string,
  offsetHours: number,
  filters: QueryFilters
): Promise<{ from: string; to: string; report: DailyReportData }> {
  const window = getDateRangeWindow(from, to, offsetHours);
  const report = await buildReportData(db, window, filters);
  return { from, to, report };
}

async function buildReportData(db: D1Database, window: ReportWindow, filters: QueryFilters): Promise<DailyReportData> {
  const summary = await getSummary(db, window, filters);
  const counts = await getEventCounts(db, window, filters);
  const topLabels = await getTopLabels(db, window, 5, filters);
  const failedExamples = await getFailedExamples(db, window, 5, filters);

  const countMap = new Map(counts.map((row) => [row.event_key, row.total]));
  const delivered = countMap.get("delivered") ?? 0;
  const read = countMap.get("read") ?? 0;
  const replied = countMap.get("replied") ?? 0;

  return {
    date: window.labelDate,
    summary: {
      totalEvents: summary.totalEvents,
      uniqueUsers: summary.uniqueUsers,
      vipEvents: summary.vipEvents,
      readRate: delivered > 0 ? formatPercent(read / delivered) : "-",
      replyRate: read > 0 ? formatPercent(replied / read) : "-",
    },
    counts: {
      entered: countMap.get("entered") ?? 0,
      sent: countMap.get("sent") ?? 0,
      delivered,
      read,
      replied,
      sendFailed: countMap.get("send-failed") ?? 0,
      buttonClicked: countMap.get("button-clicked") ?? 0,
    },
    topLabels,
    failedExamples: failedExamples.map((item) => ({
      receivedAt: item.received_at,
      nick: item.nick,
      tel: item.tel,
      payloadId: item.payload_id,
      pid: item.pid,
      triggerId: item.trigger_id,
    })),
  };
}

async function getSummary(db: D1Database, window: ReportWindow, filters: QueryFilters): Promise<{ totalEvents: number; uniqueUsers: number; vipEvents: number }> {
  const scope = scopedWhere("received_at >= ? AND received_at < ?", [window.startIso, window.endIso], filters);
  const result = await db
    .prepare(
      `SELECT
        COUNT(*) AS total_events,
        COUNT(DISTINCT COALESCE(
          NULLIF(TRIM(tel), ''),
          NULLIF(TRIM(contact_id), ''),
          NULLIF(TRIM(payload_id), ''),
          NULLIF(TRIM(trigger_id), '')
        )) AS unique_users,
        SUM(CASE
          WHEN LOWER(TRIM(COALESCE(is_vip, ''))) NOT IN ('', '0', 'false', 'no') THEN 1
          ELSE 0
        END) AS vip_events
      FROM sobot_events
      WHERE ${scope.sql}`
    )
    .bind(...scope.binds)
    .first<SummaryRow>();

  return {
    totalEvents: Number(result?.total_events ?? 0),
    uniqueUsers: Number(result?.unique_users ?? 0),
    vipEvents: Number(result?.vip_events ?? 0),
  };
}

async function getEventCounts(db: D1Database, window: ReportWindow, filters: QueryFilters): Promise<CountRow[]> {
  const scope = scopedWhere("received_at >= ? AND received_at < ?", [window.startIso, window.endIso], filters);
  const result = await db
    .prepare(
      `SELECT event_key, COUNT(*) AS total
      FROM sobot_events
      WHERE ${scope.sql}
      GROUP BY event_key`
    )
    .bind(...scope.binds)
    .all<CountRow>();

  return result.results ?? [];
}

async function getTopLabels(db: D1Database, window: ReportWindow, limit: number, filters: QueryFilters): Promise<Array<{ label: string; count: number }>> {
  const scope = scopedWhere(
    "received_at >= ? AND received_at < ? AND user_label IS NOT NULL AND TRIM(user_label) != ''",
    [window.startIso, window.endIso],
    filters
  );
  const result = await db
    .prepare(
      `SELECT user_label
      FROM sobot_events
      WHERE ${scope.sql}`
    )
    .bind(...scope.binds)
    .all<{ user_label: string | null }>();

  const counts = new Map<string, number>();
  for (const row of result.results ?? []) {
    for (const label of splitLabels(row.user_label)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

async function getFailedExamples(db: D1Database, window: ReportWindow, limit: number, filters: QueryFilters): Promise<FailedRow[]> {
  const scope = scopedWhere(
    "received_at >= ? AND received_at < ? AND event_key = 'send-failed'",
    [window.startIso, window.endIso],
    filters
  );
  const result = await db
    .prepare(
      `SELECT received_at, nick, tel, payload_id, pid, trigger_id
      FROM sobot_events
      WHERE ${scope.sql}
      ORDER BY received_at DESC
      LIMIT ?`
    )
    .bind(...scope.binds, limit)
    .all<FailedRow>();

  return result.results ?? [];
}

async function getUserEventsByTel(db: D1Database, tel: string, limit: number, filters: QueryFilters): Promise<{
  user: {
    nick: string | null;
    uname: string | null;
    tel: string;
    contactId: string | null;
    labels: string[];
    isVip: boolean;
    vipLevel: string | null;
  } | null;
  events: Array<{
    receivedAt: string;
    eventKey: EventKey;
    eventLabelZh: string;
    payloadId: string | null;
    pid: string | null;
    triggerId: string | null;
  }>;
}> {
  const profileScope = scopedWhere("tel = ?", [tel], filters);
  const profile = await db
    .prepare(
      `SELECT nick, uname, tel, contact_id, user_label, is_vip, vip_level
      FROM sobot_events
      WHERE ${profileScope.sql}
      ORDER BY received_at DESC
      LIMIT 1`
    )
    .bind(...profileScope.binds)
    .first<UserProfileRow>();

  const eventScope = scopedWhere("tel = ?", [tel], filters);
  const eventsResult = await db
    .prepare(
      `SELECT received_at, event_key, event_label_zh, payload_id, pid, trigger_id
      FROM sobot_events
      WHERE ${eventScope.sql}
      ORDER BY received_at DESC
      LIMIT ?`
    )
    .bind(...eventScope.binds, limit)
    .all<Pick<EventRow, "received_at" | "event_key" | "event_label_zh" | "payload_id" | "pid" | "trigger_id">>();

  return {
    user: profile
      ? {
          nick: profile.nick,
          uname: profile.uname,
          tel: profile.tel ?? tel,
          contactId: profile.contact_id,
          labels: splitLabels(profile.user_label),
          isVip: isTruthyVip(profile.is_vip),
          vipLevel: profile.vip_level,
        }
      : null,
    events: (eventsResult.results ?? []).map((row) => ({
      receivedAt: row.received_at,
      eventKey: row.event_key,
      eventLabelZh: row.event_label_zh,
      payloadId: row.payload_id,
      pid: row.pid,
      triggerId: row.trigger_id,
    })),
  };
}

async function getConversationEvents(db: D1Database, pid: string, limit: number, filters: QueryFilters): Promise<{
  pid: string;
  events: Array<{
    receivedAt: string;
    eventKey: EventKey;
    eventLabelZh: string;
    payloadId: string | null;
    nick: string | null;
    tel: string | null;
    triggerId: string | null;
  }>;
}> {
  const scope = scopedWhere("pid = ?", [pid], filters);
  const result = await db
    .prepare(
      `SELECT received_at, event_key, event_label_zh, payload_id, nick, tel, trigger_id
      FROM sobot_events
      WHERE ${scope.sql}
      ORDER BY received_at DESC
      LIMIT ?`
    )
    .bind(...scope.binds, limit)
    .all<Pick<EventRow, "received_at" | "event_key" | "event_label_zh" | "payload_id" | "nick" | "tel" | "trigger_id">>();

  return {
    pid,
    events: (result.results ?? []).map((row) => ({
      receivedAt: row.received_at,
      eventKey: row.event_key,
      eventLabelZh: row.event_label_zh,
      payloadId: row.payload_id,
      nick: row.nick,
      tel: row.tel,
      triggerId: row.trigger_id,
    })),
  };
}

async function getFailedEventsByDate(
  db: D1Database,
  date: string,
  offsetHours: number,
  limit: number,
  filters: QueryFilters
): Promise<{
  date: string;
  total: number;
  items: Array<{
    receivedAt: string;
    nick: string | null;
    tel: string | null;
    payloadId: string | null;
    pid: string | null;
    triggerId: string | null;
  }>;
}> {
  const window = getDateWindow(date, offsetHours);
  const rows = await getFailedExamples(db, window, limit, filters);
  const totalScope = scopedWhere(
    "received_at >= ? AND received_at < ? AND event_key = 'send-failed'",
    [window.startIso, window.endIso],
    filters
  );
  const totalResult = await db
    .prepare(
      `SELECT COUNT(*) AS total_events
      FROM sobot_events
      WHERE ${totalScope.sql}`
    )
    .bind(...totalScope.binds)
    .first<{ total_events: number }>();
  return {
    date,
    total: Number(totalResult?.total_events ?? 0),
    items: rows.map((row) => ({
      receivedAt: row.received_at,
      nick: row.nick,
      tel: row.tel,
      payloadId: row.payload_id,
      pid: row.pid,
      triggerId: row.trigger_id,
    })),
  };
}

function splitLabels(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDateWindow(date: string, offsetHours: number): ReportWindow {
  const offsetMs = offsetHours * 60 * 60 * 1000;
  const startMs = Date.parse(`${date}T00:00:00.000Z`) - offsetMs;
  const endMs = startMs + 24 * 60 * 60 * 1000;

  return {
    labelDate: date,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function getDateRangeWindow(from: string, to: string, offsetHours: number): ReportWindow {
  const offsetMs = offsetHours * 60 * 60 * 1000;
  const startMs = Date.parse(`${from}T00:00:00.000Z`) - offsetMs;
  const endMs = Date.parse(`${to}T00:00:00.000Z`) - offsetMs + 24 * 60 * 60 * 1000;

  return {
    labelDate: `${from}~${to}`,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function requiredDate(value: string | null): { ok: true; value: string } | { ok: false; error: string } {
  if (!value?.trim()) return { ok: false, error: "Missing date" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return { ok: false, error: "Invalid date format, expected YYYY-MM-DD" };
  return { ok: true, value: value.trim() };
}

function requiredParam(value: string | null, error: string): { ok: true; value: string } | { ok: false; error: string } {
  if (!value?.trim()) return { ok: false, error };
  return { ok: true, value: value.trim() };
}

function requiredQueryFilters(params: URLSearchParams): { ok: true; value: QueryFilters } | { ok: false; error: string } {
  const gameCode = params.get("gameCode")?.trim();
  const canvasCode = params.get("canvasCode")?.trim();
  if (!gameCode) return { ok: false, error: "Missing gameCode" };
  return {
    ok: true,
    value: {
      gameCode,
      canvasCode: canvasCode || undefined,
    },
  };
}

function parseWebhookRoute(pathname: string): WebhookRouteMatch | null {
  const legacyPrefix = "/webhooks/sobot/";
  if (pathname.startsWith(legacyPrefix)) {
    const legacyEventKey = pathname.slice(legacyPrefix.length) as EventKey;
    const legacyEventMeta = EVENT_META_MAP[legacyEventKey];
    if (legacyEventMeta && !legacyEventKey.includes("/")) {
      return {
        gameCode: DEFAULT_LEGACY_GAME_CODE,
        canvasCode: DEFAULT_LEGACY_CANVAS_CODE,
        eventMeta: legacyEventMeta,
        sourceRoute: pathname,
      };
    }
  }

  const match = pathname.match(/^\/webhooks\/sobot\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) return null;

  const [, gameCode, canvasCode, rawEventKey] = match;
  const eventMeta = EVENT_META_MAP[rawEventKey as EventKey];
  if (!eventMeta) return null;

  return {
    gameCode: decodeURIComponent(gameCode),
    canvasCode: decodeURIComponent(canvasCode),
    eventMeta,
    sourceRoute: pathname,
  };
}

async function getExistingColumns(db: D1Database, tableName: string): Promise<Set<string>> {
  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all<ColumnInfoRow>();
  return new Set((result.results ?? []).map((row) => row.name));
}

async function ensureColumn(
  db: D1Database,
  existingColumns: Set<string>,
  tableName: string,
  columnName: string,
  columnType: string
): Promise<void> {
  if (existingColumns.has(columnName)) return;
  await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
  existingColumns.add(columnName);
}

async function backfillLegacyScope(db: D1Database): Promise<void> {
  await db
    .prepare(
      `UPDATE sobot_events
      SET game_code = ?
      WHERE game_code IS NULL OR TRIM(game_code) = ''`
    )
    .bind(DEFAULT_LEGACY_GAME_CODE)
    .run();

  await db
    .prepare(
      `UPDATE sobot_events
      SET canvas_code = ?
      WHERE canvas_code IS NULL OR TRIM(canvas_code) = ''`
    )
    .bind(DEFAULT_LEGACY_CANVAS_CODE)
    .run();
}

function scopedWhere(baseSql: string, baseBinds: unknown[], filters: QueryFilters): { sql: string; binds: unknown[] } {
  const clauses = [baseSql, "game_code = ?"];
  const binds = [...baseBinds, filters.gameCode];

  if (filters.canvasCode) {
    clauses.push("canvas_code = ?");
    binds.push(filters.canvasCode);
  }

  return {
    sql: clauses.join(" AND "),
    binds,
  };
}

function parseOffsetHours(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_REPORT_TZ_OFFSET_HOURS;
}

function nullableText(v: unknown): string | null {
  return hasValue(v) ? String(v).trim() : null;
}

function valueOrDash(v: unknown): string {
  if (v === undefined || v === null || v === "") return "-";
  return String(v);
}

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") {
    const trimmed = v.trim();
    return trimmed !== "" && trimmed !== "-";
  }
  return true;
}

function isTruthyVip(v: unknown): boolean {
  if (!hasValue(v)) return false;
  const normalized = String(v).trim().toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "no";
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
