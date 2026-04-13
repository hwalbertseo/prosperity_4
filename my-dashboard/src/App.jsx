import React, { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import Papa from "papaparse";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
} from "recharts";
import { Upload, BarChart3, Filter, Database, Eye, EyeOff } from "lucide-react";

function parseCsvText(text) {
  const parsed = Papa.parse(text, {
    header: true,
    dynamicTyping: true,
    delimiter: ";",
    skipEmptyLines: true,
  });

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.code !== "UndetectableDelimiter");
    if (fatal) throw new Error(fatal.message);
  }

  return parsed.data.map((row) => {
    const clean = {};
    for (const [key, value] of Object.entries(row)) {
      clean[key] = value === "" ? null : value;
    }
    return clean;
  });
}

function detectFileType(rows) {
  if (!rows?.length) return "unknown";
  const keys = new Set(Object.keys(rows[0]));
  if (keys.has("product") && keys.has("mid_price") && keys.has("bid_price_1")) return "prices";
  if (keys.has("symbol") && keys.has("price") && keys.has("quantity")) return "trades";
  return "unknown";
}

function mean(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return 0;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function nearestRow(rows, timestamp) {
  if (!rows?.length) return null;
  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((rows[mid].timestamp ?? 0) < timestamp) lo = mid + 1;
    else hi = mid;
  }
  const a = rows[lo];
  const b = rows[Math.max(0, lo - 1)];
  if (!b) return a;
  return Math.abs((a?.timestamp ?? 0) - timestamp) < Math.abs((b?.timestamp ?? 0) - timestamp) ? a : b;
}

function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function StatCard({ label, value, subvalue }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm">
      <div className="text-xs uppercase tracking-[0.16em] text-white/50">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {subvalue ? <div className="mt-1 text-sm text-white/55">{subvalue}</div> : null}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
        checked
          ? "border-white/20 bg-white/12 text-white"
          : "border-white/10 bg-black/20 text-white/55"
      }`}
    >
      {checked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      {label}
    </button>
  );
}

function SnapshotBook({ row, normalizeMode }) {
  const ref = normalizeMode === "mid_price" ? row?.mid_price ?? 0 : 0;
  const priceOrDash = (v) => (v == null ? "—" : formatNumber(v - ref, 2));
  const volOrDash = (v) => (v == null ? "—" : formatNumber(v));

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 text-sm font-medium text-white/80">Order Book Snapshot</div>
      <div className="mb-3 text-xs text-white/45">
        Timestamp {row ? formatNumber(row.timestamp) : "—"}
        {normalizeMode === "mid_price" ? " · normalized by current mid" : ""}
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="mb-2 text-xs uppercase tracking-widest text-sky-300/70">Bids</div>
          {[1, 2, 3].map((level) => (
            <div key={`b${level}`} className="mb-2 flex items-center justify-between rounded-xl bg-sky-400/10 px-3 py-2">
              <span className="text-white/65">L{level}</span>
              <span className="font-medium text-sky-200">{priceOrDash(row?.[`bid_price_${level}`])}</span>
              <span className="text-white/65">{volOrDash(row?.[`bid_volume_${level}`])}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-2 text-xs uppercase tracking-widest text-rose-300/70">Asks</div>
          {[1, 2, 3].map((level) => (
            <div key={`a${level}`} className="mb-2 flex items-center justify-between rounded-xl bg-rose-400/10 px-3 py-2">
              <span className="text-white/65">L{level}</span>
              <span className="font-medium text-rose-200">{priceOrDash(row?.[`ask_price_${level}`])}</span>
              <span className="text-white/65">{volOrDash(row?.[`ask_volume_${level}`])}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TradesTable({ rows }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 text-sm font-medium text-white/80">Nearby Trades</div>
      <div className="max-h-[320px] overflow-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-900/95 text-white/60">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Buyer</th>
              <th className="px-3 py-2 font-medium">Seller</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, idx) => (
                <tr key={`${row.timestamp}-${row.price}-${idx}`} className="border-t border-white/5 text-white/82">
                  <td className="px-3 py-2">{formatNumber(row.timestamp)}</td>
                  <td className="px-3 py-2">{formatNumber(row.displayPrice ?? row.price, 2)}</td>
                  <td className="px-3 py-2">{formatNumber(row.quantity)}</td>
                  <td className="px-3 py-2">{row.buyer || "—"}</td>
                  <td className="px-3 py-2">{row.seller || "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-8 text-white/45" colSpan={5}>
                  No trades in the selected window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, normalizeMode }) {
  if (!active || !payload?.length) return null;

  const visible = payload
    .filter((entry) => entry?.value != null && !Number.isNaN(entry.value))
    .slice(0, 10);

  return (
    <div className="min-w-[220px] rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-white/50">Timestamp</div>
      <div className="mb-3 text-sm font-medium text-white">{formatNumber(label)}</div>
      {normalizeMode === "mid_price" ? (
        <div className="mb-3 text-xs text-white/45">Values shown relative to the current mid.</div>
      ) : null}
      <div className="space-y-1.5 text-sm">
        {visible.map((entry, idx) => (
          <div key={`${entry.name}-${idx}`} className="flex items-center justify-between gap-3">
            <span className="text-white/65">{entry.name}</span>
            <span className="font-medium text-white">{formatNumber(entry.value, 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProsperityDashboardStarter() {
  const [dataset, setDataset] = useState({ prices: [], trades: [] });
  const [selectedPriceFile, setSelectedPriceFile] = useState("");
  const [selectedTradeFile, setSelectedTradeFile] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [normalizeMode, setNormalizeMode] = useState("none");

  const [showBidLevels, setShowBidLevels] = useState(true);
  const [showAskLevels, setShowAskLevels] = useState(true);
  const [showTrades, setShowTrades] = useState(true);

  const [hoveredTimestamp, setHoveredTimestamp] = useState(null);
  const [activeTimeView, setActiveTimeView] = useState(null);

  const [draftFilters, setDraftFilters] = useState({
    maxPoints: "2500",
    tradeMinQty: "0",
    tradeMaxQty: "9999",
  });

  const [appliedFilters, setAppliedFilters] = useState({
    maxPoints: 2500,
    tradeMinQty: 0,
    tradeMaxQty: 9999,
  });

  const [viewTimestampInput, setViewTimestampInput] = useState("");
  const [viewWindowInput, setViewWindowInput] = useState("20000");

  const inputRef = useRef(null);

  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  function applyFilterSettings() {
    const next = {
      maxPoints: clamp(draftFilters.maxPoints, 200, 10000, 2500),
      tradeMinQty: clamp(draftFilters.tradeMinQty, 0, 1_000_000, 0),
      tradeMaxQty: clamp(draftFilters.tradeMaxQty, 0, 1_000_000, 9999),
    };

    if (next.tradeMaxQty < next.tradeMinQty) {
      next.tradeMaxQty = next.tradeMinQty;
    }

    setAppliedFilters(next);
    setDraftFilters({
      maxPoints: String(next.maxPoints),
      tradeMinQty: String(next.tradeMinQty),
      tradeMaxQty: String(next.tradeMaxQty),
    });
  }

  function applyTimeView() {
    const center = Number(viewTimestampInput);
    if (!Number.isFinite(center)) return;

    const halfWindow = clamp(viewWindowInput, 100, 1_000_000, 20000);

    setActiveTimeView({ center, halfWindow });
    setHoveredTimestamp(center);
    setViewWindowInput(String(halfWindow));
  }

  function resetTimeView() {
    setActiveTimeView(null);
    setViewTimestampInput("");
    setHoveredTimestamp(null);
  }

  async function ingestFiles(fileList) {
    const next = { prices: [], trades: [] };

    for (const file of Array.from(fileList)) {
      if (file.name.endsWith(".zip")) {
        const zip = await JSZip.loadAsync(file);
        const entries = Object.values(zip.files).filter((entry) => entry.name.endsWith(".csv"));

        for (const entry of entries) {
          const text = await entry.async("string");
          const rows = parseCsvText(text);
          const type = detectFileType(rows);

          if (type === "prices") next.prices.push({ name: entry.name.split("/").pop(), rows });
          if (type === "trades") next.trades.push({ name: entry.name.split("/").pop(), rows });
        }
      } else if (file.name.endsWith(".csv")) {
        const text = await file.text();
        const rows = parseCsvText(text);
        const type = detectFileType(rows);

        if (type === "prices") next.prices.push({ name: file.name, rows });
        if (type === "trades") next.trades.push({ name: file.name, rows });
      }
    }

    next.prices.sort((a, b) => a.name.localeCompare(b.name));
    next.trades.sort((a, b) => a.name.localeCompare(b.name));

    setDataset(next);
    setSelectedPriceFile(next.prices[0]?.name ?? "");
    setSelectedTradeFile(next.trades[0]?.name ?? "");
    setActiveTimeView(null);
    setViewTimestampInput("");
    setHoveredTimestamp(null);
  }

  useEffect(() => {
    setSelectedProduct("");
    setHoveredTimestamp(null);
    setActiveTimeView(null);
    setViewTimestampInput("");
  }, [selectedPriceFile]);

  const activePriceFile = useMemo(
    () => dataset.prices.find((f) => f.name === selectedPriceFile) ?? dataset.prices[0] ?? null,
    [dataset.prices, selectedPriceFile]
  );

  const activeTradeFile = useMemo(
    () => dataset.trades.find((f) => f.name === selectedTradeFile) ?? dataset.trades[0] ?? null,
    [dataset.trades, selectedTradeFile]
  );

  const products = useMemo(() => {
    const rows = activePriceFile?.rows ?? [];
    return [...new Set(rows.map((r) => r.product).filter(Boolean))].sort();
  }, [activePriceFile]);

  useEffect(() => {
    if (!selectedProduct && products.length) setSelectedProduct(products[0]);
    if (selectedProduct && !products.includes(selectedProduct)) setSelectedProduct(products[0] ?? "");
  }, [products, selectedProduct]);

  const productRows = useMemo(() => {
    const rows = (activePriceFile?.rows ?? []).filter((r) => r.product === selectedProduct);
    return rows.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  }, [activePriceFile, selectedProduct]);

  const visiblePriceRows = useMemo(() => {
    if (!activeTimeView) return productRows;

    const start = activeTimeView.center - activeTimeView.halfWindow;
    const end = activeTimeView.center + activeTimeView.halfWindow;

    return productRows.filter((r) => {
      const ts = r.timestamp ?? 0;
      return ts >= start && ts <= end;
    });
  }, [productRows, activeTimeView]);

  const productTrades = useMemo(() => {
    let rows = (activeTradeFile?.rows ?? [])
      .filter((r) => r.symbol === selectedProduct)
      .filter(
        (r) =>
          (r.quantity ?? 0) >= appliedFilters.tradeMinQty &&
          (r.quantity ?? 0) <= appliedFilters.tradeMaxQty
      )
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

    if (activeTimeView) {
      const start = activeTimeView.center - activeTimeView.halfWindow;
      const end = activeTimeView.center + activeTimeView.halfWindow;
      rows = rows.filter((r) => {
        const ts = r.timestamp ?? 0;
        return ts >= start && ts <= end;
      });
    }

    return rows;
  }, [activeTradeFile, selectedProduct, appliedFilters, activeTimeView]);

  const sampledRows = useMemo(() => {
    if (!visiblePriceRows.length) return [];
    const step = Math.max(1, Math.ceil(visiblePriceRows.length / appliedFilters.maxPoints));
    return visiblePriceRows.filter((_, idx) => idx % step === 0 || idx === visiblePriceRows.length - 1);
  }, [visiblePriceRows, appliedFilters.maxPoints]);

  const baseline = useMemo(() => {
    if (!sampledRows.length) return 0;
    return sampledRows[0]?.mid_price ?? 0;
  }, [sampledRows]);

  const normalizeValue = (value, row) => {
    if (value == null) return null;
    if (normalizeMode === "mid_price") return value - (row?.mid_price ?? 0);
    if (normalizeMode === "first_mid") return value - baseline;
    return value;
  };

  const chartData = useMemo(() => {
    return sampledRows.map((row) => ({
      timestamp: row.timestamp,
      bid1: showBidLevels ? normalizeValue(row.bid_price_1, row) : null,
      bid2: showBidLevels ? normalizeValue(row.bid_price_2, row) : null,
      bid3: showBidLevels ? normalizeValue(row.bid_price_3, row) : null,
      ask1: showAskLevels ? normalizeValue(row.ask_price_1, row) : null,
      ask2: showAskLevels ? normalizeValue(row.ask_price_2, row) : null,
      ask3: showAskLevels ? normalizeValue(row.ask_price_3, row) : null,
      mid: normalizeValue(row.mid_price, row),
      profit_and_loss: row.profit_and_loss,
    }));
  }, [sampledRows, showBidLevels, showAskLevels, normalizeMode, baseline]);

  const tradeScatterData = useMemo(() => {
    if (!showTrades) return [];

    return productTrades.map((trade) => {
      const row = nearestRow(productRows, trade.timestamp);
      return {
        timestamp: trade.timestamp,
        price: normalizeValue(trade.price, row),
        quantity: trade.quantity,
        buyer: trade.buyer,
        seller: trade.seller,
      };
    });
  }, [productTrades, productRows, showTrades, normalizeMode, baseline]);

  const hoveredRow = useMemo(() => {
    const sourceRows = visiblePriceRows.length ? visiblePriceRows : productRows;
    if (!sourceRows.length) return null;

    const fallbackTs =
      sampledRows[sampledRows.length - 1]?.timestamp ??
      sourceRows[sourceRows.length - 1]?.timestamp ??
      null;

    const ts = hoveredTimestamp ?? fallbackTs;
    if (ts == null) return null;

    return nearestRow(sourceRows, ts);
  }, [visiblePriceRows, productRows, hoveredTimestamp, sampledRows]);

  const nearbyTrades = useMemo(() => {
    if (!productTrades.length || !hoveredRow) return [];

    const center = hoveredRow.timestamp ?? 0;
    const window = 5000;

    return productTrades
      .filter((t) => Math.abs((t.timestamp ?? 0) - center) <= window)
      .slice(0, 40)
      .map((trade) => {
        const row = nearestRow(productRows, trade.timestamp);
        return { ...trade, displayPrice: normalizeValue(trade.price, row) };
      });
  }, [productTrades, hoveredRow, productRows, normalizeMode, baseline]);

  const avgSpread = useMemo(() => {
    return mean(
      visiblePriceRows.map((r) =>
        r.ask_price_1 != null && r.bid_price_1 != null ? r.ask_price_1 - r.bid_price_1 : null
      )
    );
  }, [visiblePriceRows]);

  const visibleLastRow =
    visiblePriceRows[visiblePriceRows.length - 1] ??
    productRows[productRows.length - 1] ??
    null;

  const latestPnL = visibleLastRow?.profit_and_loss ?? null;
  const latestMid = visibleLastRow?.mid_price ?? null;
  const dayValue = productRows[0]?.day ?? null;

  const visibleRangeText = activeTimeView
    ? `${formatNumber(activeTimeView.center - activeTimeView.halfWindow)} → ${formatNumber(
        activeTimeView.center + activeTimeView.halfWindow
      )}`
    : "Full file";

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
              <BarChart3 className="h-3.5 w-3.5" />
              Prosperity dashboard starter
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Order book viewer for Prosperity CSVs</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Upload the tutorial ZIP or raw CSVs. This version lets you jump to a specific timestamp
              and only applies heavy filters when you press a button, so the screen stays calmer.
            </p>
          </div>

          <button
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium shadow-sm transition hover:bg-white/15"
          >
            <Upload className="h-4 w-4" />
            Upload ZIP or CSVs
          </button>

          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple
            accept=".zip,.csv"
            onChange={(e) => {
              if (e.target.files?.length) ingestFiles(e.target.files);
            }}
          />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
          <StatCard
            label="Selected product"
            value={selectedProduct || "—"}
            subvalue={dayValue != null ? `Day ${dayValue}` : "Upload data to begin"}
          />
          <StatCard
            label="Visible last mid"
            value={
              latestMid != null
                ? formatNumber(normalizeMode === "first_mid" ? latestMid - baseline : latestMid, 2)
                : "—"
            }
            subvalue={activeTimeView ? "From current time view" : "From full visible file"}
          />
          <StatCard
            label="Visible PnL"
            value={latestPnL != null ? formatNumber(latestPnL, 0) : "—"}
            subvalue="Based on the current chart window"
          />
          <StatCard
            label="Avg spread"
            value={formatNumber(avgSpread, 2)}
            subvalue={`${formatNumber(productTrades.length)} filtered trades`}
          />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white/80">
              <Database className="h-4 w-4" />
              Data selection
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="block text-sm">
                <div className="mb-2 text-white/55">Prices file</div>
                <select
                  value={selectedPriceFile}
                  onChange={(e) => setSelectedPriceFile(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white outline-none"
                >
                  {dataset.prices.length ? (
                    dataset.prices.map((file) => (
                      <option key={file.name} value={file.name}>
                        {file.name}
                      </option>
                    ))
                  ) : (
                    <option value="">No prices file</option>
                  )}
                </select>
              </label>

              <label className="block text-sm">
                <div className="mb-2 text-white/55">Trades file</div>
                <select
                  value={selectedTradeFile}
                  onChange={(e) => setSelectedTradeFile(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white outline-none"
                >
                  {dataset.trades.length ? (
                    dataset.trades.map((file) => (
                      <option key={file.name} value={file.name}>
                        {file.name}
                      </option>
                    ))
                  ) : (
                    <option value="">No trades file</option>
                  )}
                </select>
              </label>

              <label className="block text-sm">
                <div className="mb-2 text-white/55">Product</div>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white outline-none"
                >
                  {products.length ? (
                    products.map((product) => (
                      <option key={product} value={product}>
                        {product}
                      </option>
                    ))
                  ) : (
                    <option value="">No product</option>
                  )}
                </select>
              </label>

              <label className="block text-sm">
                <div className="mb-2 text-white/55">Normalization</div>
                <select
                  value={normalizeMode}
                  onChange={(e) => setNormalizeMode(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white outline-none"
                >
                  <option value="none">None</option>
                  <option value="mid_price">Current mid</option>
                  <option value="first_mid">First visible mid</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white/80">
              <Eye className="h-4 w-4" />
              Time view
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto_auto]">
              <label className="block text-sm">
                <div className="mb-2 text-white/55">Timestamp to view</div>
                <input
                  type="number"
                  value={viewTimestampInput}
                  onChange={(e) => setViewTimestampInput(e.target.value)}
                  placeholder="e.g. 350000"
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white outline-none"
                />
              </label>

              <label className="block text-sm">
                <div className="mb-2 text-white/55">Half-window around it</div>
                <input
                  type="number"
                  value={viewWindowInput}
                  onChange={(e) => setViewWindowInput(e.target.value)}
                  placeholder="e.g. 20000"
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white outline-none"
                />
              </label>

              <button
                onClick={applyTimeView}
                className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/15"
              >
                Go to time
              </button>

              <button
                onClick={resetTimeView}
                className="mt-6 rounded-2xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-slate-800"
              >
                Reset view
              </button>
            </div>

            <div className="mt-3 text-xs text-white/45">
              Current visible range: {visibleRangeText}
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white/80">
            <Filter className="h-4 w-4" />
            Visibility and filtering
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Toggle checked={showBidLevels} onChange={setShowBidLevels} label="Bid levels" />
            <Toggle checked={showAskLevels} onChange={setShowAskLevels} label="Ask levels" />
            <Toggle checked={showTrades} onChange={setShowTrades} label="Trades" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="block text-sm">
              <div className="mb-2 text-white/55">Max plotted points</div>
              <input
                type="number"
                min={200}
                max={10000}
                step={100}
                value={draftFilters.maxPoints}
                onChange={(e) =>
                  setDraftFilters((prev) => ({ ...prev, maxPoints: e.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white outline-none"
              />
            </label>

            <label className="block text-sm">
              <div className="mb-2 text-white/55">Trade min qty</div>
              <input
                type="number"
                min={0}
                value={draftFilters.tradeMinQty}
                onChange={(e) =>
                  setDraftFilters((prev) => ({ ...prev, tradeMinQty: e.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white outline-none"
              />
            </label>

            <label className="block text-sm">
              <div className="mb-2 text-white/55">Trade max qty</div>
              <input
                type="number"
                min={0}
                value={draftFilters.tradeMaxQty}
                onChange={(e) =>
                  setDraftFilters((prev) => ({ ...prev, tradeMaxQty: e.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white outline-none"
              />
            </label>

            <button
              onClick={applyFilterSettings}
              className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/15"
            >
              Apply filters
            </button>
          </div>

          <div className="mt-3 text-xs text-white/45">
            These numeric filters do not update the chart until you press Apply filters.
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium text-white/85">Main chart</div>
              <div className="text-xs text-white/45">
                Hover to inspect a timestamp. Focusing on one time window should make the order book much easier to read.
              </div>
            </div>
            <div className="text-xs text-white/45">
              Visible price rows: {formatNumber(visiblePriceRows.length)} · plotted: {formatNumber(sampledRows.length)}
            </div>
          </div>

          <div className="h-[500px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                onMouseMove={(state) => {
                  if (state?.activeLabel != null) setHoveredTimestamp(state.activeLabel);
                }}
                margin={{ top: 12, right: 24, bottom: 24, left: 12 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  type="number"
                  dataKey="timestamp"
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => formatNumber(v)}
                />
                <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} domain={["auto", "auto"]} />
                <Tooltip content={<CustomTooltip normalizeMode={normalizeMode} />} />

                {showBidLevels ? (
                  <>
                    <Line type="monotone" dataKey="bid1" stroke="rgba(56,189,248,0.95)" strokeWidth={2.1} dot={false} isAnimationActive={false} name="Bid 1" />
                    <Line type="monotone" dataKey="bid2" stroke="rgba(56,189,248,0.55)" strokeWidth={1.3} dot={false} isAnimationActive={false} name="Bid 2" />
                    <Line type="monotone" dataKey="bid3" stroke="rgba(56,189,248,0.35)" strokeWidth={1.1} dot={false} isAnimationActive={false} name="Bid 3" />
                  </>
                ) : null}

                {showAskLevels ? (
                  <>
                    <Line type="monotone" dataKey="ask1" stroke="rgba(251,113,133,0.95)" strokeWidth={2.1} dot={false} isAnimationActive={false} name="Ask 1" />
                    <Line type="monotone" dataKey="ask2" stroke="rgba(251,113,133,0.55)" strokeWidth={1.3} dot={false} isAnimationActive={false} name="Ask 2" />
                    <Line type="monotone" dataKey="ask3" stroke="rgba(251,113,133,0.35)" strokeWidth={1.1} dot={false} isAnimationActive={false} name="Ask 3" />
                  </>
                ) : null}

                <Line type="monotone" dataKey="mid" stroke="rgba(255,255,255,0.7)" strokeWidth={1.4} dot={false} isAnimationActive={false} name="Mid" />

                {showTrades ? (
                  <Scatter
                    data={tradeScatterData}
                    dataKey="price"
                    fill="rgba(245, 158, 11, 0.95)"
                    isAnimationActive={false}
                    name="Trades"
                    shape="cross"
                  />
                ) : null}

                <Brush dataKey="timestamp" height={24} travellerWidth={10} stroke="rgba(255,255,255,0.2)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <SnapshotBook row={hoveredRow} normalizeMode={normalizeMode} />
          <TradesTable rows={nearbyTrades} />
        </div>

        <div className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100/90">
          Tip: enter a timestamp, press Go to time, then adjust quantity filters and press Apply filters. That workflow is much less noisy than redrawing the full day on every keystroke.
        </div>
      </div>
    </div>
  );
}
