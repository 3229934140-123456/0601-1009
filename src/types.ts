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

export interface InventoryScope {
  id: string;
  taskId: string;
  name: string;
  type: 'department' | 'location' | 'responsible_person' | 'custom';
  value: string;
  assetIds: string[];
  assignedScanner?: string;
  status: InventoryStatus;
  startTime?: string;
  endTime?: string;
  createdAt: string;
  updatedAt: string;
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
  scopes: InventoryScope[];
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
  suggestedAction?: {
    updateStatus?: AssetStatus;
    updateLocation?: AssetLocation;
    updateResponsiblePerson?: string;
  };
  syncPerformed?: boolean;
  syncDetail?: any;
}

export interface PendingAction {
  id: string;
  type: 'exception_approval' | 'status_change' | 'location_update' | 'asset_transfer';
  refId: string;
  assetId: string;
  assetNo: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  assignee?: string;
  status: 'pending' | 'processing' | 'done' | 'cancelled';
  createdAt: string;
  dueDate?: string;
  detail?: any;
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

export interface UnregisteredScanDetail {
  assetNo: string;
  scanTime: string;
  scanner: string;
  scanLocation?: AssetLocation;
  scanCount: number;
}

export interface ScanWithAssetInfo extends InventoryScan {
  assetName?: string;
  assetCategory?: AssetCategory;
  assetStatus?: AssetStatus;
  currentLocation?: AssetLocation;
  responsiblePerson?: string;
  department?: string;
  inPlan: boolean;
}

export interface ExceptionWithAssetInfo extends ExceptionRecord {
  assetName?: string;
  assetCategory?: AssetCategory;
  currentLocation?: AssetLocation;
  responsiblePerson?: string;
  department?: string;
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
  outOfPlanAssets: number;
  unregisteredAssets: number;
  pendingExceptions: number;
  approvedExceptions: number;
  rejectedExceptions: number;
  completionRate: number;
  accuracyRate: number;
  departmentSummaries: DepartmentSummary[];
  unscannedAssetList: Asset[];
  misplacedAssetList: Asset[];
  abnormalAssetList: Asset[];
  outOfPlanAssetList: Asset[];
  unregisteredAssetList: string[];
  unregisteredScanDetails: UnregisteredScanDetail[];
  pendingExceptionList: ExceptionWithAssetInfo[];
  approvedExceptionList: ExceptionWithAssetInfo[];
  rejectedExceptionList: ExceptionWithAssetInfo[];
  duplicateScanList: ScanWithAssetInfo[];
  differenceList: DifferenceItem[];
  generatedAt: string;
}

export interface InventoryReportVersion {
  id: string;
  taskId: string;
  version: number;
  report: InventoryReport;
  status: 'draft' | 'frozen' | 'reviewing' | 'approved' | 'rejected';
  reviewer?: string;
  reviewComment?: string;
  reviewTime?: string;
  creator: string;
  createdAt: string;
  frozenAt?: string;
  differencesFromPrev?: ReportDiffItem[];
}

export interface ReportDiffItem {
  category: 'basic' | 'count' | 'list' | 'rate';
  field: string;
  label: string;
  oldValue: any;
  newValue: any;
  change: number;
  addedItems?: string[];
  removedItems?: string[];
  changedItems?: string[];
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

export interface ScanQueryParams extends PaginationParams {
  taskId?: string;
  assetNo?: string;
  scanner?: string;
  status?: ScanStatus;
  isDuplicate?: boolean;
  department?: string;
  location?: Partial<AssetLocation>;
  startTime?: string;
  endTime?: string;
  inPlan?: boolean;
}

export interface ExceptionQueryParams extends PaginationParams {
  taskId?: string;
  assetId?: string;
  assetNo?: string;
  type?: ExceptionType;
  approvalStatus?: ApprovalStatus;
  handled?: boolean;
  reporter?: string;
  department?: string;
  location?: Partial<AssetLocation>;
  startTime?: string;
  endTime?: string;
}

export interface InventoryDataSnapshot {
  version: string;
  exportedAt: string;
  assets: Asset[];
  tasks: InventoryTask[];
  statusChanges: StatusChangeRecord[];
  exceptions: ExceptionRecord[];
  history: AssetHistoryRecord[];
  pendingActions: PendingAction[];
  reportVersions: InventoryReportVersion[];
}
