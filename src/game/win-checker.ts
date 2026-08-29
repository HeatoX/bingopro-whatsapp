export function getMarkedGrid(grid: (number | 0)[][], drawnNumbers: Set<number>): boolean[][] {
  return grid.map(row => 
    row.map(cell => cell === 0 || drawnNumbers.has(cell))
  );
}

/** Count completed horizontal rows (Filas Horizontales B-I-N-G-O) */
export function getCompletedHorizontalRows(marked: boolean[][]): number[] {
  const rows: number[] = [];
  for (let r = 0; r < 5; r++) {
    if (marked[r].every(v => v)) rows.push(r);
  }
  return rows;
}

export function checkOneLine(grid: (number | 0)[][], drawnNumbers: Set<number>): boolean {
  const marked = getMarkedGrid(grid, drawnNumbers);
  return getCompletedHorizontalRows(marked).length >= 1;
}

export function checkTwoLines(grid: (number | 0)[][], drawnNumbers: Set<number>): boolean {
  const marked = getMarkedGrid(grid, drawnNumbers);
  return getCompletedHorizontalRows(marked).length >= 2;
}

export function checkFullCard(grid: (number | 0)[][], drawnNumbers: Set<number>): boolean {
  const marked = getMarkedGrid(grid, drawnNumbers);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (!marked[r][c]) return false;
    }
  }
  return true;
}
