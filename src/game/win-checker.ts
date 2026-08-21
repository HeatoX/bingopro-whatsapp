export function getMarkedGrid(grid: (number | 0)[][], drawnNumbers: Set<number>): boolean[][] {
  return grid.map(row => 
    row.map(cell => cell === 0 || drawnNumbers.has(cell))
  );
}

export function checkOneLine(grid: (number | 0)[][], drawnNumbers: Set<number>): boolean {
  const marked = getMarkedGrid(grid, drawnNumbers);
  
  for (let r = 0; r < 5; r++) {
    let complete = true;
    for (let c = 0; c < 5; c++) {
      if (!marked[r][c]) {
        complete = false;
        break;
      }
    }
    if (complete) return true;
  }
  
  return false;
}

export function checkTwoLines(grid: (number | 0)[][], drawnNumbers: Set<number>): boolean {
  const marked = getMarkedGrid(grid, drawnNumbers);
  
  let completeRows = 0;
  for (let r = 0; r < 5; r++) {
    let complete = true;
    for (let c = 0; c < 5; c++) {
      if (!marked[r][c]) {
        complete = false;
        break;
      }
    }
    if (complete) completeRows++;
  }
  
  return completeRows >= 2;
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
