import crypto from 'crypto';

function secureShuffle(array: number[]): number[] {
  const result = [...array];
  let currentIndex = result.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = crypto.randomInt(0, currentIndex);
    currentIndex--;
    [result[currentIndex], result[randomIndex]] = [result[randomIndex], result[currentIndex]];
  }
  return result;
}

export function generateCard(gameId: string, cardIndex: number): { grid: (number | 0)[][]; hash: string } {
  const b = secureShuffle(Array.from({ length: 15 }, (_, i) => i + 1)).slice(0, 5);
  const i = secureShuffle(Array.from({ length: 15 }, (_, j) => j + 16)).slice(0, 5);
  const n = secureShuffle(Array.from({ length: 15 }, (_, k) => k + 31)).slice(0, 5);
  const g = secureShuffle(Array.from({ length: 15 }, (_, l) => l + 46)).slice(0, 5);
  const o = secureShuffle(Array.from({ length: 15 }, (_, m) => m + 61)).slice(0, 5);

  n[2] = 0; // FREE space

  const grid: (number | 0)[][] = [
    [b[0], i[0], n[0], g[0], o[0]],
    [b[1], i[1], n[1], g[1], o[1]],
    [b[2], i[2], n[2], g[2], o[2]],
    [b[3], i[3], n[3], g[3], o[3]],
    [b[4], i[4], n[4], g[4], o[4]],
  ];

  const hash = crypto
    .createHash('sha256')
    .update(`${gameId}:${cardIndex}:${JSON.stringify(grid)}`)
    .digest('hex');

  return { grid, hash };
}
