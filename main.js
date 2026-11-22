import './style.css';
import { versions } from './versions.js';

const names = { cronParser: 'cron-parser', croner: 'Croner', both: '两侧共有' };
const examples = {
  fall: ['2026-10-24T22:00:00Z', '2026-10-25T22:00:00Z'],
  spring: ['2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z'],
  ordinary: ['2026-02-02T00:00:00Z', '2026-02-03T00:00:00Z'],
};
const form = document.querySelector('form');
const status = document.querySelector('#status');
const table = document.querySelector('.table-scroll');
const body = document.querySelector('tbody');
const share = document.querySelector('#share');
const download = document.querySelector('#download');
const exampleButtons = [...document.querySelectorAll('[data-example]')];
let report;
let replayProbe;
let stopWorker = () => {};

document.querySelector('#versions').textContent = 'cron-parser ' + versions.cronParser + '  ·  Croner ' + versions.croner;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function clearResult() {
  stopWorker();
  report = undefined;
  share.disabled = true;
  download.disabled = true;
  table.hidden = true;
  body.replaceChildren();
}

function show(result) {
  report = result;
  const counts = { both: 0, cronParser: 0, croner: 0 };
  const rows = result.rows.map(row => {
    counts[row.match]++;
    const tr = document.createElement('tr');
    tr.dataset.match = row.match;
    tr.insertCell().textContent = row.local + '  ' + row.offset;
    tr.insertCell().textContent = row.utc.slice(0, 19).replace('T', ' ') + 'Z';
    const label = tr.insertCell();
    label.textContent = names[row.match] + (row.match === 'both' ? '' : ' 独有');
    if (row.repeated.length) {
      const note = document.createElement('small');
      note.textContent = row.repeated.map(engine => names[engine]).join('、') + ' 本地时刻重复';
      label.append(note);
    }
    return tr;
  });
  body.replaceChildren(...rows);
  table.hidden = rows.length === 0;
  setStatus(rows.length
    ? (counts.cronParser || counts.croner ? '窗口内结果不同' : '窗口内结果一致') +
      ' · 共有 ' + counts.both + ' · cron-parser 独有 ' + counts.cronParser + ' · Croner 独有 ' + counts.croner
    : '窗口内两个引擎均无触发时刻。');
  share.disabled = false;
  download.disabled = false;
}

function run() {
  clearResult();
  setStatus('正在比较…');
  const input = Object.fromEntries(new FormData(form));
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const timer = setTimeout(() => {
    stopWorker();
    setStatus('计算超过 5 秒，请缩短时间窗。', true);
  }, 5000);
  stopWorker = () => {
    clearTimeout(timer);
    worker.terminate();
  };
  worker.onmessage = ({ data }) => {
    stopWorker();
    if (data.error) setStatus(data.error, true);
    else show(data.report);
  };
  worker.onerror = () => {
    stopWorker();
    setStatus('无法运行比较。请使用本地开发服务或通过 HTTP 打开构建结果。', true);
  };
  worker.postMessage({ input, probe: replayProbe });
}

function fill(input) {
  for (const key of ['expression', 'zone', 'start', 'end']) form.elements[key].value = input[key] ?? '';
}

function chooseExample(key) {
  replayProbe = undefined;
  const [start, end] = examples[key];
  fill({ expression: '30 2,14 * * *', zone: 'Europe/Luxembourg', start, end });
  for (const button of exampleButtons) button.setAttribute('aria-pressed', button.dataset.example === key);
  run();
}

for (const button of exampleButtons) button.onclick = () => chooseExample(button.dataset.example);
function markEdited() {
  replayProbe = undefined;
  for (const button of exampleButtons) button.setAttribute('aria-pressed', 'false');
  clearResult();
  setStatus('参数已更改，点击比较以更新结果。');
}
form.addEventListener('input', markEdited);
form.onsubmit = event => {
  event.preventDefault();
  run();
};

share.onclick = async () => {
  const url = new URL(location.href);
  url.hash = new URLSearchParams({ ...report.input, probe: JSON.stringify(report.probe) }).toString();
  try {
    await navigator.clipboard.writeText(url.href);
    share.textContent = '已复制';
    setTimeout(() => { share.textContent = '复制链接'; }, 1600);
  } catch {
    window.prompt('复制分享地址', url.href);
  }
};
download.onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cron-dst-report.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function loadHash() {
  if (!location.hash) {
    chooseExample('fall');
    return;
  }
  replayProbe = undefined;
  const params = new URLSearchParams(location.hash.slice(1));
  for (const button of exampleButtons) button.setAttribute('aria-pressed', 'false');
  fill(Object.fromEntries(params));
  try {
    const probe = JSON.parse(params.get('probe'));
    if (!Array.isArray(probe) || !form.checkValidity()) throw new Error();
    replayProbe = probe;
    run();
  } catch {
    clearResult();
    setStatus('分享链接中的参数无效。可选择示例或重新填写。', true);
  }
}
window.addEventListener('hashchange', loadHash);
loadHash();
