import crypto from 'crypto';

export function generateBallSequence(serverSeed: string, clientSeed: string): number[] {
  const sequence: number[] = [];
  const availableBalls = Array.from({ length: 75 }, (_, i) => i + 1);

  let cursor = 0;
  while (availableBalls.length > 0) {
    const hmac = crypto.createHmac('sha256', serverSeed);
    hmac.update(`${clientSeed}:${cursor}`);
    const hash = hmac.digest('hex');

    for (let i = 0; i < hash.length / 8; i++) {
      if (availableBalls.length === 0) break;

      const chunk = hash.substring(i * 8, (i + 1) * 8);
      const num = parseInt(chunk, 16);
      
      const index = num % availableBalls.length;
      sequence.push(availableBalls[index]);
      availableBalls.splice(index, 1);
    }
    cursor++;
  }
  return sequence;
}

export function verifyFairness(serverSeed: string, clientSeed: string, sequence: number[]): boolean {
  const generated = generateBallSequence(serverSeed, clientSeed);
  if (generated.length !== sequence.length) return false;
  for (let i = 0; i < sequence.length; i++) {
    if (generated[i] !== sequence[i]) return false;
  }
  return true;
}

export function getBallColumn(num: number): string {
  if (num >= 1 && num <= 15) return 'B';
  if (num >= 16 && num <= 30) return 'I';
  if (num >= 31 && num <= 45) return 'N';
  if (num >= 46 && num <= 60) return 'G';
  if (num >= 61 && num <= 75) return 'O';
  throw new Error(`Invalid ball number: ${num}`);
}
