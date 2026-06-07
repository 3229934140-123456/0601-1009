export enum AssetStatus {
  IN_USE = 'in_use',
  IDLE = 'idle',
  DAMAGED = 'damaged',
  SCRAPPED = 'scrapped',
  BORROWED = 'borrowed',
  UNDER_MAINTENANCE = 'under_maintenance'
}

export enum AssetCategory {
  COMPUTER = 'computer',
  OFFICE_EQUIPMENT = 'office_equipment',
  FURNITURE = 'furniture',
  VEHICLE = 'vehicle',
  MACHINE = 'machine',
  OTHER = 'other'
}

export enum InventoryStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum ScanStatus {
  NORMAL = 'normal',
  MISPLACED = 'misplaced',
  NOT_FOUND = 'not_found',
  DUPLICATE = 'duplicate',
  UNREGISTERED = 'unregistered'
}

export enum ExceptionType {
  MISPLACED = 'misplaced',
  DAMAGED = 'damaged',
  LOST = 'lost',
  UNREGISTERED = 'unregistered',
  DUPLICATE_TAG = 'duplicate_tag',
  OTHER = 'other'
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export interface AssetLocation {
  building: string;
  floor: string;
  room: string;
  position?: string;
}

export interface Asset {
  id: string;
  assetNo: string;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  location: AssetLocation;
  responsiblePerson: string;
  department: string;
  purchaseDate?: string;
  price?: number;
  brand?: string;
  model?: string;
  serialNo?: string;
  tagCode?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetRegistrationInput {
  assetNo: string;
  name: string;
  category: AssetCategory;
  location: AssetLocation;
  responsiblePerson: string;
  department: string;
  status?: AssetStatus;
  purchaseDate?: string;
  price?: number;
  brand?: string;
  model?: string;
  serialNo?: string;
  tagCode?: string;
  description?: string;
}

export interface TagInfo {
  assetNo: string;
  tagType: 'qr' | 'barcode' | 'rfid';
  encodeVersion?: string;
  checksum?: string;
  rawContent: string;
  extra?: Record<string, any>;
}

export interface InventoryTask {
  id: string;
  name: string;
  batchNo: string;
  status: InventoryStatus;
  department?: string;
  location?: AssetLocation;
  startTime?: string;
  endTime?: string;
  operator: string;
  planAssetIds: string[];
  actualScans: InventoryScan[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryScan {
  id: string;
  taskId: string;
  assetId: string;
  assetNo: string;
  scanTime: string;
  scanner: string;
  scanLocation?: AssetLocation;
  status: ScanStatus;
  isDuplicate: boolean;
  note?: string;
}

export interface ScanInput {
  taskId: string;
  assetNo: string;
  scanner: string;
  scanLocation?: AssetLocation;
  scanTime?: string;
  note?: string;
}

export interface LocationCheckResult {
  isCorrect: boolean;
  expectedLocation: AssetLocation;
  actualLocation: AssetLocation;
  difference: {
    building?: boolean;
    floor?: boolean;
    room?: boolean;
    position?: boolean;
  };
}

export interface StatusChangeRecord {
  id: string;
  assetId: string;
  assetNo: string;
  fromStatus: AssetStatus;
  toStatus: AssetStatus;
  operator: string;
  reason: string;
  timestamp: string;
}

export interface ExceptionRecord {
  id: string;
  taskId?: string;
  assetId: string;
  assetNo: string;
  type: ExceptionType;
  description: string;
  reporter: string;
  timestamp: string;
  approvalStatus: ApprovalStatus;
  approvalOperator?: string;
  approvalTime?: string;
  approvalRemark?: string;
  handled: boolean;
  handleRemark?: string;
  handleTime?: string;
}

export interface AssetHistoryRecord {
  id: string;
  assetId: string;
  type: 'register' | 'status_change' | 'location_change' | 'scan' | 'exception' | 'update';
  title: string;
  description: string;
  operator?: string;
  timestamp: string;
  detail?: any;
}

export interface DepartmentSummary {
  department: string;
  totalAssets: number;
  scannedAssets: number;
  unscannedAssets: number;
  normalAssets: number;
  abnormalAssets: number;
  completionRate: number;
}

export interface InventoryReport {
  taskId: string;
  taskName: string;
  batchNo: string;
  startTime?: string;
  endTime?: string;
  totalAssets: number;
  scannedAssets: number;
  unscannedAssets: number;
  duplicateScans: number;
  misplacedAssets: number;
  abnormalAssets: number;
  completionRate: number;
  accuracyRate: number;
  departmentSummaries: DepartmentSummary[];
  unscannedAssetList: Asset[];
  misplacedAssetList: Asset[];
  abnormalAssetList: Asset[];
  differenceList: DifferenceItem[];
  generatedAt: string;
}

export interface DifferenceItem {
  assetNo: string;
  assetName: string;
  differenceType: 'missing' | 'misplaced' | 'damaged' | 'unregistered';
  description: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
