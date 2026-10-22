export type ViewMode = 'GEO' | 'SCHEM';

export interface ProvinceData {
  nombre: string;
  rings: [number, number][][];
}

export interface TransmissionLine {
  id: string | number;
  nombre: string;
  tension_kv: number;
  tension_tier: '500kV' | '220kV' | '132kV' | '<132kV';
  empresa: string;
  region: string;
  geo: [number, number][];
  schem: [number, number][];
}

export interface Substation {
  id: string;
  uid?: string;
  role?: 'ET500' | 'ET132';
  nombre: string;
  tension_kv: number;
  tension_tier: '500kV' | '220kV' | '132kV' | '<132kV';
  potencia_mw: number;
  empresa: string;
  region: string;
  geo: [number, number];
  schem: [number, number];
  lat: number;
  lon: number;
  isMajor?: boolean;
}

export interface PowerPlant {
  id: string;
  uid?: string;
  role?: 'GEN';
  nombre: string;
  agente: string;
  tecnologia: 'Hidroeléctrica' | 'Térmica' | 'Nuclear' | 'Eólica' | 'Solar' | 'Biomasa';
  potencia_mw: number;
  tension_kv?: number;
  provincia: string;
  region: string;
  geo: [number, number];
  schem: [number, number];
  lat: number;
  lon: number;
  isMajor?: boolean;
}

export interface DistributorNode {
  id: string;
  uid: string;
  role: 'DIST';
  nombre: string;
  empresa: string;
  provincia: string;
  region: string;
  lat: number;
  lon: number;
  potencia_mw: number;
  tension_kv: number;
  geo: [number, number];
  isMajor?: boolean;
}

export interface CooperativeNode {
  id: string;
  uid: string;
  role: 'COOP';
  nombre: string;
  provincia: string;
  localidad: string;
  depto?: string;
  lat: number;
  lon: number;
  potencia_mw: number;
  tension_kv: number;
  geo: [number, number];
  source_uid: string;
  source_name: string;
  source_type: 'ET' | 'DIST';
  source_kv: number;
  dist_km: number;
  match_type: string;
  region: string;
  isMajor?: boolean;
}

export interface DeduplicatedEdge {
  id: string;
  source: string;
  target: string;
  voltageKv: number;
  parallelCount: number;
  amperes: number;
  nombre: string;
  empresa: string;
  region: string;
}

export interface TopologyMetadata {
  total_lines: number;
  total_eett: number;
  total_centrales: number;
  total_distribuidoras?: number;
  total_cooperativas?: number;
  total_participants?: number;
  total_deduplicated_edges?: number;
  total_provincias: number;
  technologies: string[];
  voltage_tiers: string[];
  operators: string[];
}

export interface TopologyData {
  metadata: TopologyMetadata;
  provinces: ProvinceData[];
  lines: TransmissionLine[];
  eett: Substation[];
  centrales: PowerPlant[];
  distribuidoras?: DistributorNode[];
  cooperativas?: CooperativeNode[];
  deduplicated_edges?: DeduplicatedEdge[];
}

export interface RegionTelemetry {
  demanda_mw: number;
  temperatura: number;
  timestamp: string;
  demAyer: number;
}

export interface RenewablesTelemetry {
  momento: string;
  eolica: number;
  fotovoltaica: number;
  biocombustible: number;
  hidraulica: number;
  cubrimientoDem: number;
  hidraulica50?: number;
}

export interface CorridorTelemetry {
  from: string;
  to: string;
  nominal_kv: number;
  flow_direction: number;
  load_factor: number;
  speed: number;
}

export interface TelemetryData {
  timestamp: string;
  status: 'ONLINE 5M' | 'CACHED' | 'INITIALIZING' | 'ERROR';
  sadi_total_mw: number;
  frequency_hz: number;
  regions: Record<string, RegionTelemetry>;
  renovables: RenewablesTelemetry | null;
  corridors: Record<string, CorridorTelemetry>;
}

export interface FilterState {
  voltages: Record<'500kV' | '220kV' | '132kV' | '<132kV', boolean>;
  technologies: Record<string, boolean>;
  selectedOperator: string;
  searchQuery: string;
}

export type SelectedEntity = 
  | { type: 'LINE'; data: TransmissionLine }
  | { type: 'EETT'; data: Substation }
  | { type: 'CENTRAL'; data: PowerPlant }
  | null;
