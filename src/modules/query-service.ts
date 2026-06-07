import {
  InventoryScan,
  ScanWithAssetInfo,
  ExceptionWithAssetInfo,
  ScanQueryParams,
  ExceptionQueryParams,
  PaginationResult,
  Asset,
  ScanStatus,
  ExceptionType,
  ApprovalStatus
} from '../types';
import { store } from '../store';
import { AssetLocation } from '../types';

function locationMatches(assetLocation: AssetLocation | undefined, queryLocation: Partial<AssetLocation> | undefined): boolean {
  if (!queryLocation) return true;
  if (!assetLocation) return false;

  if (queryLocation.building && assetLocation.building !== queryLocation.building) return false;
  if (queryLocation.floor && assetLocation.floor !== queryLocation.floor) return false;
  if (queryLocation.room && assetLocation.room !== queryLocation.room) return false;
  if (queryLocation.position && assetLocation.position !== queryLocation.position) return false;

  return true;
}

export class QueryService {
  queryScans(params: ScanQueryParams): PaginationResult<ScanWithAssetInfo> {
    let scans: InventoryScan[] = [];

    if (params.taskId) {
      const task = store.getTaskById(params.taskId);
      if (task) {
        scans = [...task.actualScans];
      }
    } else {
      for (const task of store.getTasks()) {
        scans.push(...task.actualScans);
      }
    }

    const planAssetMap = new Map<string, Set<string>>();
    for (const task of store.getTasks()) {
      planAssetMap.set(task.id, new Set(task.planAssetIds));
    }

    const filtered = scans.filter(scan => {
      if (params.assetNo && scan.assetNo !== params.assetNo) return false;
      if (params.scanner && scan.scanner !== params.scanner) return false;
      if (params.status && scan.status !== params.status) return false;
      if (params.isDuplicate !== undefined && scan.isDuplicate !== params.isDuplicate) return false;
      if (params.startTime && scan.scanTime < params.startTime) return false;
      if (params.endTime && scan.scanTime > params.endTime) return false;

      const taskId = params.taskId || this.findScanTaskId(scan.id);
      const planSet = taskId ? planAssetMap.get(taskId) : undefined;

      if (params.inPlan !== undefined && scan.assetId) {
        const inPlan = planSet ? planSet.has(scan.assetId) : false;
        if (inPlan !== params.inPlan) return false;
      }

      const asset = scan.assetId ? store.getAssetById(scan.assetId) : undefined;

      if (params.department) {
        if (asset?.department !== params.department) return false;
      }

      if (params.location) {
        if (scan.scanLocation) {
          if (!locationMatches(scan.scanLocation, params.location)) return false;
        } else if (asset?.location) {
          if (!locationMatches(asset.location, params.location)) return false;
        } else {
          return false;
        }
      }

      return true;
    });

    const list: ScanWithAssetInfo[] = filtered.map(scan => {
      const asset = scan.assetId ? store.getAssetById(scan.assetId) : undefined;
      const taskId = this.findScanTaskId(scan.id);
      const planSet = taskId ? planAssetMap.get(taskId) : undefined;
      const inPlan = scan.assetId && planSet ? planSet.has(scan.assetId) : false;

      return {
        ...scan,
        assetName: asset?.name,
        assetCategory: asset?.category,
        assetStatus: asset?.status,
        currentLocation: asset?.location,
        responsiblePerson: asset?.responsiblePerson,
        department: asset?.department,
        inPlan
      };
    });

    const { page = 1, pageSize = 20 } = params;
    const total = list.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      list: list.slice(start, end),
      total,
      page,
      pageSize
    };
  }

  private findScanTaskId(scanId: string): string | undefined {
    for (const task of store.getTasks()) {
      if (task.actualScans.some(s => s.id === scanId)) {
        return task.id;
      }
    }
    return undefined;
  }

  queryExceptions(params: ExceptionQueryParams): PaginationResult<ExceptionWithAssetInfo> {
    let exceptions = store.getExceptions();

    const filtered = exceptions.filter(exception => {
      if (params.taskId && exception.taskId !== params.taskId) return false;
      if (params.assetId && exception.assetId !== params.assetId) return false;
      if (params.assetNo && exception.assetNo !== params.assetNo) return false;
      if (params.type && exception.type !== params.type) return false;
      if (params.approvalStatus && exception.approvalStatus !== params.approvalStatus) return false;
      if (params.handled !== undefined && exception.handled !== params.handled) return false;
      if (params.reporter && exception.reporter !== params.reporter) return false;
      if (params.startTime && exception.timestamp < params.startTime) return false;
      if (params.endTime && exception.timestamp > params.endTime) return false;

      if (params.department || params.location) {
        const asset = exception.assetId ? store.getAssetById(exception.assetId) : undefined;
        if (params.department && asset?.department !== params.department) return false;
        if (params.location && !locationMatches(asset?.location, params.location)) return false;
      }

      return true;
    });

    const list: ExceptionWithAssetInfo[] = filtered.map(exception => {
      const asset = exception.assetId ? store.getAssetById(exception.assetId) : undefined;
      return {
        ...exception,
        assetName: asset?.name,
        assetCategory: asset?.category,
        currentLocation: asset?.location,
        responsiblePerson: asset?.responsiblePerson,
        department: asset?.department
      };
    });

    const { page = 1, pageSize = 20 } = params;
    const total = list.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      list: list.slice(start, end),
      total,
      page,
      pageSize
    };
  }
}

export const queryService = new QueryService();
