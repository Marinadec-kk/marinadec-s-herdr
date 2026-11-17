export const MACHINES = [
  { id: "local", name: "This computer", character: "ss14-atmosian-icon", color: "#bcb62d" },
  { id: "devbox", name: "devbox", character: "ss14-snake-icon", color: "#76bd94" },
];

export function fixtures() {
  return [
    { id: "docs", machine: "local", name: "Documentolog", icon: "account_balance", tone: 0, depth: 0,
      sessions: [{ id: "index", name: "Индексация документов", program: "Claude Code", letter: "C", status: "working" }] },
    { id: "api", machine: "local", name: "api-service", icon: "dns", tone: 1, depth: 0,
      sessions: [{ id: "migration", name: "Проверка миграции", program: "OpenCode", letter: "O", status: "blocked" }] },
    { id: "notes", machine: "local", name: "notes · только shell", icon: "description", tone: 3, depth: 0, sessions: [] },
    { id: "cross", machine: "devbox", name: "cross_analysis", icon: "grid_3x3", tone: 0, depth: 0,
      sessions: [
        { id: "matrix", name: "Матрица данных", program: "OpenCode", letter: "O", status: "working" },
        { id: "report", name: "Новый отчёт", program: "Claude Code", letter: "C", status: "done" },
      ] },
    { id: "atlas", machine: "devbox", name: "atlas_merging", icon: "account_tree", parent: "cross", tone: 0, depth: 1,
      sessions: [{ id: "atlas-agent", name: "Слияние атласов", program: "Pi", letter: "P", status: "idle" }] },
    { id: "atlas-deep", machine: "devbox", name: "atlas_validation", icon: "account_tree", parent: "atlas", tone: 0, depth: 2,
      sessions: [{ id: "validate", name: "Проверка результата", program: "OpenCode", letter: "O", status: "blocked" }] },
    { id: "docs-tree", machine: "devbox", name: "docs_update", icon: "account_tree", parent: "cross", tone: 0, depth: 1,
      sessions: [{ id: "docs-agent", name: "Документация", program: "Pi", letter: "P", status: "idle" }] },
    { id: "gov", machine: "devbox", name: "gov_kz", icon: "gavel", tone: 2, depth: 0,
      sessions: [{ id: "gov-agent", name: "Новая выгрузка", program: "Claude Code", letter: "C", status: "done" }] },
  ];
}

export function spaceTip(entry, entries) {
  const names = [entry.name];
  let parent = entries.find(row => row.id === entry.parent);
  const seen = new Set([entry.id]);
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id); names.unshift(parent.name);
    parent = entries.find(row => row.id === parent.parent);
  }
  return `${MACHINES.find(m => m.id === entry.machine).name} → ${names.join(" → ")}`;
}
