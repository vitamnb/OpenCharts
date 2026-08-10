/**
 * Volume profile calculation from candle data.
 * Groups volume by price level, finds POC (Point of Control),
 * Value Area High/Low (70% of total volume around POC).
 */

export interface VolumeLevel {
  price: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
}

export interface VolumeProfileResult {
  levels: VolumeLevel[];
  poc: number; // Point of Control, price level with highest volume
  vah: number; // Value Area High
  val: number; // Value Area Low
  totalVolume: number;
}

const VALUE_AREA_RATIO = 0.70; // 70% of total volume

/**
 * Compute volume profile from candle data.
 * Each candle distributes its volume across the price range it covers (high to low).
 * Up candles attribute volume to buy, down candles to sell.
 */
export function computeVolumeProfile(
  candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>,
  bins: number = 50,
): VolumeProfileResult {
  if (candles.length === 0) {
    return { levels: [], poc: 0, vah: 0, val: 0, totalVolume: 0 };
  }

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let totalVol = 0;

  for (const c of candles) {
    minPrice = Math.min(minPrice, c.low);
    maxPrice = Math.max(maxPrice, c.high);
    totalVol += c.volume;
  }

  if (totalVol === 0 || minPrice === maxPrice) {
    return { levels: [], poc: 0, vah: 0, val: 0, totalVolume: 0 };
  }

  const binSize = (maxPrice - minPrice) / bins;
  const levels: VolumeLevel[] = Array.from({ length: bins }, (_, i) => ({
    price: minPrice + binSize * (i + 0.5),
    buyVolume: 0,
    sellVolume: 0,
    totalVolume: 0,
  }));

  for (const c of candles) {
    const startBin = Math.floor((c.low - minPrice) / binSize);
    const endBin = Math.ceil((c.high - minPrice) / binSize);
    const span = endBin - startBin;
    if (span <= 0) continue;

    const volPerBin = c.volume / span;
    const isUp = c.close >= c.open;

    for (let b = startBin; b < endBin && b < bins; b++) {
      if (b < 0) continue;
      const lv = levels[b];
      if (!lv) continue;
      if (isUp) lv.buyVolume += volPerBin;
      else lv.sellVolume += volPerBin;
      lv.totalVolume += volPerBin;
    }
  }

  // POC: bin with highest total volume
  let pocIdx = 0;
  let maxVol = 0;
  for (let i = 0; i < bins; i++) {
    const lv = levels[i];
    if (!lv) continue;
    if (lv.totalVolume > maxVol) {
      maxVol = lv.totalVolume;
      pocIdx = i;
    }
  }

  // Value Area: expand from POC until 70% of total volume is covered
  const targetVol = totalVol * VALUE_AREA_RATIO;
  let vahIdx = pocIdx;
  let valIdx = pocIdx;
  let coveredVol = levels[pocIdx]?.totalVolume ?? 0;

  while (coveredVol < targetVol && (valIdx > 0 || vahIdx < bins - 1)) {
    const aboveVol = vahIdx < bins - 1 ? (levels[vahIdx + 1]?.totalVolume ?? 0) : 0;
    const belowVol = valIdx > 0 ? (levels[valIdx - 1]?.totalVolume ?? 0) : 0;
    if (aboveVol >= belowVol && vahIdx < bins - 1) {
      vahIdx++;
      coveredVol += levels[vahIdx]?.totalVolume ?? 0;
    } else if (valIdx > 0) {
      valIdx--;
      coveredVol += levels[valIdx]?.totalVolume ?? 0;
    } else {
      break;
    }
  }

  return {
    levels,
    poc: levels[pocIdx]?.price ?? 0,
    vah: levels[vahIdx]?.price ?? 0,
    val: levels[valIdx]?.price ?? 0,
    totalVolume: totalVol,
  };
}