
export const COLS = 90;
const MAX_LINES = 500;

export function wrap(text, cols = COLS) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    let line = raw;
    if (line.length === 0) { out.push(''); continue; }
    while (line.length > cols) {
      let cut = line.lastIndexOf(' ', cols);
      if (cut <= 0) cut = cols;
      out.push(line.slice(0, cut));
      line = line.slice(cut).replace(/^ /, '');
    }
    out.push(line);
  }
  return out;
}

export function createTerminal(def, id) {
  return {
    id,
    def,
    cwd: [],
    input: '',
    history: [],
    hIdx: 0,
    lines: [
      ...wrap(`${def.name} :: ROOT SHELL`),
      "type 'help' for commands. ESC to disconnect.",
      '',
    ],
  };
}

export const promptOf = (t) => `root@${t.def.host || 'node'}:/${t.cwd.join('/')}$ `;

function resolve(fs, cwd, path) {
  const parts = path.startsWith('/') ? [] : [...cwd];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { parts.pop(); continue; }
    parts.push(seg);
  }
  let node = fs;
  for (const seg of parts) {
    if (node && typeof node === 'object' && Object.hasOwn(node, seg)) node = node[seg];
    else return null;
  }
  return { node, parts };
}

const HELP = [
  'commands:',
  '  help             show this list',
  '  ls [-a] [dir]    list files (-a shows hidden)',
  '  cat <file>       print a file',
  '  cd <dir>         change directory',
  '  pwd              print working directory',
  '  unlock <code>    submit an access code',
  '  whoami           query process identity',
  '  clear            clear the screen',
  '  exit             disconnect (or press ESC)',
];

export function exec(term, line, used) {
  const [cmd, ...args] = line.trim().split(/\s+/);
  const def = term.def;
  if (!cmd) return { out: [] };

  switch (cmd) {
    case 'help':
      return { out: HELP };

    case 'pwd':
      return { out: ['/' + term.cwd.join('/')] };

    case 'whoami':
      return { out: ['process 0x00 :: parent: <none> :: origin: unknown'] };

    case 'clear':
      return { out: [], clear: true };

    case 'exit':
      return { out: ['connection closed.'], exit: true };

    case 'ls': {
      const all = args.includes('-a');
      const path = args.find((a) => !a.startsWith('-')) || '.';
      const r = resolve(def.fs, term.cwd, path);
      if (!r) return { out: [`ls: cannot access '${path}': No such file or directory`] };
      if (typeof r.node === 'string') return { out: [path] };
      const names = Object.keys(r.node)
        .filter((n) => all || !n.startsWith('.'))
        .sort()
        .map((n) => (typeof r.node[n] === 'object' ? n + '/' : n));
      return { out: [names.length ? names.join('  ') : '(empty)'] };
    }

    case 'cat': {
      if (!args[0]) return { out: ['cat: missing file operand'] };
      const r = resolve(def.fs, term.cwd, args[0]);
      if (!r) return { out: [`cat: ${args[0]}: No such file or directory`] };
      if (typeof r.node === 'object') return { out: [`cat: ${args[0]}: Is a directory`] };
      return { out: r.node.split('\n') };
    }

    case 'cd': {
      if (!args[0]) { term.cwd = []; return { out: [] }; }
      const r = resolve(def.fs, term.cwd, args[0]);
      if (!r) return { out: [`cd: ${args[0]}: No such file or directory`] };
      if (typeof r.node === 'string') return { out: [`cd: ${args[0]}: Not a directory`] };
      term.cwd = r.parts;
      return { out: [] };
    }

    case 'unlock': {
      const code = args.join(' ').trim().toUpperCase();
      if (!code) return { out: ['usage: unlock <code>'] };
      const entry = (def.unlocks || []).find((u) => u.code.toUpperCase() === code);
      if (!entry) return { out: ['ACCESS DENIED :: invalid code'] };
      const key = `${term.id}:${entry.code.toUpperCase()}`;
      if (used.has(key)) return { out: ['code already accepted.'] };
      used.add(key);
      const effects = [];
      for (const d of entry.doors || []) effects.push({ type: 'door', id: d });
      if (entry.reward?.heart) effects.push({ type: 'heart' });
      if (entry.reward?.ability) effects.push({ type: 'ability', name: entry.reward.ability });
      return { out: [entry.message || 'ACCESS GRANTED'], effects };
    }

    default:
      return { out: [`${cmd}: command not found`] };
  }
}

function submit(term, line, used) {
  term.lines.push(...wrap(promptOf(term) + line));
  if (line.trim()) term.history.push(line);
  term.hIdx = term.history.length;
  const r = exec(term, line, used);
  if (r.clear) term.lines.length = 0;
  term.lines.push(...r.out.flatMap((l) => wrap(l)));
  if (term.lines.length > MAX_LINES) term.lines.splice(0, term.lines.length - MAX_LINES);
  return r;
}

export function terminalKey(term, ev, used) {
  const none = { effects: [], exit: false };
  const k = ev.key;
  if (k === 'Escape') return { effects: [], exit: true };
  if (k === 'Enter') {
    const line = term.input;
    term.input = '';
    const r = submit(term, line, used);
    return { effects: r.effects || [], exit: !!r.exit };
  }
  if (k === 'Backspace') { term.input = term.input.slice(0, -1); return none; }
  if (k === 'ArrowUp') {
    if (term.hIdx > 0) term.input = term.history[--term.hIdx];
    return none;
  }
  if (k === 'ArrowDown') {
    if (term.hIdx < term.history.length - 1) term.input = term.history[++term.hIdx];
    else { term.hIdx = term.history.length; term.input = ''; }
    return none;
  }
  if (k.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey && term.input.length < 80) {
    term.input += k;
  }
  return none;
}
