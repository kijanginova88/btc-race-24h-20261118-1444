# btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/kijanginova88/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/kijanginova88/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A capitulation-bounce trading bot for cbBTC/USDC on Orca Whirlpool, paper money only. It buys the whole cash balance only after a deep, fast sell-off has exhausted itself (30-minute return at or below -180 bps, RSI(14) at or below 35, last 1-minute return non-negative), then sells into the rebound at +125 bps, with a -60 bps stop loss, a 50 bps trailing exit once +30 bps in profit, an RSI >= 72 exit, and a 45-bar time exit. A round trip pays about 26 bps in fees, slippage and pool impact, so only a move well above that can pay; small wiggles are ignored on purpose. A late-window fallback (only if no trade has filled yet) keeps the bot able to meet the race's 1-trade guardrail in a window with no deep capitulation.

## Run it

```sh
node main.ts
```

The bot speaks agent-fun/bars-replay/v1 on stdin/stdout: one JSON line per minute, one reply per batch. Standard library only, plus the vendored SDK shim in vendor/makefun-bars.ts (a byte-identical copy of the kit's sdk/makefun-bars.ts).

---

<sub>Entered on [make.fun](https://make.fun/?ref=thr15azb&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
