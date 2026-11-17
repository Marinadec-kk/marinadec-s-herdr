export function project(rows) {
  const children = row => rows.filter(item => item.parent === row?.id);
  const out = [];
  const visit = (row, depth, continuations) => {
    out.push({ ...row, depth, last: false, continuations });
    const list = children(row);
    list.forEach((child, index) => {
      visit(child, depth + 1, [...continuations, index !== list.length - 1]);
    });
  };
  rows.filter(row => !row.parent).forEach(row => visit(row, 0, []));
  return out.map(row => ({
    ...row, last: children({ id: row.parent }).at(-1)?.id === row.id,
  }));
}

// Keep tree ink in its own gutter, outside avatars and status slots.
export function segments(row, height) {
  const mid = height / 2, lines = [];
  const lane = depth => Math.min(depth, 1) * 4;
  for (let i = 0; i < row.depth - 1; i++)
    if (row.continuations[i]) lines.push([lane(i), 0, 2, height]);
  if (row.depth) lines.push([lane(row.depth - 1), 0, 2, row.last ? mid : height], [lane(row.depth - 1), mid, 8 - lane(row.depth - 1), 2]);
  if (row.children) lines.push([lane(row.depth), mid, 2, height - mid]);
  return lines;
}
