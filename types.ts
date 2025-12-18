
export interface VehicleData {
  make: string;
  model: string;
  year: string;
  trim?: string;
  engine?: string;
  transmission?: string;
  driveType?: string;
  bodyClass?: string;
  rawJson?: string;
}

export interface GarageVehicle extends VehicleData {
  id: string;
  vin: string;
  savedAt: number;
}

export interface PartResult {
  title: string;
  price?: string;
  source: string;
  url: string;
  snippet: string;
}

export type SearchStep = 
  | 'idle' 
  | 'verifying' 
  | 'accessing_nhtsa' 
  | 'ai_cross_ref' 
  | 'finalizing' 
  | 'searching' 
  | 'filtering' 
  | 'complete' 
  | 'error';

export interface SearchStatus {
  step: SearchStep;
  message: string;
  entertainment?: string;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}
