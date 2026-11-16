import React from 'react';
import {
  ArrowDown, ArrowUp, Camera, CandlestickChart, ChevronsRight, Crosshair, Delete, Eye, EyeOff,
  HelpCircle, Layers, Lock, LockOpen, Magnet, Maximize, Minimize, Minus, Pause,
  PencilLine, Play, Plus, Redo2, RotateCcw, Ruler, Search, Settings, StepForward,
  Trash2, Type, Undo2, X, ZoomIn,
} from 'lucide-react';

const ICONS = {
  up: ArrowUp, down: ArrowDown, camera: Camera, candles: CandlestickChart,
  cursor: Crosshair, delete: Delete, eye: Eye, 'eye-off': EyeOff,
  help: HelpCircle, layers: Layers, lock: Lock, unlock: LockOpen, magnet: Magnet,
  maximize: Maximize, minimize: Minimize, minus: Minus, pause: Pause,
  pencil: PencilLine, play: Play, plus: Plus, redo: Redo2, reset: RotateCcw,
  measure: Ruler, search: Search, settings: Settings, step: StepForward,
  trash: Trash2, text: Type, undo: Undo2, close: X, zoom: ZoomIn,
  latest: ChevronsRight,
};

// Chart-specific geometry: line anchors, ray, retracement levels, and formula.
const DRAWINGS = {
  trend: <><path d="m5 23 18-18"/><rect x="3.5" y="21.5" width="3" height="3" fill="currentColor" stroke="none"/><rect x="21.5" y="3.5" width="3" height="3" fill="currentColor" stroke="none"/></>,
  ray: <><path d="M5 23 24 4m-6 0h6v6"/><circle cx="5" cy="23" r="1.8" fill="currentColor" stroke="none"/></>,
  horizontal: <><path d="M3 14h22"/><rect x="12.5" y="12.5" width="3" height="3" fill="currentColor" stroke="none"/></>,
  vertical: <><path d="M14 3v22"/><rect x="12.5" y="12.5" width="3" height="3" fill="currentColor" stroke="none"/></>,
  rectangle: <><rect x="5" y="6" width="18" height="16"/><path d="M4 5h2v2H4zm18 16h2v2h-2z" fill="currentColor" stroke="none"/></>,
  fib: <><path d="M4 5h20M4 11h20M4 17h20M4 23h20"/><path d="M5 23 23 5" strokeDasharray="2 3" opacity=".65"/></>,
  indicators: <><path d="M17 5h-3c-2 0-2.7 1.6-3 4L8.8 22c-.2 1.3-1 2-2.3 2H5M7 11h10m1 4 6 7m0-7-6 7"/></>,
  cursor: <path d="M14 3v7m0 8v7M3 14h7m8 0h7m-11-2v4m-2-2h4"/>,
};

export default function ChartIcon({ name, size = 18, className = '' }) {
  const classes = `chart-icon ${className}`.trim();
  if (DRAWINGS[name]) return <svg className={classes} width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">{DRAWINGS[name]}</svg>;
  const Icon = ICONS[name] || Crosshair;
  return <Icon className={classes} size={size} strokeWidth={1.5} aria-hidden="true" focusable="false"/>;
}
