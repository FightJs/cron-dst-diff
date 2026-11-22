import { CronExpressionParser } from 'cron-parser';
import { Cron } from 'croner';
import { versions } from './versions.js';

export const zones = ['Europe/Luxembourg', 'America/New_York'];
const limit = 1000;
const probeDates = [
  '2026-01-01T00:00:00Z', '2026-03-08T06:59:00Z', '2026-03-08T07:00:00Z',
  '2026-03-29T00:59:00Z', '2026-03-29T01:00:00Z', '2026-10-25T00:59:00Z',
  '2026-10-25T01:00:00Z', '2026-11-01T05:59:00Z', '2026-11-01T06:00:00Z',
];

function readInstant(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!parts) throw new Error('请输入带 Z 或 UTC 偏移的 ISO 时刻，例如 2026-10-25T00:00:00+02:00。');
  const [year, month, day, hour, minute, second = 0] = parts.slice(1, 7).map(item => item === undefined ? undefined : Number(item));
  const date = new Date(value);
  if (year < 2025 || year > 2027 || month < 1 || month > 12 || day < 1 ||
      day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
      hour > 23 || minute > 59 || second > 59 || !Number.isFinite(+date)) {
    throw new Error('日期或时刻无效。');
  }
  return date;
}

function readExpression(value) {
  const fields = value.trim().split(/\s+/);
  if (value.length > 256 || fields.length !== 5 || (fields[2] !== '*' && fields[4] !== '*')) {
    throw new Error('请输入五字段 Cron，日期和星期至少一项为 *。');
  }
  const min = [0, 0, 1, 1, 0];
  const max = [59, 23, 31, 12, 6];
  for (const [index, field] of fields.entries()) {
    for (const term of field.split(',')) {
      const parts = /^(\*|\d{1,2}(?:-\d{1,2})?)(?:\/(\d{1,2}))?$/.exec(term);
      if (!parts) throw new Error('字段只支持数字、通配、列表、范围和步长。');
      const [, range, step] = parts;
      const [first, last = first] = range.split('-').map(Number);
      if ((range !== '*' && (first < min[index] || last > max[index] || first > last)) ||
          (step !== undefined && (+step < 1 || +step > max[index] - min[index] + 1 || (range !== '*' && !range.includes('-'))))) {
        throw new Error('字段中的值、范围或步长无效。');
      }
    }
  }
  return fields.join(' ');
}

function localReader(zone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
  });
  return date => {
    const fields = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
    return {
      local: fields.year + '-' + fields.month + '-' + fields.day + ' ' + fields.hour + ':' + fields.minute + ':' + fields.second,
      offset: fields.timeZoneName.slice(3) || '+00:00',
    };
  };
}

export function probe(zone) {
  const local = localReader(zone);
  return probeDates.map(utc => ({ utc, offset: local(new Date(utc)).offset }));
}

function normalizeDates(dates, start, end) {
  if (dates.length > limit) throw new Error('窗口内超过 1000 次触发，请缩短时间窗。');
  return dates.map((date, index) => {
    if (!(date > (dates[index - 1] ?? start) && date <= end)) {
      throw new Error('引擎返回了非递增或超出窗口的时刻，无法比较。');
    }
    return date.toISOString();
  });
}

export function compare(input, expectedProbe) {
  const { zone } = input;
  if (!zones.includes(zone)) throw new Error('请选择支持的时区。');
  const resolvedProbe = probe(zone);
  if (expectedProbe !== undefined && JSON.stringify(expectedProbe) !== JSON.stringify(resolvedProbe)) {
    throw new Error('当前环境不支持重放此分享结果。时区探针与分享来源不同。');
  }
  const expression = readExpression(input.expression);
  const start = readInstant(input.start);
  const end = readInstant(input.end);
  const local = localReader(zone);
  if (start >= end || !local(start).local.startsWith('2026-') ||
      !local(new Date(+end - 1)).local.startsWith('2026-')) {
    throw new Error('起点须早于终点，且窗口须位于所选时区的 2026 年。');
  }

  // Five-field schedules have whole-second triggers. The parser carries the cursor's
  // milliseconds into its end-date check, so give both engines a whole-second cursor.
  const cursor = new Date(Math.floor(+start / 1000) * 1000);
  const parser = CronExpressionParser.parse(expression, { currentDate: cursor, endDate: end, tz: zone });
  const parserDates = [];
  while (parserDates.length <= limit) {
    try {
      parserDates.push(parser.next().toDate());
    } catch (error) {
      if (error.message !== 'Out of the time span range') throw error;
      break;
    }
  }
  const croner = new Cron(expression, { timezone: zone, paused: true, stopAt: new Date(+end + 1) });
  const utc = {
    cronParser: normalizeDates(parserDates, start, end),
    croner: normalizeDates(croner.nextRuns(limit + 1, cursor), start, end),
  };
  const rows = new Map();
  const repeats = { cronParser: new Map(), croner: new Map() };
  for (const [engine, times] of Object.entries(utc)) {
    for (const instant of times) {
      const row = rows.get(instant) ?? { utc: instant, ...local(new Date(instant)), match: engine, repeated: [] };
      if (rows.has(instant)) row.match = 'both';
      rows.set(instant, row);
      const sameWallTime = repeats[engine].get(row.local) ?? [];
      sameWallTime.push(row);
      repeats[engine].set(row.local, sameWallTime);
    }
    for (const group of repeats[engine].values()) {
      if (group.length > 1) group.forEach(row => row.repeated.push(engine));
    }
  }
  return {
    schema: 1, versions, input: { expression, zone, start: input.start, end: input.end },
    resolvedZone: new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone,
    runtime: typeof process === 'object' && process.versions?.node
      ? { node: process.version, icu: process.versions.icu, tz: process.versions.tz }
      : { userAgent: navigator.userAgent },
    probe: resolvedProbe, offsets: { start: local(start).offset, end: local(end).offset },
    utc, rows: [...rows.values()].sort((a, b) => a.utc.localeCompare(b.utc)),
  };
}
