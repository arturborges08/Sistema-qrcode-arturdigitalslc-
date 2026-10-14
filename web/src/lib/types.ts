export interface Plate {
  id: string;
  code: string;
  permanentUrl: string;
  businessName: string | null;
  internalName: string;
  destinationUrl: string | null;
  configured: boolean;
  batchName: string | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Stats {
  total: number;
  active: number;
  inactive: number;
  unconfigured: number;
  recent: Plate[];
}

export interface PlateList {
  total: number;
  page: number;
  pageSize: number;
  items: Plate[];
}

export interface HistoryItem {
  id: string;
  previousUrl: string | null;
  newUrl: string;
  changedAt: string;
}

export interface BatchSummary {
  batchName: string;
  total: number;
  unconfigured: number;
  createdAt: string;
}

export interface BatchQrItem {
  id: string;
  code: string;
  internalName: string;
  permanentUrl: string;
  svgDataUri: string;
}
