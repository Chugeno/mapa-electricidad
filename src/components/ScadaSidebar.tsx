import React, { useState } from 'react';
import { FilterState, TopologyMetadata } from '../types';
import { Filter, Search, ChevronLeft, ChevronRight, Zap, Flame, Wind, Sun, Droplets, Atom } from 'lucide-react';

interface ScadaSidebarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  metadata: TopologyMetadata | null;
}

const VOLTAGE_CONFIG = [
  { key: '500kV', label: '500 kV', color: '#ef4444', desc: 'Extra Alta Tensión (Corredores Troncales)' },
  { key: '220kV', label: '220 kV', color: '#22c55e', desc: 'Alta Tensión Regional' },
  { key: '132kV', label: '132 kV', color: '#06b6d4', desc: 'Transporte por Distribución Troncal' },
  { key: '<132kV', label: '<132 kV', color: '#eab308', desc: 'Subtransmisión / Media Tensión' },
] as const;

const TECH_ICONS: Record<string, React.ReactNode> = {
  'Hidroeléctrica': <Droplets className="w-3.5 h-3.5 text-sky-400" />,
  'Térmica': <Flame className="w-3.5 h-3.5 text-orange-400" />,
  'Nuclear': <Atom className="w-3.5 h-3.5 text-purple-400" />,
  'Eólica': <Wind className="w-3.5 h-3.5 text-emerald-400" />,
  'Solar': <Sun className="w-3.5 h-3.5 text-yellow-400" />,
  'Biomasa': <Zap className="w-3.5 h-3.5 text-lime-400" />
};

export const ScadaSidebar: React.FC<ScadaSidebarProps> = ({
  filters,
  onFilterChange,
  metadata
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const toggleVoltage = (key: '500kV' | '220kV' | '132kV' | '<132kV') => {
    onFilterChange({
      ...filters,
      voltages: {
        ...filters.voltages,
        [key]: !filters.voltages[key]
      }
    });
  };

  const toggleTech = (tech: string) => {
    onFilterChange({
      ...filters,
      technologies: {
        ...filters.technologies,
        [tech]: !filters.technologies[tech]
      }
    });
  };

  const handleOperatorChange = (op: string) => {
    onFilterChange({
      ...filters,
      selectedOperator: op
    });
  };

  const handleSearchChange = (query: string) => {
    onFilterChange({
      ...filters,
      searchQuery: query
    });
  };

  const resetFilters = () => {
    onFilterChange({
      voltages: { '500kV': true, '220kV': true, '132kV': true, '<132kV': true },
      technologies: {
        'Hidroeléctrica': true,
        'Térmica': true,
        'Nuclear': true,
        'Eólica': true,
        'Solar': true,
        'Biomasa': true
      },
      selectedOperator: '',
      searchQuery: ''
    });
  };

  return (
    <div className={`absolute left-3 top-16 z-20 transition-all duration-200 select-none ${
      collapsed ? 'w-9' : 'w-72 sm:w-80'
    }`}>
      <div className="scada-panel-solid border border-scada-border overflow-hidden">
        {/* Header Bar */}
        <div className="h-9 px-2.5 bg-scada-panel border-b border-scada-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-scada-accent" />
            {!collapsed && (
              <span className="font-mono text-xs font-bold text-scada-textBright uppercase tracking-wider">
                FILTROS SCADA
              </span>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-6 h-6 flex items-center justify-center text-scada-text hover:text-scada-textBright bg-scada-card border border-scada-border"
            title={collapsed ? 'Expandir panel' : 'Colapsar panel'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Content Body */}
        {!collapsed && (
          <div className="p-3 space-y-4 max-h-[calc(100vh-140px)] overflow-y-auto font-mono text-xs">
            {/* Search Input */}
            <div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-scada-textMuted" />
                <input
                  type="text"
                  placeholder="Buscar nodo, ET o línea..."
                  value={filters.searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full scada-input pl-7 text-[11px]"
                />
              </div>
            </div>

            {/* Voltage Levels (Normative SADI) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-scada-textMuted uppercase border-b border-scada-border pb-1">
                <span>NIVEL DE TENSIÓN</span>
                <span className="text-[9px]">SADI kV</span>
              </div>
              <div className="space-y-1">
                {VOLTAGE_CONFIG.map(({ key, label, color, desc }) => {
                  const active = filters.voltages[key] !== false;
                  return (
                    <button
                      key={key}
                      onClick={() => toggleVoltage(key)}
                      className={`w-full px-2 py-1.5 flex items-center justify-between border transition-colors ${
                        active 
                          ? 'border-scada-border bg-scada-card text-scada-textBright' 
                          : 'border-scada-border/40 bg-scada-bg/60 text-scada-textMuted line-through'
                      }`}
                      title={desc}
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 border border-black/40" 
                          style={{ backgroundColor: active ? color : '#334155' }} 
                        />
                        <span className="font-bold">{label}</span>
                      </div>
                      <span className="text-[10px] text-scada-textMuted">{active ? 'ACTIVO' : 'OFF'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Generation Sources */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-scada-textMuted uppercase border-b border-scada-border pb-1">
                <span>TECNOLOGÍA DE GENERACIÓN</span>
                <span className="text-[9px]">TIPO</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {['Hidroeléctrica', 'Térmica', 'Nuclear', 'Eólica', 'Solar', 'Biomasa'].map((tech) => {
                  const active = filters.technologies[tech] !== false;
                  return (
                    <button
                      key={tech}
                      onClick={() => toggleTech(tech)}
                      className={`px-2 py-1.5 flex items-center gap-1.5 border text-[11px] truncate transition-colors ${
                        active 
                          ? 'border-scada-border bg-scada-card text-scada-textBright' 
                          : 'border-scada-border/40 bg-scada-bg/60 text-scada-textMuted opacity-50'
                      }`}
                    >
                      {TECH_ICONS[tech] || <Zap className="w-3.5 h-3.5 text-scada-textMuted" />}
                      <span className="truncate">{tech}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Operator Company Filter */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-scada-textMuted uppercase border-b border-scada-border pb-1">
                <span>EMPRESA OPERADORA</span>
                <span className="text-[9px]">CONCESIONARIA</span>
              </div>
              <select
                value={filters.selectedOperator}
                onChange={(e) => handleOperatorChange(e.target.value)}
                className="w-full scada-input text-[11px]"
              >
                <option value="">TODAS LAS EMPRESAS</option>
                {metadata?.operators?.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Filters */}
            <button
              onClick={resetFilters}
              className="w-full py-1.5 scada-btn text-[11px] uppercase tracking-wider"
            >
              REESTABLECER FILTROS
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
