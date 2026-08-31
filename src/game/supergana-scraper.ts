import { logger } from '../utils/logger';

export interface SuperGanaResult {
  success: boolean;
  winningNumber?: string; // 4-digit winning number (0000-9999)
  signo?: string;         // Astrological sign if applicable (ej: "SAG", "CAP", "LEO")
  date?: string;
  drawHour?: string;
  superGana4Digits?: string;
  combina4Digits?: string;
  triNapa3Digits?: string;
  animalito2Digits?: string;
  error?: string;
}

/**
 * Scrapes and extracts the official 10:00 PM SuperGana results from https://supergana.com.ve/resultados.php
 */
export async function fetchSuperGana10pmResults(targetDate?: string): Promise<SuperGanaResult> {
  try {
    const url = 'https://supergana.com.ve/resultados.php';
    logger.info(`🔍 Fetching SuperGana results from ${url}...`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Look for the 10:00 PM block specifically:
    // Regex for div-btn11 or hh=10&format=pm
    let section10pm = html;
    const match10pmBlock = html.match(/\$\('#div-btn11'\)[\s\S]*?hh=10&format=pm'\);/i);
    if (match10pmBlock) {
      section10pm = match10pmBlock[0];
    }

    // 1. Look for SuperGana_Sig1: {"f":"2026-08-31","id":"SuperGana_Sig1","N":"2266","S":"SAG"}
    const superGanaRegex = /"id":"SuperGana_Sig\d*","N":"(\d+)","S":"([^"]*)"/i;
    const superGanaMatch = section10pm.match(superGanaRegex) || html.match(superGanaRegex);

    // 2. Look for CombinaFT: {"f":"2026-08-31","id":"CombinaFT1","N":"1809","S":""}
    const combinaRegex = /"id":"CombinaFT\d*","N":"(\d{4})"/i;
    const combinaMatch = section10pm.match(combinaRegex) || html.match(combinaRegex);

    // 3. Look for TriNapa: {"id":"TriNapa1","N":"434"}
    const triNapaRegex = /"id":"TriNapa\d*","N":"(\d{3})"/i;
    const triNapaMatch = section10pm.match(triNapaRegex);

    // 4. Look for CondorGana / TropiGana: {"id":"TropiGana1","N":"18","S":"Burro"}
    const tropiRegex = /"id":"TropiGana\d*","N":"(\d{2})","S":"([^"]*)"/i;
    const tropiMatch = section10pm.match(tropiRegex);

    const superGana4 = superGanaMatch ? superGanaMatch[1].padStart(4, '0') : undefined;
    const combina4 = combinaMatch ? combinaMatch[1].padStart(4, '0') : undefined;
    const signo = superGanaMatch ? superGanaMatch[2] : '';
    const triNapa3 = triNapaMatch ? triNapaMatch[1] : undefined;
    const animalito2 = tropiMatch ? `${tropiMatch[1]} - ${tropiMatch[2]}` : undefined;

    // The primary 4-digit winner for the 10,000 number raffle is SuperGana (or CombinaFT)
    const winningNumber = superGana4 || combina4;

    if (winningNumber) {
      const today = targetDate || new Date().toISOString().split('T')[0];
      return {
        success: true,
        winningNumber,
        signo,
        drawHour: '10:00 PM',
        date: today,
        superGana4Digits: superGana4,
        combina4Digits: combina4,
        triNapa3Digits: triNapa3,
        animalito2Digits: animalito2
      };
    }

    throw new Error('No se pudo encontrar el resultado oficial de 4 cifras para el sorteo de las 10:00 PM.');

  } catch (error: any) {
    logger.error(`Error fetching SuperGana 10pm result: ${error.message}`);
    return {
      success: false,
      error: error.message || 'Error al consultar supergana.com.ve'
    };
  }
}
