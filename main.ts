// Capitulation-bounce cbBTC bot for make.fun btc-race-24h-20261118-1444.
//
// Strategy (long only, $1,000 paper USDC, 1-minute cbBTC/USDC bars):
// buy the whole cash balance only after a deep, fast sell-off has
// exhausted itself, then sell into the rebound. A round trip pays about
// 26 bps in fees, slippage and pool impact, so only a move well above
// that can pay; small wiggles are ignored on purpose.
//
// Entry, on a bar's close (filled at the next bar's open), flat only:
//   * deep capitulation: 30-minute return <= -180 bps, RSI(14) <= 35,
//     and the last 1-minute return >= 0 (the fall has stopped falling);
//   * fallback, only if no trade has filled yet: from bar 720 on, a
//     30-minute return <= -110 bps with the same RSI/bounce test, and
//     from bar 1200 on, a 15-minute return <= -60 bps, RSI <= 40.
//     The fallback exists so the bot still meets the race's 1-trade
//     guardrail in a window with no deep capitulation; it never fires
//     in a window where a deep trade already happened.
//
// Exit, whole position, on a bar's close:
//   * take profit at +125 bps over the average fill price;
//   * stop loss at -60 bps;
//   * trailing exit: once +30 bps in profit, sell if the price falls
//     50 bps from the peak since entry;
//   * overbought exit: RSI(14) >= 72;
//   * time exit: 45 bars after entry.
//   After an exit, wait 10 bars before a new entry.
//
// Indicators are computed from closes only, in float64, with Wilder's
// RSI(14). No network, no clock, no randomness, no files outside the
// repository: the same bars give the same orders, run after run.
//
// Laid out like an entrant's repository: the grader runs
// `node /bot/main.ts`; vendor/makefun-bars.ts is a byte-identical copy
// of the kit's sdk/makefun-bars.ts.

import { runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 100;

// Entry thresholds, in basis points.
const DEEP_DROP_30M_BPS = -180;
const FALLBACK_DROP_30M_BPS = -110;
const FALLBACK_DROP_15M_BPS = -60;
const RSI_ENTRY_MAX = 35;
const RSI_FALLBACK2_MAX = 40;
// Exit thresholds, in basis points.
const TAKE_PROFIT_BPS = 125;
const STOP_LOSS_BPS = -60;
const TRAIL_PROFIT_BPS = 30;
const TRAIL_DROP_BPS = 50;
const RSI_EXIT_MIN = 72;
const MAX_HOLD_BARS = 45;
const COOLDOWN_BARS = 10;
const FALLBACK1_BAR = 720;
const FALLBACK2_BAR = 1200;
const RSI_BARS = 14;

const closes: number[] = [];
let prevClose: number | null = null;
const rsiFirst: number[] = [];
let rsiGain: number | null = null;
let rsiLoss: number | null = null;
let entryPrice: number | null = null; // average fill price, price_scale units
let entryQty = 0n;
let entrySeq = -1;
let peakClose: number | null = null;
let lastExitSeq = -1_000_000;
let tradesDone = 0;

function pushClose(close: number): number | null {
  if (prevClose !== null) {
    const change = close - prevClose;
    const up = change > 0 ? change : 0;
    const down = change < 0 ? -change : 0;
    if (rsiGain === null || rsiLoss === null) {
      rsiFirst.push(change);
      if (rsiFirst.length === RSI_BARS) {
        rsiGain = rsiFirst.reduce((a, x) => a + (x > 0 ? x : 0), 0) / RSI_BARS;
        rsiLoss = rsiFirst.reduce((a, x) => a + (x < 0 ? -x : 0), 0) / RSI_BARS;
      }
    } else {
      rsiGain = (rsiGain * (RSI_BARS - 1) + up) / RSI_BARS;
      rsiLoss = (rsiLoss * (RSI_BARS - 1) + down) / RSI_BARS;
    }
  }
  prevClose = close;
  closes.push(close);
  if (rsiGain === null || rsiLoss === null) return null;
  const moved = rsiGain + rsiLoss;
  return moved === 0 ? 50 : (100 * rsiGain) / moved;
}

function retBps(barsBack: number): number | null {
  if (closes.length <= barsBack) return null;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - barsBack];
  return ((now - then) * 10000) / then;
}

await runBars({
  onBatch(state: BarsState, batch: { bars: Bar[]; fills: { symbol: string; status: string; side: string; price: string; qty: string }[] }) {
    if (state.warmingUp) return [];
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = Number(bar.c);
    const rsi = pushClose(close);

    // Fold in this batch's fills so the entry price is the price the
    // market actually gave us, not the close it was decided on.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYMBOL || fill.status !== 'filled') continue;
      if (fill.side === 'buy') {
        const price = Number(fill.price);
        const qty = BigInt(fill.qty);
        if (entryQty === 0n) {
          entryPrice = price;
        } else {
          entryPrice = Number(
            (BigInt(Math.round(entryPrice!)) * entryQty + BigInt(price) * qty) /
              (entryQty + qty),
          );
        }
        entryQty += qty;
        tradesDone += 1;
        if (peakClose === null) peakClose = close;
      } else if (fill.side === 'sell') {
        entryQty -= BigInt(fill.qty);
        if (entryQty <= 0n) {
          entryQty = 0n;
          entryPrice = null;
          peakClose = null;
        }
      }
    }

    const held = state.positions.get(SYMBOL);
    const heldQty = held === undefined ? 0n : held.qty;

    if (heldQty > 0n && entryPrice !== null) {
      if (peakClose === null || close > peakClose) peakClose = close;
      const pnlBps = ((close - entryPrice) * 10000) / entryPrice;
      const peakDropBps = peakClose === null ? 0 : ((peakClose - close) * 10000) / peakClose;
      const holdBars = state.seq - entrySeq;
      const sell =
        pnlBps >= TAKE_PROFIT_BPS ||
        pnlBps <= STOP_LOSS_BPS ||
        holdBars >= MAX_HOLD_BARS ||
        (pnlBps > TRAIL_PROFIT_BPS && peakDropBps >= TRAIL_DROP_BPS) ||
        (rsi !== null && rsi >= RSI_EXIT_MIN);
      if (sell) {
        lastExitSeq = state.seq;
        const sellOrder: SellInput = { side: 'sell', symbol: SYMBOL, qty: heldQty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sellOrder];
      }
      return [];
    }

    // Flat: look for a capitulation bounce.
    if (heldQty > 0n) return [];
    if (closes.length <= 30) return [];
    if (state.seq - lastExitSeq < COOLDOWN_BARS) return [];
    const ret30 = retBps(30);
    const ret15 = retBps(15);
    const ret1 = retBps(1);
    if (ret30 === null || ret15 === null || ret1 === null || rsi === null) return [];
    const deep = ret30 <= DEEP_DROP_30M_BPS && ret1 >= 0 && rsi <= RSI_ENTRY_MAX;
    const fallback1 =
      tradesDone === 0 &&
      state.seq >= FALLBACK1_BAR &&
      ret30 <= FALLBACK_DROP_30M_BPS &&
      ret15 <= -80 &&
      ret1 >= 0 &&
      rsi <= RSI_ENTRY_MAX;
    const fallback2 =
      tradesDone === 0 &&
      state.seq >= FALLBACK2_BAR &&
      ret15 <= FALLBACK_DROP_15M_BPS &&
      ret1 >= 0 &&
      rsi <= RSI_FALLBACK2_MAX;
    if (!deep && !fallback1 && !fallback2) return [];
    const cash = state.cash;
    if (cash < 1000000n) return [];
    entrySeq = state.seq;
    peakClose = close;
    const buyOrder: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
    return [buyOrder];
  },
});
