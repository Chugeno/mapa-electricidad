import React from 'react';
import { SelectedEntity } from '../types';
import { X, Zap, Cpu, MapPin, Building2, Activity } from 'lucide-react';

interface ScadaInspectorProps {
  selectedEntity: SelectedEntity;
  onClose: () => void;
}

export const ScadaInspector: React.FC<ScadaInspectorProps> = ({
  selectedEntity,
  onClose
}) => {
  if (!selectedEntity) return null;

  const { type, data } = selectedEntity;

  let title = '';
  let subTitle = '';
  let tensionStr = '';
  let powerStr = '';
  let operator = '';
  let region = '';
  let tech = '';
  let coords = '';

  if (type === 'LINE') {
    title = data.nombre || `LÍNEA ${data.tension_kv} kV`;
    subTitle = 'LÍNEA DE TRANSMISIÓN DE ALTA TENSIÓN';
    tensionStr = `${data.tension_kv} kV (${data.tension_tier})`;
    operator = data.empresa || 'Transener';
    region = data.region || 'SADI';
    if (data.geo && data.geo.length > 0) {
      coords = `${data.geo.length} vértices topológicos`;
    }
  } else if (type === 'EETT') {
    title = data.nombre || 'ESTACIÓN TRANSFORMADORA';
    subTitle = 'ESTACIÓN TRANSFORMADORA (ET / AT)';
    tensionStr = `${data.tension_kv} kV`;
    powerStr = data.potencia_mw ? `${data.potencia_mw.toFixed(1)} MW` : 'N/D';
    operator = data.empresa || 'Concesionaria';
    region = data.region || 'SADI';
    coords = `${data.lat?.toFixed(4)}°, ${data.lon?.toFixed(4)}°`;
  } else if (type === 'CENTRAL') {
    title = data.nombre || 'CENTRAL DE GENERACIÓN';
    subTitle = `CENTRAL ELÉCTRICA // ${data.tecnologia?.toUpperCase()}`;
    tech = data.tecnologia || 'Térmica';
    powerStr = data.potencia_mw ? `${data.potencia_mw.toFixed(1)} MW` : 'N/D';
    operator = data.agente || 'Agente Generador';
    region = data.region || data.provincia || 'SADI';
    coords = `${data.lat?.toFixed(4)}°, ${data.lon?.toFixed(4)}°`;
  }

  return (
    <div className="absolute right-3 top-16 w-80 sm:w-96 scada-panel-solid border border-scada-border z-30 select-none font-mono text-xs">
      {/* Header */}
      <div className="h-9 px-3 bg-scada-panel border-b border-scada-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-scada-accent" />
          <span className="font-bold text-scada-textBright uppercase tracking-wider text-[11px]">
            FICHA TÉCNICA // SCADA
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-scada-text hover:text-scada-textBright bg-scada-card border border-scada-border"
          title="Cerrar inspector"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body Details */}
      <div className="p-4 space-y-3">
        <div>
          <span className="text-[10px] text-scada-textMuted uppercase tracking-wider block">
            {subTitle}
          </span>
          <h3 className="text-sm font-bold text-scada-textBright mt-0.5 leading-tight">
            {title}
          </h3>
        </div>

        <div className="border-t border-scada-border pt-3 space-y-2 text-[11px]">
          <div className="flex items-start justify-between">
            <span className="text-scada-textMuted uppercase">CÓDIGO / ID:</span>
            <span className="text-scada-text font-bold text-right">{data.id}</span>
          </div>

          <div className="flex items-start justify-between">
            <span className="text-scada-textMuted uppercase">EMPRESA OPERADORA:</span>
            <span className="text-scada-textBright font-bold text-right max-w-[60%] truncate">
              {operator}
            </span>
          </div>

          {tensionStr && (
            <div className="flex items-start justify-between">
              <span className="text-scada-textMuted uppercase">TENSIÓN NOMINAL:</span>
              <span className="text-scada-accent font-bold">{tensionStr}</span>
            </div>
          )}

          {powerStr && (
            <div className="flex items-start justify-between">
              <span className="text-scada-textMuted uppercase">POTENCIA INSTALADA:</span>
              <span className="text-emerald-400 font-bold">{powerStr}</span>
            </div>
          )}

          {tech && (
            <div className="flex items-start justify-between">
              <span className="text-scada-textMuted uppercase">TECNOLOGÍA:</span>
              <span className="text-yellow-400 font-bold">{tech}</span>
            </div>
          )}

          <div className="flex items-start justify-between">
            <span className="text-scada-textMuted uppercase">REGIÓN ELÉCTRICA:</span>
            <span className="text-scada-text font-bold">{region}</span>
          </div>

          {coords && (
            <div className="flex items-start justify-between">
              <span className="text-scada-textMuted uppercase">COORDENADAS:</span>
              <span className="text-scada-textMuted font-mono text-[10px]">{coords}</span>
            </div>
          )}
        </div>

        {/* CAD status banner */}
        <div className="border border-scada-border bg-scada-panel p-2 flex items-center justify-between text-[10px]">
          <span className="text-scada-textMuted">ESTADO OPERATIVO:</span>
          <span className="text-emerald-400 font-bold">NORMAL // CONECTADO</span>
        </div>
      </div>
    </div>
  );
};
