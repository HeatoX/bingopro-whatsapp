export function getMarkedGrid(grid: (number | 0)[][], drawnNumbers: Set<number>): boolean[][] {
  return grid.map(row => 
    row.map(cell => cell === 0 || drawnNumbers.has(cell))
  );
}

/** Count all completed lines: 5 rows + 5 columns + 2 diagonals = 12 possible */
function countCompletedLines(marked: boolean[][]): number {
  let count = 0;

  // 5 horizontal rows
  for (let r = 0; r < 5; r++) {
    if (marked[r].every(v => v)) count++;
  }

  // 5 vertical columns
  for (let c = 0; c < 5; c++) {
    let complete = true;
    for (let r = 0; r < 5; r++) {
      if (!marked[r][c]) { complete = false; break; }
    }
    if (complete) count++;
  }

  // Diagonal top-left to bottom-right
  if (marked[0][0] && marked[1][1] && marked[2][2] && marked[3][3] && marked[4][4]) count++;

  // Diagonal top-right to bottom-left
  if (marked[0][4] && marked[1][3] && marked[2][2] && marked[3][1] && marked[4][0]) count++;

  return count;
}

export function checkOneLine(grid: (number | 0)[][], drawnNumbers: Set<number>): boolean {
  return countCompletedLines(getMarkedGrid(grid, drawnNumbers)) >= 1;
}

export function checkTwoLines(grid: (number | 0)[][], drawnNumbers: Set<number>): boolean {
  return countCompletedLines(getMarkedGrid(grid, drawnNumbers)) >= 2;
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
