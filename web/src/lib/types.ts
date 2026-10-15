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
  clientId: string | null;
  client: { id: string; name: string | null; email: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type Role = "OWNER" | "CLIENT";

export interface Client {
  id: string;
  name: string | null;
  email: string;
  active: boolean;
  createdAt: string;
  plates: number;
  configured: number;
}

/** Plaquinha como o cliente revendedor a vê (sem observações internas). */
export interface MyPlate {
  id: string;
  code: string;
  permanentUrl: string;
  businessName: string | null;
  internalName: string;
  destinationUrl: string | null;
  configured: boolean;
  active: boolean;
  updatedAt: string;
}

export interface MyPlateList {
  total: number;
  configured: number;
  items: MyPlate[];
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
  changedBy: { name: string | null; email: string | null; role: Role } | null;
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
