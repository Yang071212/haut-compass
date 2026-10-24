import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const SOURCE_URL = 'https://haut-compass.vercel.app/api/data';
const SNAPSHOT_URL = new URL('../public/data/snapshot.json', import.meta.url);
const COLLECTIONS = ['campus', 'projects', 'competitions', 'frontier', 'sources'];
const MAX_AGE_MS = 36 * 60 * 60 * 1000;

export function validateData(data) {
  if (!data || typeof data !== 'object' || !COLLECTIONS.every((key) => Array.isArray(data[key]))) {
    throw new Error('公开数据结构无效');
  }
  if (typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt))) {
    throw new Error('公开数据缺少有效更新时间');
  }
  return data;
}

export async function updateSnapshot({ fetcher = globalThis.fetch, previous, now = new Date(), timeoutMs = 20000 } = {}) {
  validateData(previous);
  const checkedAt = new Date(now).toISOString();
  const nowMs = Date.parse(checkedAt);
  try {
    const response = await fetcher(SOURCE_URL, {
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      credentials: 'omit',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error('公开数据请求失败');
    const data = validateData(await response.json());
    if (data.delivery?.mode !== 'live') throw new Error('上游正在提供旧快照');
    const updatedMs = Date.parse(data.updatedAt);
    if (updatedMs > nowMs + 10 * 60 * 1000 || nowMs - updatedMs > MAX_AGE_MS) throw new Error('上游更新时间异常或内容已超过36小时');
    if (updatedMs < Date.parse(previous.updatedAt)) throw new Error('上游更新时间早于已发布内容');
    return {
      ok: true,
      data: {
        ...data,
        schedule: { enabled: true, time: '08:30', timezone: 'Asia/Shanghai' },
        delivery: { mode: 'mirror', checkedAt, upstreamMode: 'live' },
      },
    };
  } catch {
    return {
      ok: false,
      data: {
        ...previous,
        schedule: { enabled: true, time: '08:30', timezone: 'Asia/Shanghai' },
        delivery: {
          ...previous.delivery,
          mode: 'snapshot',
          checkedAt,
          warning: '镜像本次同步失败或上游内容已过旧，当前显示上次保存的内容。请查看原数据更新时间，本次检查不代表更新成功。',
        },
      },
    };
  }
}

async function main() {
  const previous = JSON.parse(await readFile(SNAPSHOT_URL, 'utf8'));
  const result = await updateSnapshot({ previous });
  await writeFile(SNAPSHOT_URL, JSON.stringify(result.data));
  console.log(result.ok
    ? `Mirror updated. Source data timestamp: ${result.data.updatedAt}`
    : `Mirror refresh failed; preserved source data timestamp: ${result.data.updatedAt}`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
