import { CHART_THEME as theme } from './chart-theme.js';
import { WORKSPACE_DEFAULTS, heikinAshi, priceScale, createDrawingHistory, hitDrawing, drawDrawingLayer } from './chart-workspace.js';
import {
  DEFAULT_INDICATORS,
  INDICATOR_DEFINITIONS,
  calculateIndicators,
  indicatorLayout,
} from "./indicators.js";
import {
  drawIndicatorPanes,
  drawPriceIndicators,
} from "./indicator-renderer.js";
import "../chart-utils.js";
const { priceTicks, timeStep, seekIndex, zonedTime, chartWindow, zoomWindow } =
  globalThis.ChartUtils;

export function createChartController(chart, initialOptions = {}) {
  const ctx = chart.getContext("2d");
  const fontFamily = getComputedStyle(chart).fontFamily;
  let options = { ...WORKSPACE_DEFAULTS, ...initialOptions };
  const drawingHistory = createDrawingHistory();
  let selectedDrawing = -1;
  const state = {
    candles: [],
    index: 0,
    rangeStart: 0,
    positions: [],
    visibleCount: 120,
    viewOffset: 0,
    hoverIndex: null,
    priceScale: 1,
    manualPrice: null,
    indicators: true,
    drawings: drawingHistory.items,
    tool: "cursor",
    draft: null,
    chartMeta: null,
  };
  let barCache = {},
    indicatorCache = {};
  let heikinCache = {};
  let autoPriceViewport = null;
  const cleanup = [];
  function listen(type, handler, config) {
    chart.addEventListener(type, handler, config);
    cleanup.push(() => chart.removeEventListener(type, handler, config));
  }
  function chartBars() {
    if (
      barCache.candles === state.candles &&
      barCache.index === state.index &&
      barCache.timeframe === options.timeframe
    )
      return barCache.bars;
    const size = Number(options.timeframe || 1),
      bars = [];
    if (size === 1) {
      barCache = { candles: state.candles, index: state.index, timeframe: options.timeframe, bars: state.candles.slice(0, state.index + 1) };
      return barCache.bars;
    }
    for (const candle of state.candles.slice(0, state.index + 1)) {
      const minute = Math.floor(candle.minute / size) * size;
      let bar = bars[bars.length - 1];
      if (!bar || bar.minute !== minute) {
        bars.push({ ...candle, minute, endMinute: candle.minute });
      } else {
        bar.high = Math.max(bar.high, candle.high);
        bar.low = Math.min(bar.low, candle.low);
        bar.close = candle.close;
        bar.volume += candle.volume;
        bar.endMinute = candle.minute;
      }
    }
    barCache = {
      candles: state.candles,
      index: state.index,
      timeframe: options.timeframe,
      bars,
    };
    return bars;
  }

  function notifyDrawings() {
    state.drawings = drawingHistory.items;
    options.onDrawingsChange?.({ items: state.drawings, selected: selectedDrawing, canUndo: drawingHistory.canUndo, canRedo: drawingHistory.canRedo });
  }
  function changeDrawings(items, selection = -1) {
    drawingHistory.change(items); selectedDrawing = selection; notifyDrawings(); draw();
  }
  function undoDrawing() { drawingHistory.undo(); selectedDrawing = -1; notifyDrawings(); draw(); }
  function redoDrawing() { drawingHistory.redo(); selectedDrawing = -1; notifyDrawings(); draw(); }
  function deleteDrawing(index = selectedDrawing) {
    if (options.drawingsLocked) return;
    if (index < 0) index = state.drawings.length - 1;
    changeDrawings(state.drawings.filter((_, i) => i !== index));
  }
  function finishDrawing(item) {
    changeDrawings([...state.drawings, item], state.drawings.length);
    state.draft = null;
    if (!options.stayInDrawingMode) selectTool('cursor');
    else draw();
  }

  function fmt(n, d = 2) {
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  }
  function current() {
    return state.candles[state.index];
  }
  function timestampFor(i) {
    const date = zonedTime(state.rangeStart + i * 60000, options.timeZone);
    return `${date.value.replace("T", " ")} ${date.name}`;
  }
  function draw() {
    const w = chart.clientWidth,
      h = chart.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = theme.background; ctx.fillRect(0, 0, w, h);
    chart.dataset.visibleBars = String(state.visibleCount);
    if (!state.candles.length) return;
    const bars = chartBars();
    if (options.chartType === 'heikin' && heikinCache.source !== bars) heikinCache = { source: bars, bars: heikinAshi(bars) };
    const displayedBars = options.chartType === 'heikin' ? heikinCache.bars : bars,
      view = chartWindow(bars.length, state.visibleCount, state.viewOffset);
    state.viewOffset = view.offset;
    const { start, end } = view,
      count = end - start + 1,
      data = displayedBars.slice(start, end + 1);
    if (!data.length) return;
    const config = options.indicatorConfig || DEFAULT_INDICATORS;
    const configKey = JSON.stringify(config);
    // Indicator calculations are causal. Cache the 1m archive once and render
    // only the replay prefix, keeping future candles and values off the chart.
    const indicatorSource = Number(options.timeframe) === 1 ? state.candles : bars;
    if (indicatorCache.bars !== indicatorSource || indicatorCache.key !== configKey)
      indicatorCache = {
        bars: indicatorSource,
        key: configKey,
        data: calculateIndicators(indicatorSource, config),
      };
    const indicators = state.indicators ? indicatorCache.data : {};
    let layout = indicatorLayout(
      h,
      config,
      options.paneHeights,
      state.indicators,
      options.paneOrder,
    );
    const maximized =
      state.indicators &&
      layout.panes.find((pane) => pane.key === options.maximizedPane);
    if (maximized)
      layout = {
        bottom: 30,
        minimum: 40,
        budget: h - 84,
        panes: [
          {
            ...maximized,
            top: 30,
            bottom: h - 54,
            divider: 30,
            height: h - 84,
          },
        ],
        [maximized.key]: h - 84,
      };
    const header = (key) => {
      const definition = INDICATOR_DEFINITIONS[key],
        settings = config[key];
      const series =
        key === "macd" || key === "adx"
          ? indicators[key]?.line
          : key === "bb"
            ? indicators.bb?.basis
            : key === "supertrend"
              ? indicators.supertrend?.line
              : indicators[key];
      const value = series?.[state.hoverIndex ?? bars.length - 1];
      return {
        key,
        name: definition.name,
        parameters: Object.keys(definition.fields)
          .map((field) => settings[field])
          .join(" "),
        value:
          settings.showValue && !settings.hidden
            ? Number.isFinite(value)
              ? value.toFixed(4)
              : "Warming up"
            : "",
        hidden: settings.hidden,
      };
    };
    layout.panes = layout.panes.map((pane) => ({
      ...pane,
      ...header(pane.key),
    }));
    layout.overlays =
      state.indicators && !maximized
        ? Object.keys(INDICATOR_DEFINITIONS)
            .filter(
              (key) => !INDICATOR_DEFINITIONS[key].pane && config[key].enabled,
            )
            .map(header)
        : [];
    layout.maximized = maximized?.key || null;
    const top = 30 + layout.overlays.length * 24,
      bottom = layout.bottom,
      left = 12,
      right = w - 78;
    const volumeTop = bottom - 42,
      volumeBottom = bottom,
      macdBottom = h - 54;
    options.onPaneLayout?.(layout);
    const overlayPrices = [
      !config.bb.hidden && indicators.bb?.upper,
      !config.bb.hidden && indicators.bb?.lower,
      !config.supertrend.hidden && indicators.supertrend?.line,
    ]
      .filter(Boolean)
      .flatMap((series) =>
        series.slice(start, end + 1).filter(Number.isFinite),
      );
    const rawMax = Math.max(...data.map((c) => c.high), ...overlayPrices),
      rawMin = Math.min(...data.map((c) => c.low), ...overlayPrices);
    const baseRange = rawMax - rawMin || Math.max(rawMax * 0.001, 0.01),
      center = (rawMax + rawMin) / 2;
    // Fit the visible candles and overlays as the viewport moves. Hover alone
    // leaves these bounds unchanged; explicit price-axis scaling overrides Auto.
    const priceViewportKey = JSON.stringify([options.timeframe, options.chartType, configKey, rawMax, rawMin, state.priceScale]);
    if (!autoPriceViewport || autoPriceViewport.key !== priceViewportKey) {
      const padding = (baseRange * 1.12) / state.priceScale / 2;
      autoPriceViewport = { key: priceViewportKey, min: center - padding, max: center + padding };
    }
    const priceViewport = state.manualPrice || autoPriceViewport;
    const min = priceViewport.min, max = priceViewport.max, range = max - min;
    const { y, priceAtY } = priceScale(min, max, top, bottom, options.scaleMode);
    const priceLabel = price => options.scaleMode === 'percent' ? `${((price / data[0].close - 1) * 100).toFixed(2)}%` : fmt(price);
    const step = (right - left) / state.visibleCount;
    const xFor = (i) => left + (start + i - view.first + 0.5) * step;
    state.chartMeta = {
      bars,
      start,
      end,
      hoverIndex: state.hoverIndex,
      windowHeaders: true,
      top,
      bottom,
      left,
      right,
      min,
      max,
      range,
      step,
      first: view.first,
      y,
      priceAtY,
      showGrid: options.showGrid,
      xFor,
    };
    options.onView?.({
      offset: state.viewOffset,
      visibleCount: state.visibleCount,
      autoScale: !state.manualPrice,
    });
    if (view.first < Math.max(120, state.visibleCount)) options.onNeedEarlier?.();
    const quote =
      state.hoverIndex === null
        ? bars.at(-1)
        : bars[state.hoverIndex] || bars.at(-1);
    options.onHover?.(quote);
    ctx.font = `12px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.setLineDash([2, 4]);
    if (!maximized)
      for (const tick of priceTicks(
        min,
        max,
        bottom - top,
        Number(options.priceGrid || 0),
      )) {
        const yy = y(tick.price);
        ctx.strokeStyle = theme.grid;
        ctx.beginPath();
        ctx.moveTo(left, yy);
        ctx.lineTo(right, yy);
        if (options.showGrid) ctx.stroke();
        if (tick.label) {
          ctx.fillStyle = theme.text;
          ctx.fillText(priceLabel(tick.price), right + 8, yy + 4);
        }
      }
    const gridMinutes = timeStep(
      Number(options.timeframe),
      step,
      Number(options.timeGrid || 0),
    );
    let previousBucket = null,
      lastGridX = -Infinity,
      lastLabelX = -Infinity;
    ctx.font = `11px ${fontFamily}`;
    data.forEach((bar, i) => {
      const timestamp = state.rangeStart + bar.minute * 60000;
      const local = zonedTime(timestamp, options.timeZone);
      const bucket = Math.floor(local.wallTimestamp / (gridMinutes * 60000));
      if (bucket === previousBucket) return;
      previousBucket = bucket;
      if (
        i === 0 &&
        local.wallTimestamp % (gridMinutes * 60000) !== 0 &&
        data.length > 1
      )
        return;
      const x = xFor(i);
      if (x - lastGridX < 6) return;
      lastGridX = x;
      ctx.strokeStyle = theme.grid;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, macdBottom);
      if (options.showGrid) ctx.stroke();
      const labelX = Math.max(left + 35, Math.min(right - 35, x));
      if (labelX - lastLabelX < 76) return;
      lastLabelX = labelX;
      const date = local.value;
      ctx.textAlign = "center";
      ctx.fillStyle = theme.text;
      ctx.fillText(date.slice(11, 16), labelX, h - 32);
      ctx.fillStyle = theme.text;
      ctx.fillText(date.slice(5, 10), labelX, h - 16);
      ctx.textAlign = "left";
    });
    ctx.fillStyle = theme.text;
    ctx.fillText(
      zonedTime(data[data.length - 1].timestamp, options.timeZone).name,
      right + 4,
      h - 16,
    );
    ctx.setLineDash([]);
    if (!maximized) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, right - left, bottom - top);
      ctx.clip();
      const maxVolume = Math.max(1, ...data.map(c => c.volume));
      if (options.chartType === 'line' || options.chartType === 'area') {
        ctx.beginPath();
        data.forEach((c, i) => { if (i) ctx.lineTo(xFor(i), y(c.close)); else ctx.moveTo(xFor(i), y(c.close)); });
        ctx.strokeStyle = theme.accent; ctx.lineWidth = 2; ctx.stroke();
        if (options.chartType === 'area') {
          ctx.lineTo(xFor(data.length - 1), bottom); ctx.lineTo(xFor(0), bottom); ctx.closePath();
          const gradient = ctx.createLinearGradient(0, top, 0, bottom);
          gradient.addColorStop(0, '#2962ff55'); gradient.addColorStop(1, '#2962ff00');
          ctx.fillStyle = gradient; ctx.fill();
        }
      }
      data.forEach((c, i) => {
        const x = xFor(i), up = c.close >= c.open, col = up ? theme.bullish : theme.bearish;
        const bw = Math.max(1, step * .62), yt = y(Math.max(c.open, c.close)), bh = Math.max(1, Math.abs(y(c.open) - y(c.close)));
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
        if (!['line', 'area'].includes(options.chartType)) {
          ctx.beginPath(); ctx.moveTo(x, y(c.high)); ctx.lineTo(x, y(c.low));
          if (options.chartType === 'bars') {
            ctx.moveTo(x - bw / 2, y(c.open)); ctx.lineTo(x, y(c.open));
            ctx.moveTo(x, y(c.close)); ctx.lineTo(x + bw / 2, y(c.close)); ctx.stroke();
          } else {
            ctx.stroke();
            if (options.chartType === 'hollow' && up) { ctx.fillStyle = theme.background; ctx.fillRect(x - bw / 2, yt, bw, bh); ctx.strokeRect(x - bw / 2, yt, bw, bh); }
            else ctx.fillRect(x - bw / 2, yt, bw, bh);
          }
        }
        if (options.showVolume) {
          const vh = (c.volume / maxVolume) * (volumeBottom - volumeTop);
          ctx.fillStyle = col; ctx.globalAlpha = .27; ctx.fillRect(x - bw / 2, volumeBottom - vh, bw, vh); ctx.globalAlpha = 1;
        }
      });
      ctx.restore();
      drawPriceIndicators(ctx, indicators, config, state.chartMeta, fontFamily);
    }
    if (state.indicators)
      drawIndicatorPanes(
        ctx,
        indicators,
        config,
        layout,
        state.chartMeta,
        fontFamily,
      );
    if (!maximized) {
      const last = bars.at(-1),
        ly = y(last.close);
      if (options.showLastPrice && ly >= top && ly <= bottom) {
        ctx.strokeStyle = last.close >= last.open ? theme.bullish : theme.bearish;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(left, ly);
        ctx.lineTo(right, ly);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = last.close >= last.open ? theme.bullish : theme.bearish;
        ctx.fillRect(right, ly - 11, 76, 22);
        ctx.fillStyle = theme.white;
        ctx.font = `bold 12px ${fontFamily}`;
        ctx.fillText(priceLabel(last.close), right + 5, ly + 4);
      }
      state.positions.forEach((p) => {
        const ey = y(p.entry);
        if (ey >= top && ey <= bottom) {
          ctx.strokeStyle = p.side === "LONG" ? theme.bullish : theme.bearish;
          ctx.setLineDash([7, 4]);
          ctx.beginPath();
          ctx.moveTo(left, ey);
          ctx.lineTo(right, ey);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fillText(`#${p.id} ${p.side} ${fmt(p.entry)}`, left + 5, ey - 5);
        }
      });

      drawProtectionLines();
      if (options.showExecutions) drawExecutions();
      drawAnnotations();
    }
    if (
      state.hoverIndex !== null &&
      state.hoverIndex >= start &&
      state.hoverIndex <= end
    ) {
      const x = xFor(state.hoverIndex - start),
        hc = bars[state.hoverIndex];
      const hy = Math.max(
        top,
        Math.min(
          maximized ? macdBottom : bottom,
          state.crosshairY ?? y(hc.close),
        ),
      );
      ctx.strokeStyle = theme.crosshair;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, macdBottom);
      ctx.moveTo(left, hy);
      ctx.lineTo(right, hy);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!maximized) {
        const pointerPrice = priceAtY(hy);
        ctx.fillStyle = theme.crosshairLabel;
        ctx.fillRect(right, hy - 11, 76, 22);
        ctx.fillStyle = theme.white;
        ctx.font = `12px ${fontFamily}`;
        ctx.fillText(priceLabel(pointerPrice), right + 5, hy + 4);
      }
      const label =
        timestampFor(hc.minute).slice(5, 16) +
        " " +
        zonedTime(state.rangeStart + hc.minute * 60000, options.timeZone).name;
      ctx.textAlign = "center";
      const width = Math.max(58, ctx.measureText(label).width + 16),
        labelX = Math.max(left + width / 2, Math.min(right - width / 2, x));
      ctx.fillStyle = theme.crosshairLabel;
      ctx.fillRect(labelX - width / 2, h - 47, width, 36);
      ctx.fillStyle = theme.white;
      ctx.fillText(label, labelX, h - 25);
      ctx.textAlign = "left";
    }
  }
  function zoom(delta, fraction = 0.5) {
    if (!state.chartMeta) return;
    const view = zoomWindow(
      state.chartMeta.bars.length,
      state.visibleCount,
      state.viewOffset,
      state.visibleCount + delta,
      fraction,
    );
    state.visibleCount = view.visibleCount;
    state.viewOffset = view.offset;
    state.hoverIndex = null;
    draw();
  }

  function priceZoom(factor, fraction = 0.5) {
    const m = state.chartMeta;
    if (!m) return;
    const anchor = m.max - fraction * m.range;
    const range = Math.max(0.00001, Math.min(1e8, m.range / factor));
    state.manualPrice = {
      min: anchor - (1 - fraction) * range,
      max: anchor + fraction * range,
    };
    draw();
  }

  function pointerPosition(event) {
    const rect = chart.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function candleAtPointer(event) {
    const m = state.chartMeta;
    if (!m) return null;
    const p = pointerPosition(event);
    state.crosshairY = p.y;
    const index = Math.floor(m.first + (p.x - m.left) / m.step);
    return p.x >= m.left && p.x <= m.right && index >= m.start && index <= m.end
      ? index
      : null;
  }

  function selectTool(tool) {
    state.tool = tool;
    state.draft = null;
    options.onToolChange?.(tool);
    chart.style.cursor =
      tool === "cursor"
        ? "crosshair"
        : tool === "zoom"
          ? "zoom-in"
          : "crosshair";
    draw();
  }

  function drawingPoint(event) {
    const m = state.chartMeta,
      p = pointerPosition(event);
    const index = Math.max(
      0,
      Math.min(
        m.bars.length - 1,
        Math.floor(m.first + (p.x - m.left) / m.step),
      ),
    );
    let price = m.priceAtY(p.y);
    if (options.magnet) {
      const bar = m.bars[index];
      price = [bar.open, bar.high, bar.low, bar.close].sort((a, b) => Math.abs(a - price) - Math.abs(b - price))[0];
    }
    return { minute: m.bars[index].minute, price };
  }

  function drawingClick(event) {
    if (state.tool === "zoom") {
      const m = state.chartMeta,
        p = pointerPosition(event);
      zoom(
        -Math.round(state.visibleCount * 0.3),
        (p.x - m.left) / (m.right - m.left),
      );
      selectTool("cursor");
      return;
    }
    if (options.drawingsLocked || options.drawingsHidden) return;
    const point = drawingPoint(event);
    if (state.tool === 'horizontal' || state.tool === 'vertical') {
      finishDrawing({ type: state.tool, a: point, color: options.drawingColor, width: options.drawingWidth });
    } else if (state.tool === "text") {
      options.onTextRequest?.(point, pointerPosition(event));
    } else if (!state.draft)
      state.draft = { type: state.tool, a: point, b: point, color: options.drawingColor, width: options.drawingWidth };
    else {
      state.draft.b = point;
      finishDrawing({ ...state.draft, b: point });
    }
    draw();
  }

  function drawProtectionLines() {
    const m = state.chartMeta;
    if (!m) return;
    ctx.save();
    ctx.font = `9px ${fontFamily}`;
    ctx.textAlign = "left";
    for (const p of state.positions) {
      for (const [label, price, color] of [
        ["TP", p.tp, theme.bullish],
        ["SL", p.sl, theme.bearish],
        ["TRAIL", p.trailingStop, "#d2b480"],
      ]) {
        if (!price) continue;
        const y = m.y(price);
        if (y < m.top || y > m.bottom) continue;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(m.left, y);
        ctx.lineTo(m.right, y);
        ctx.stroke();
        ctx.fillText(
          `#${p.id} ${label} ${price.toFixed(2)}`,
          m.left + 5,
          y - 5,
        );
      }
    }
    ctx.restore();
  }

  function drawExecutions() {
    const m = state.chartMeta;
    if (!m || !state.fills?.length) return;
    const timeframe = Number(options.timeframe);
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.left, m.top, m.right - m.left, m.bottom - m.top);
    ctx.clip();
    for (const fill of state.fills) {
      if (fill.timestamp > state.candles[state.index].timestamp) continue;
      const minute = Math.floor(fill.timestamp / 60000 / timeframe) * timeframe;
      const index = m.bars.findIndex((bar) => bar.minute === minute);
      if (index < m.start || index > m.end) continue;
      const x = m.left + (index - m.first + 0.5) * m.step;
      const buy = fill.side === "BUY";
      const y =
        m.y(buy ? m.bars[index].low : m.bars[index].high) + (buy ? 14 : -14);
      ctx.fillStyle = buy ? theme.bullish : theme.bearish;
      ctx.beginPath();
      ctx.moveTo(x, y + (buy ? -5 : 5));
      ctx.lineTo(x - 4, y + (buy ? 3 : -3));
      ctx.lineTo(x + 4, y + (buy ? 3 : -3));
      ctx.closePath();
      ctx.fill();
      ctx.font = `9px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.fillText(buy ? "B" : "S", x, y + (buy ? 15 : -8));
    }
    ctx.restore();
  }

  function drawAnnotations() {
    if (state.chartMeta) drawDrawingLayer(ctx, state.drawings, state.draft, selectedDrawing, state.chartMeta, options, fontFamily);
  }

  function initializeChartInteractions() {
    let gesture = null;
    const touches = new Map();
    listen('contextmenu', event => {
      event.preventDefault();
      const point = pointerPosition(event);
      if (state.chartMeta && !options.drawingsHidden) {
        selectedDrawing = hitDrawing(state.drawings, point, state.chartMeta, Number(options.timeframe))?.index ?? -1;
        notifyDrawings(); draw();
      }
      options.onContextMenu?.(point);
    });
    listen(
      "wheel",
      (event) => {
        if (!state.chartMeta) return;
        event.preventDefault();
        const p = pointerPosition(event),
          m = state.chartMeta;
        if (p.x > m.right && !options.maximizedPane)
          priceZoom(
            Math.exp(-event.deltaY * 0.002),
            Math.max(0, Math.min(1, (p.y - m.top) / (m.bottom - m.top))),
          );
        else if (
          event.shiftKey ||
          Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ) {
          state.viewOffset += (event.deltaX || event.deltaY) / m.step;
          draw();
        } else {
          const delta =
            event.deltaY *
            (event.deltaMode === 1
              ? 16
              : event.deltaMode === 2
                ? chart.clientHeight
                : 1);
          zoom(
            Math.round(state.visibleCount * (Math.exp(delta * 0.0015) - 1)) ||
              (delta > 0 ? 1 : -1),
            Math.max(0, Math.min(1, (p.x - m.left) / (m.right - m.left))),
          );
        }
      },
      { passive: false },
    );
    listen("pointerdown", (event) => {
      if (!state.chartMeta || event.button !== 0) return;
      const p = pointerPosition(event),
        m = state.chartMeta;
      chart.focus({ preventScroll: true });
      if (event.pointerType === 'touch') {
        touches.set(event.pointerId, p);
        if (touches.size === 2) {
          const [a, b] = [...touches.values()];
          const center = (a.x + b.x) / 2;
          gesture = { mode: 'pinch', distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), center, count: state.visibleCount, offset: state.viewOffset, fraction: Math.max(0, Math.min(1, (center - m.left) / (m.right - m.left))) };
          state.draft = null; state.hoverIndex = null;
          chart.setPointerCapture(event.pointerId); return;
        }
      }
      if (p.x >= m.left && p.x < m.right && p.y >= m.top && p.y < m.bottom && state.tool !== "cursor") {
        drawingClick(event);
        return;
      }
      if (!options.maximizedPane && p.x >= m.left && p.x < m.right && p.y >= m.top && p.y < m.bottom && !options.drawingsHidden && !options.drawingsLocked) {
        const hit = hitDrawing(state.drawings, p, m, Number(options.timeframe));
        selectedDrawing = hit?.index ?? -1; notifyDrawings();
        if (hit) {
          gesture = { mode: 'drawing', hit, point: drawingPoint(event), original: structuredClone(state.drawings), preview: null };
          chart.setPointerCapture(event.pointerId); draw(); return;
        }
      }
      const mode = options.maximizedPane
        ? "pan"
        : p.x >= m.right
          ? "price"
          : p.y > chart.clientHeight - 50
            ? "time"
            : "pan";
      gesture = {
        mode,
        x: p.x,
        y: p.y,
        offset: state.viewOffset,
        count: state.visibleCount,
        step: m.step,
        min: m.min,
        max: m.max,
        range: m.range,
        height: m.bottom - m.top,
        manualPrice: !!state.manualPrice,
      };
      state.hoverIndex = null;
      chart.setPointerCapture(event.pointerId);
      chart.classList.add("dragging");
    });
    listen("pointermove", (event) => {
      if (!state.chartMeta) return;
      const p = pointerPosition(event);
      if (event.pointerType === 'touch' && touches.has(event.pointerId)) touches.set(event.pointerId, p);
      if (gesture) {
        if (gesture.mode === 'pinch') {
          if (touches.size !== 2) return;
          const [a, b] = [...touches.values()];
          const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
          const view = zoomWindow(state.chartMeta.bars.length, gesture.count, gesture.offset, gesture.count * gesture.distance / distance, gesture.fraction);
          state.visibleCount = view.visibleCount;
          const step = (state.chartMeta.right - state.chartMeta.left) / view.visibleCount;
          state.viewOffset = view.offset + ((a.x + b.x) / 2 - gesture.center) / step;
          draw(); return;
        }
        if (gesture.mode === 'drawing') {
          const point = drawingPoint(event), original = gesture.original[gesture.hit.index];
          const moved = structuredClone(original);
          const deltaMinute = point.minute - gesture.point.minute, deltaPrice = point.price - gesture.point.price;
          for (const anchor of gesture.hit.anchor ? [gesture.hit.anchor] : ['a', 'b']) {
            if (moved[anchor]) moved[anchor] = { minute: original[anchor].minute + deltaMinute, price: original[anchor].price + deltaPrice };
          }
          gesture.preview = gesture.original.map((item, index) => index === gesture.hit.index ? moved : item);
          state.drawings = gesture.preview; draw(); return;
        }
        const dx = p.x - gesture.x,
          dy = p.y - gesture.y;
        if (gesture.mode === "price") {
          const range = Math.max(
              0.00001,
              Math.min(1e8, gesture.range * Math.exp(dy * 0.008)),
            ),
            center = (gesture.max + gesture.min) / 2;
          state.manualPrice = {
            min: center - range / 2,
            max: center + range / 2,
          };
        } else if (gesture.mode === "time") {
          const view = zoomWindow(
            state.chartMeta.bars.length,
            gesture.count,
            gesture.offset,
            Math.round(gesture.count * Math.exp(-dx * 0.005)),
            1,
          );
          state.visibleCount = view.visibleCount;
          state.viewOffset = view.offset;
        } else {
          state.viewOffset = gesture.offset + dx / gesture.step;
          if (gesture.manualPrice && gesture.height > 1 && Math.abs(dy) > 3)
            state.manualPrice = {
              min: gesture.min + (dy / gesture.height) * gesture.range,
              max: gesture.max + (dy / gesture.height) * gesture.range,
            };
        }
        draw();
        return;
      }
      state.hoverIndex = candleAtPointer(event);
      if (state.draft) state.draft.b = drawingPoint(event);
      chart.style.cursor =
        p.x >= state.chartMeta.right
          ? "ns-resize"
          : p.y > chart.clientHeight - 50
            ? "ew-resize"
            : state.tool === "zoom"
              ? "zoom-in"
              : "crosshair";
      draw();
    });
    function endGesture(event) {
      touches.delete(event.pointerId);
      if (gesture?.mode === 'drawing') {
        if (event.type === 'pointercancel') { state.drawings = drawingHistory.items; draw(); }
        else if (gesture.preview) changeDrawings(gesture.preview, gesture.hit.index);
      }
      gesture = null;
      if (chart.hasPointerCapture(event.pointerId))
        chart.releasePointerCapture(event.pointerId);
      chart.classList.remove("dragging");
    }
    listen("pointerup", endGesture);
    listen("pointercancel", endGesture);
    listen("lostpointercapture", event => {
      touches.delete(event.pointerId);
      if (gesture?.mode === "drawing") { state.drawings = drawingHistory.items; draw(); }
      gesture = null;
      chart.classList.remove("dragging");
    });
    listen("pointerleave", () => {
      if (!gesture) {
        state.hoverIndex = null;
        draw();
      }
    });
    listen("dblclick", (event) => {
      const p = pointerPosition(event);
      if (!state.chartMeta || p.x < state.chartMeta.right) {
        state.visibleCount = 90;
        state.viewOffset = 0;
      }
      state.manualPrice = null;
      state.priceScale = 1;
      autoPriceViewport = null;
      draw();
    });
    listen("keydown", (event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redoDrawing() : undoDrawing(); return; }
      if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); redoDrawing(); return; }
      if (event.altKey && ['t', 'h', 'v', 'f', 'r'].includes(event.key.toLowerCase())) {
        event.preventDefault(); selectTool({ t: 'trend', h: 'horizontal', v: 'vertical', f: 'fib', r: 'rectangle' }[event.key.toLowerCase()]); return;
      }
      if (event.key === 'Home') { event.preventDefault(); state.viewOffset = 0; state.manualPrice = null; autoPriceViewport = null; draw(); return; }
      if (event.key === ' ') { event.preventDefault(); options.onTogglePlay?.(); return; }
      if (event.key === 'ArrowRight' && event.altKey) { event.preventDefault(); options.onStep?.(); return; }
      if (event.key === "Escape") {
        state.draft = null;
        selectTool("cursor");
      } else if (event.key === "Delete" || event.key === "Backspace")
        deleteDrawing();
      else if (event.key === "ArrowLeft") state.viewOffset += 5;
      else if (event.key === "ArrowRight") state.viewOffset -= 5;
      else if (event.key === "+" || event.key === "=") zoom(-10);
      else if (event.key === "-") zoom(10);
      else return;
      event.preventDefault();
      draw();
    });
  }

  initializeChartInteractions();
  function resize() {
    const rect = chart.getBoundingClientRect(),
      dpr = devicePixelRatio || 1;
    chart.width = rect.width * dpr;
    chart.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(chart);
  resize();
  return {
    update(model, nextOptions) {
      const oldMeta = state.chartMeta;
      const hoverMinute = oldMeta?.bars[state.hoverIndex]?.minute;
      const changedFrame = options.timeframe !== nextOptions.timeframe;
      const centerMinute =
        oldMeta?.bars[
          Math.max(
            0,
            Math.min(
              oldMeta.bars.length - 1,
              Math.round(oldMeta.first + state.visibleCount / 2),
            ),
          )
        ]?.minute;
      options = { ...options, ...nextOptions };
      const reset = model.session !== state.session;
      if (reset) autoPriceViewport = null;
      if (
        !reset &&
        state.chartMeta &&
        Math.abs(state.viewOffset) > 0.01 &&
        model.candles === state.candles &&
        model.index !== state.index
      ) {
        const previous = chartBars().length;
        Object.assign(state, model);
        state.viewOffset += chartBars().length - previous;
      } else Object.assign(state, model);
      if (reset)
        Object.assign(state, {
          viewOffset: 0,
          manualPrice: null,
          hoverIndex: null,
          draft: null,
          priceScale: 1,
        });
      if (
        changedFrame &&
        !reset &&
        Math.abs(state.viewOffset) > 0.01 &&
        centerMinute !== undefined
      ) {
        const bars = chartBars();
        let index = bars.findIndex((bar) => bar.minute >= centerMinute);
        if (index < 0) index = bars.length - 1;
        state.viewOffset =
          bars.length + 6 - state.visibleCount / 2 - index - 0.5;
      }
      if (changedFrame) {
        state.hoverIndex = null;
        state.draft = null;
      } else if (!reset && hoverMinute !== undefined) {
        const index = chartBars().findIndex(
          (bar) => bar.minute === hoverMinute,
        );
        state.hoverIndex = index < 0 ? null : index;
      }
      notifyDrawings();
      draw();
    },
    zoom,
    priceZoom,
    selectTool,
    fit() {
      state.visibleCount = 120;
      state.viewOffset = 0;
      state.manualPrice = null;
      autoPriceViewport = null;
      draw();
    },
    latest() {
      state.viewOffset = 0;
      draw();
    },
    autoScale() {
      state.manualPrice = null;
      state.priceScale = 1;
      autoPriceViewport = null;
      draw();
    },
    clearDrawings() {
      if (options.drawingsLocked) return;
      state.draft = null; changeDrawings([]);
    },
    undo: undoDrawing,
    redo: redoDrawing,
    deleteDrawing,
    selectDrawing(index) { selectedDrawing = index; notifyDrawings(); draw(); },
    styleDrawing(style) {
      if (options.drawingsLocked || selectedDrawing < 0) return;
      changeDrawings(state.drawings.map((item, index) => index === selectedDrawing ? { ...item, ...style } : item), selectedDrawing);
    },
    setVisibleBars(count) { state.visibleCount = Math.max(20, Math.min(1000, count)); state.viewOffset = 0; state.manualPrice = null; autoPriceViewport = null; draw(); },
    addText(point, text) {
      if (!options.drawingsLocked && text.trim()) finishDrawing({ type: 'text', a: point, text: text.trim().slice(0, 120), color: options.drawingColor, width: options.drawingWidth });
    },
    snapshot() {
      return chart.toDataURL("image/png");
    },
    destroy() {
      observer.disconnect();
      cleanup.forEach((remove) => remove());
    },
  };
}
