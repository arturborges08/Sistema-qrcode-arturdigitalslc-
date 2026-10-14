export interface Plate {
  id: string;
  code: string;
  permanentUrl: string;
  businessName: string;
  internalName: string;
  destinationUrl: string;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Stats {
  total: number;
  active: number;
  inactive: number;
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
