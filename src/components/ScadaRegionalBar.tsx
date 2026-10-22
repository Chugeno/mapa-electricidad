import React from 'react';
import { TelemetryData } from '../types';
import { Zap, Wind, Sun, Droplets, Activity } from 'lucide-react';

interface ScadaRegionalBarProps {
  telemetry: TelemetryData | null;
}

export const ScadaRegionalBar: React.FC<ScadaRegionalBarProps> = ({ telemetry }) => {
  if (!telemetry || !telemetry.regions) return null;

  const regionsList = [
    { key: 'GBA', label: 'GBA' },
    { key: 'Litoral', label: 'LITORAL' },
    { key: 'Centro', label: 'CENTRO' },
    { key: 'Cuyo', label: 'CUYO' },
    { key: 'NOA', label: 'NOA' },
    { key: 'NEA', label: 'NEA' },
    { key: 'Comahue', label: 'COMAHUE' },
    { key: 'Patagonia', label: 'PATAGONIA' }
  ];

  const renov = telemetry.renovables;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-11 bg-scada-bg/95 border-t border-scada-border z-20 px-3 flex items-center justify-between font-mono text-[11px] select-none overflow-x-auto">
      {/* Regional Load Corridor Items */}
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        <div className="flex items-center gap-1.5 text-scada-textMuted font-bold border-r border-scada-border pr-3">
          <Activity className="w-3.5 h-3.5 text-scada-accent animate-pulse" />
          <span className="hidden sm:inline">DESPACHO REGIONAL:</span>
          <span className="sm:hidden">REGIONAL:</span>
        </div>

        {regionsList.map(({ key, label }) => {
          const reg = telemetry.regions[key];
          const val = reg?.demanda_mw ? reg.demanda_mw.toLocaleString('es-AR') : '---';
          const temp = reg?.temperatura ? `${reg.temperatura.toFixed(0)}°C` : '';

          return (
            <div key={key} className="flex items-baseline gap-1.5 shrink-0">
              <span className="text-scada-textMuted uppercase">{label}:</span>
              <span className="text-scada-textBright font-bold">
                {val} <span className="text-[9px] text-scada-textMuted">MW</span>
              </span>
              {temp && <span className="text-[10px] text-scada-accent/70 hidden md:inline">{temp}</span>}
            </div>
          );
        })}
      </div>

      {/* Renewables Live Ticker (if available) */}
      {renov && (
        <div className="hidden xl:flex items-center gap-4 shrink-0 border-l border-scada-border pl-4 text-[10px]">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <Wind className="w-3.5 h-3.5" />
            <span>EOL: {Math.round(renov.eolica || 0)} MW</span>
          </div>
          <div className="flex items-center gap-1.5 text-yellow-400 font-bold">
            <Sun className="w-3.5 h-3.5" />
            <span>SOL: {Math.round(renov.fotovoltaica || 0)} MW</span>
          </div>
          <div className="flex items-center gap-1.5 text-sky-400 font-bold">
            <Droplets className="w-3.5 h-3.5" />
            <span>HID: {Math.round(renov.hidraulica || 0)} MW</span>
          </div>
          <div className="px-2 py-0.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 font-bold">
            COBERTURA: {(renov.cubrimientoDem || 0).toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  );
};
