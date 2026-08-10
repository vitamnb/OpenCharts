// Drawdown calculation from equity curve data
// Returns array of { time, drawdown } where drawdown is a negative percentage

export interface DrawdownPoint {
  time: number; // unix seconds
  drawdown: number; // negative percentage (e.g. -5.2 means -5.2% drawdown)
}

export function calculateDrawdown(
  equityCurve: Array<{ timestamp: number; equity: number }>,
): DrawdownPoint[] {
  if (equityCurve.length === 0) return [];

  const points: DrawdownPoint[] = [];
  let peak = equityCurve[0]!.equity;

  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const drawdown = peak > 0 ? ((point.equity - peak) / peak) * 100 : 0;
    points.push({
      time: Math.floor(point.timestamp / 1000),
      drawdown,
    });
  }

  return points;
}

// Find the maximum drawdown from a drawdown series
export function maxDrawdown(points: DrawdownPoint[]): number {
  if (points.length === 0) return 0;
  return Math.min(...points.map((p) => p.drawdown));
}

// Find drawdown duration (bars between peak and trough)
export function drawdownDuration(points: DrawdownPoint[]): {
  maxDurationBars: number;
  currentDurationBars: number;
} {
  let maxDuration = 0;
  let currentStart = 0;
  let inDrawdown = false;

  for (let i = 0; i < points.length; i++) {
    if (points[i]!.drawdown < 0) {
      if (!inDrawdown) {
        inDrawdown = true;
        currentStart = i;
      }
    } else {
      if (inDrawdown) {
        const duration = i - currentStart;
        if (duration > maxDuration) {
          maxDuration = duration;
        }
        inDrawdown = false;
      }
    }
  }

  // If still in drawdown at the end
  if (inDrawdown) {
    const duration = points.length - currentStart;
    if (duration > maxDuration) {
          maxDuration = duration;
        }
  }

  return {
    maxDurationBars: maxDuration,
    currentDurationBars: inDrawdown ? points.length - currentStart : 0,
  };
}
