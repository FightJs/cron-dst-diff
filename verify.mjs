import { readFileSync } from 'node:fs';
import { compare } from './compare.js';
import { versions } from './versions.js';

try {
  const file = process.argv[2];
  if (!file) throw new Error('用法：npm run verify -- cron-dst-report.json');
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  if (saved.schema !== 1 || saved.versions?.cronParser !== versions.cronParser ||
      saved.versions?.croner !== versions.croner || !Array.isArray(saved.probe)) {
    throw new Error('报告格式、引擎版本或时区探针不匹配。');
  }
  const actual = compare(saved.input, saved.probe);
  for (const engine of Object.keys(versions)) {
    const expected = saved.utc?.[engine];
    if (!Array.isArray(expected) || expected.length !== actual.utc[engine].length ||
        expected.some((time, index) => time !== actual.utc[engine][index])) {
      throw new Error(engine + ' 的 UTC 触发列表与报告不同。');
    }
  }
  console.log('已核对当前 Node 环境的时区探针和两侧 UTC 列表。');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
