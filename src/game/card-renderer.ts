import { createCanvas } from '@napi-rs/canvas';

export async function renderCard(
    grid: (number | 0)[][], 
    drawnNumbers: Set<number>, 
    cardId: string, 
    playerName: string
): Promise<Buffer> {
    const width = 650;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background - Dark gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#0F0F1A');
    bgGradient.addColorStop(1, '#1A1A2E');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Header: 'BINGOPRO'
    ctx.fillStyle = '#FFD700'; // Gold
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('BINGOPRO', width / 2, 30);

    // Subheader: Card ID & Player Name
    ctx.fillStyle = '#A0A0B0'; // Silver
    ctx.font = '20px Arial';
    ctx.fillText(`Cartón: ${cardId} | Jugador: ${playerName}`, width / 2, 80);

    // Grid settings
    const cols = 5;
    const rows = 5;
    const cellWidth = 110;
    const cellHeight = 100;
    const startX = (width - (cols * cellWidth)) / 2;
    const startY = 130;

    // Column Headers B I N G O
    const headers = ['B', 'I', 'N', 'G', 'O'];
    ctx.font = 'bold 36px Arial';
    for (let c = 0; c < cols; c++) {
        const x = startX + (c * cellWidth) + (cellWidth / 2);
        const y = startY + 35;
        
        ctx.fillStyle = '#FFD700';
        ctx.fillText(headers[c], x, y);
    }

    const gridStartY = startY + 60;

    // Draw Grid Cells
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = startX + (c * cellWidth);
            const y = gridStartY + (r * cellHeight);
            const num = grid[r][c];
            
            const isFreeSpace = (r === 2 && c === 2) || num === 0;
            const isDrawn = drawnNumbers.has(num);

            // Draw Cell Background
            ctx.beginPath();
            ctx.roundRect(x + 5, y + 5, cellWidth - 10, cellHeight - 10, 10);
            
            if (isFreeSpace) {
                ctx.fillStyle = '#FFD700';
                ctx.fill();
            } else if (isDrawn) {
                // Vibrant green gradient for marked
                const cellGradient = ctx.createLinearGradient(x, y, x, y + cellHeight);
                cellGradient.addColorStop(0, '#00C853');
                cellGradient.addColorStop(1, '#2ECC71');
                ctx.fillStyle = cellGradient;
                ctx.fill();
                
                // Subtle glow
                ctx.shadowColor = '#00C853';
                ctx.shadowBlur = 10;
                ctx.fill();
                ctx.shadowBlur = 0; // reset
            } else {
                // Unmarked: dark glass
                ctx.fillStyle = '#1E1E3A';
                ctx.fill();
                ctx.strokeStyle = '#333366';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Draw Text
            if (isFreeSpace) {
                ctx.fillStyle = '#1A1A2E'; // Dark text for free space
                ctx.font = 'bold 24px Arial';
                ctx.fillText('LIBRE', x + (cellWidth / 2), y + (cellHeight / 2));
            } else {
                ctx.font = 'bold 34px Arial';
                if (isDrawn) {
                    ctx.fillStyle = '#FFFFFF';
                    // Text shadow
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetY = 2;
                    ctx.fillText(num.toString(), x + (cellWidth / 2), y + (cellHeight / 2));
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetY = 0;
                } else {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(num.toString(), x + (cellWidth / 2), y + (cellHeight / 2));
                }
            }
        }
    }

    // Bottom Bar / Watermark
    ctx.fillStyle = 'rgba(160, 160, 176, 0.4)'; // Dim text
    ctx.font = 'italic 16px Arial';
    ctx.fillText('bingopro.bot', width / 2, height - 30);

    return canvas.toBuffer('image/png');
}
