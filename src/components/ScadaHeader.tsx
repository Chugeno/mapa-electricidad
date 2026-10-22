import React, { useState, useEffect } from 'react';
import { ViewMode, TelemetryData, TopologyMetadata } from '../types';
import { Activity, Radio, Cpu, Layers, Zap } from 'lucide-react';

interface ScadaHeaderProps {
  viewMode: ViewMode;
  onToggleViewMode: (mode: ViewMode) => void;
  telemetry: TelemetryData | null;
  metadata: TopologyMetadata | null;
}

export const ScadaHeader: React.FC<ScadaHeaderProps> = ({
  viewMode,
  onToggleViewMode,
  telemetry,
  metadata
}) => {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('es-AR', { hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const totalMw = telemetry?.sadi_total_mw 
    ? telemetry.sadi_total_mw.toLocaleString('es-AR') 
    : '---';

  const freq = telemetry?.frequency_hz ? telemetry.frequency_hz.toFixed(2) : '50.00';
  const status = telemetry?.status || 'CONECTANDO';
  const isOnline = status === 'ONLINE 5M';

  return (
    <header className="scada-header h-14 px-3 sm:px-4 flex items-center justify-between z-20 select-none border-b border-scada-border">
      {/* Left: Brand & Telemetry Badge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-scada-kv132 animate-pulse" />
          <span className="font-mono text-xs font-bold tracking-widest text-scada-textBright uppercase">
            SADI <span className="text-scada-textMuted">//</span> SCADA CAD
          </span>
        </div>

        {/* Live Status indicator */}
        <div className={`hidden md:flex items-center gap-1.5 px-2 py-0.5 font-mono text-[11px] font-bold border ${
          isOnline ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/20' : 'border-amber-500/40 text-amber-400 bg-amber-950/20'
        }`}>
          <Radio className="w-3 h-3" />
          <span>{status}</span>
        </div>
      </div>

      {/* Center: Real-Time Grid Telemetry Metrics */}
      <div className="flex items-center gap-4 sm:gap-6 font-mono">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] sm:text-xs text-scada-textMuted uppercase">DEMANDA:</span>
          <span className="text-sm sm:text-base font-bold text-scada-textBright tracking-wider">
            {totalMw} <span className="text-xs text-scada-accent font-normal">MW</span>
          </span>
        </div>

        <div className="hidden sm:flex items-baseline gap-1.5">
          <span className="text-[10px] sm:text-xs text-scada-textMuted uppercase">FREC:</span>
          <span className="text-xs sm:text-sm font-bold text-emerald-400">
            {freq} <span className="text-[10px] text-scada-textMuted">Hz</span>
          </span>
        </div>

        {metadata && (
          <div className="hidden lg:flex items-center gap-3 text-[11px] text-scada-textMuted border-l border-scada-border pl-4">
            <span>LÍNEAS: <strong className="text-scada-text">{metadata.total_lines}</strong></span>
            <span>EETT: <strong className="text-scada-text">{metadata.total_eett}</strong></span>
            <span>CENTRALES: <strong className="text-scada-text">{metadata.total_centrales}</strong></span>
          </div>
        )}
      </div>

      {/* Right: View Mode Toggle & Clock */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Toggle View Switcher */}
        <div className="flex border border-scada-border bg-scada-panel">
          <button
            onClick={() => onToggleViewMode('GEO')}
            className={`px-2.5 py-1 text-[11px] font-mono font-semibold transition-colors ${
              viewMode === 'GEO'
                ? 'bg-scada-border text-scada-accent border-r border-scada-border'
                : 'text-scada-text hover:text-scada-textBright border-r border-scada-border'
            }`}
            title="Vista Geográfica real EPSG:4326"
          >
            GEOGRÁFICO
          </button>
          <button
            onClick={() => onToggleViewMode('SCHEM')}
            className={`px-2.5 py-1 text-[11px] font-mono font-semibold transition-colors ${
              viewMode === 'SCHEM'
                ? 'bg-scada-border text-scada-accent'
                : 'text-scada-text hover:text-scada-textBright'
            }`}
            title="Vista Unifilar Esquemática SCADA Octolineal (90°/45°)"
          >
            UNIFILAR (CAD)
          </button>
        </div>

        {/* Local Time */}
        <div className="hidden md:block font-mono text-xs text-scada-text font-bold px-2 py-1 bg-scada-panel border border-scada-border">
          {timeStr || '00:00:00'} <span className="text-[10px] text-scada-textMuted">ART</span>
        </div>
      </div>
    </header>
  );
};
