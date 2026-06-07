import {
  InventoryTask,
  Asset,
  ScanStatus,
  InventoryReport,
  DepartmentSummary,
  DifferenceItem,
  ExceptionType,
  InventoryScope,
  ApprovalStatus,
  UnregisteredScanDetail,
  ExceptionWithAssetInfo,
  ScanWithAssetInfo
} from '../types';
import { store } from '../store';
import { formatDate, formatLocation } from '../utils';

export interface DetailedTaskStats {
  totalPlanAssets: number;
  scannedInPlan: number;
  unscannedInPlan: number;
  outOfPlanScanned: number;
  duplicateScans: number;
  misplacedInPlan: number;
  unregisteredAssets: number;
  normalInPlan: number;
  completionRate: number;
  accuracyRate: number;
}

export interface ScannerSummary {
  scanner: string;
  totalScans: number;
  uniqueAssets: number;
  duplicates: number;
  misplaced: number;
  unregistered: number;
  outOfPlan: number;
}

export interface ScopeSummary {
  scopeId: string;
  scopeName: string;
  scopeType: InventoryScope['type'];
  scopeValue: string;
  totalAssets: number;
  scannedAssets: number;
  unscannedAssets: number;
  completionRate: number;
  assignedScanner?: string;
}

export class ResultSummarizer {
  calculateCompletionRate(taskId: string): number {
    const task = store.getTaskById(taskId);
    if (!task || task.planAssetIds.length === 0) return 0;

    const scannedAssetIds = new Set<string>();
    for (const scan of task.actualScans) {
      if (scan.assetId && !scan.isDuplicate) {
        scannedAssetIds.add(scan.assetId);
      }
    }

    let inPlanScanned = 0;
    for (const planId of task.planAssetIds) {
      if (scannedAssetIds.has(planId)) {
        inPlanScanned++;
      }
    }

    return Math.round((inPlanScanned / task.planAssetIds.length) * 10000) / 100;
  }

  getUnscannedAssets(taskId: string): Asset[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const scannedAssetIds = new Set<string>();
    for (const scan of task.actualScans) {
      if (scan.assetId && !scan.isDuplicate) {
        scannedAssetIds.add(scan.assetId);
      }
    }

    return task.planAssetIds
      .filter(id => !scannedAssetIds.has(id))
      .map(id => store.getAssetById(id))
      .filter((a): a is Asset => !!a);
  }

  getMisplacedAssets(taskId: string): Asset[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const misplacedAssetIds = new Set<string>();
    for (const scan of task.actualScans) {
      if (scan.status === ScanStatus.MISPLACED && !scan.isDuplicate) {
        misplacedAssetIds.add(scan.assetId);
      }
    }

    return Array.from(misplacedAssetIds)
      .map(id => store.getAssetById(id))
      .filter((a): a is Asset => !!a);
  }

  getOutOfPlanAssets(taskId: string): Asset[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const planSet = new Set(task.planAssetIds);
    const scannedAssetIds = new Set<string>();

    for (const scan of task.actualScans) {
      if (scan.assetId && !scan.isDuplicate && !planSet.has(scan.assetId)) {
        scannedAssetIds.add(scan.assetId);
      }
    }

    return Array.from(scannedAssetIds)
      .map(id => store.getAssetById(id))
      .filter((a): a is Asset => !!a);
  }

  getDuplicateScanCount(taskId: string): number {
    const task = store.getTaskById(taskId);
    if (!task) return 0;

    let count = 0;
    for (const scan of task.actualScans) {
      if (scan.isDuplicate) count++;
    }
    return count;
  }

  getUnregisteredAssets(taskId: string): string[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const unregistered = new Set<string>();
    for (const scan of task.actualScans) {
      if (scan.status === ScanStatus.UNREGISTERED && !scan.isDuplicate) {
        unregistered.add(scan.assetNo);
      }
    }
    return Array.from(unregistered);
  }

  getUnregisteredScanDetails(taskId: string): UnregisteredScanDetail[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const detailMap = new Map<string, {
      assetNo: string;
      firstScanTime: string;
      lastScanTime: string;
      scanner: string;
      scanLocation?: any;
      count: number;
    }>();

    for (const scan of task.actualScans) {
      if (scan.status !== ScanStatus.UNREGISTERED) continue;

      const existing = detailMap.get(scan.assetNo);
      if (!existing) {
        detailMap.set(scan.assetNo, {
          assetNo: scan.assetNo,
          firstScanTime: scan.scanTime,
          lastScanTime: scan.scanTime,
          scanner: scan.scanner,
          scanLocation: scan.scanLocation,
          count: 1
        });
      } else {
        existing.lastScanTime = scan.scanTime;
        existing.count++;
        if (!existing.scanLocation && scan.scanLocation) {
          existing.scanLocation = scan.scanLocation;
        }
      }
    }

    return Array.from(detailMap.values()).map(d => ({
      assetNo: d.assetNo,
      scanTime: d.lastScanTime,
      scanner: d.scanner,
      scanLocation: d.scanLocation,
      scanCount: d.count
    }));
  }

  generateDifferenceList(taskId: string): DifferenceItem[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const differences: DifferenceItem[] = [];

    const unscanned = this.getUnscannedAssets(taskId);
    for (const asset of unscanned) {
      differences.push({
        assetNo: asset.assetNo,
        assetName: asset.name,
        differenceType: 'missing',
        description: `资产未在盘点中扫描到，应有位置：${formatLocation(asset.location)}`
      });
    }

    const misplaced = this.getMisplacedAssets(taskId);
    for (const asset of misplaced) {
      const misplacedScan = task.actualScans.find(
        s => s.assetId === asset.id && s.status === ScanStatus.MISPLACED
      );
      differences.push({
        assetNo: asset.assetNo,
        assetName: asset.name,
        differenceType: 'misplaced',
        description: `位置错位，应有：${formatLocation(asset.location)}，实际：${misplacedScan?.scanLocation ? formatLocation(misplacedScan.scanLocation) : '未知'}`
      });
    }

    const damagedAssets = store.getAssets().filter(a =>
      task.planAssetIds.includes(a.id) &&
      a.status === 'damaged'
    );
    for (const asset of damagedAssets) {
      differences.push({
        assetNo: asset.assetNo,
        assetName: asset.name,
        differenceType: 'damaged',
        description: '资产状态为损坏'
      });
    }

    const unregistered = this.getUnregisteredAssets(taskId);
    for (const assetNo of unregistered) {
      differences.push({
        assetNo,
        assetName: '未注册资产',
        differenceType: 'unregistered',
        description: '扫描到未在系统中注册的资产'
      });
    }

    return differences;
  }

  calculateAccuracyRate(taskId: string): number {
    const task = store.getTaskById(taskId);
    if (!task || task.planAssetIds.length === 0) return 100;

    const scannedAssetIds = new Set<string>();
    const misplacedAssetIds = new Set<string>();

    for (const scan of task.actualScans) {
      if (scan.assetId && !scan.isDuplicate) {
        scannedAssetIds.add(scan.assetId);
        if (scan.status === ScanStatus.MISPLACED) {
          misplacedAssetIds.add(scan.assetId);
        }
      }
    }

    const inPlanScanned = task.planAssetIds.filter(id => scannedAssetIds.has(id)).length;
    if (inPlanScanned === 0) return 0;

    const normalCount = inPlanScanned - misplacedAssetIds.size;
    return Math.round((normalCount / inPlanScanned) * 10000) / 100;
  }

  summarizeByDepartment(taskId: string): DepartmentSummary[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const deptMap = new Map<string, {
      totalAssets: number;
      scannedAssets: number;
      unscannedAssets: number;
      normalAssets: number;
      abnormalAssets: number;
    }>();

    const scannedAssetIds = new Set<string>();
    const abnormalAssetIds = new Set<string>();

    for (const scan of task.actualScans) {
      if (scan.assetId && !scan.isDuplicate) {
        scannedAssetIds.add(scan.assetId);
        if (scan.status !== ScanStatus.NORMAL) {
          abnormalAssetIds.add(scan.assetId);
        }
      }
    }

    for (const planId of task.planAssetIds) {
      const asset = store.getAssetById(planId);
      if (!asset) continue;

      if (!deptMap.has(asset.department)) {
        deptMap.set(asset.department, {
          totalAssets: 0,
          scannedAssets: 0,
          unscannedAssets: 0,
          normalAssets: 0,
          abnormalAssets: 0
        });
      }

      const dept = deptMap.get(asset.department)!;
      dept.totalAssets++;

      if (scannedAssetIds.has(planId)) {
        dept.scannedAssets++;
        if (abnormalAssetIds.has(planId)) {
          dept.abnormalAssets++;
        } else {
          dept.normalAssets++;
        }
      } else {
        dept.unscannedAssets++;
      }
    }

    const summaries: DepartmentSummary[] = [];
    for (const [department, data] of deptMap) {
      summaries.push({
        department,
        totalAssets: data.totalAssets,
        scannedAssets: data.scannedAssets,
        unscannedAssets: data.unscannedAssets,
        normalAssets: data.normalAssets,
        abnormalAssets: data.abnormalAssets,
        completionRate: data.totalAssets > 0
          ? Math.round((data.scannedAssets / data.totalAssets) * 10000) / 100
          : 0
      });
    }

    return summaries.sort((a, b) => b.completionRate - a.completionRate);
  }

  summarizeByScanner(taskId: string): ScannerSummary[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const scannerMap = new Map<string, {
      totalScans: number;
      uniqueIds: Set<string>;
      duplicates: number;
      misplaced: number;
      unregistered: number;
      outOfPlan: number;
    }>();

    const planSet = new Set(task.planAssetIds);

    for (const scan of task.actualScans) {
      if (!scannerMap.has(scan.scanner)) {
        scannerMap.set(scan.scanner, {
          totalScans: 0,
          uniqueIds: new Set(),
          duplicates: 0,
          misplaced: 0,
          unregistered: 0,
          outOfPlan: 0
        });
      }

      const stats = scannerMap.get(scan.scanner)!;
      stats.totalScans++;

      if (scan.isDuplicate) {
        stats.duplicates++;
      } else if (scan.status === ScanStatus.UNREGISTERED) {
        stats.unregistered++;
      } else if (scan.assetId) {
        stats.uniqueIds.add(scan.assetId);
        if (scan.status === ScanStatus.MISPLACED) {
          stats.misplaced++;
        }
        if (!planSet.has(scan.assetId)) {
          stats.outOfPlan++;
        }
      }
    }

    const summaries: ScannerSummary[] = [];
    for (const [scanner, data] of scannerMap) {
      summaries.push({
        scanner,
        totalScans: data.totalScans,
        uniqueAssets: data.uniqueIds.size,
        duplicates: data.duplicates,
        misplaced: data.misplaced,
        unregistered: data.unregistered,
        outOfPlan: data.outOfPlan
      });
    }

    return summaries.sort((a, b) => b.totalScans - a.totalScans);
  }

  summarizeByScope(taskId: string): ScopeSummary[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const scannedIds = new Set<string>();
    for (const scan of task.actualScans) {
      if (scan.assetId && !scan.isDuplicate) {
        scannedIds.add(scan.assetId);
      }
    }

    const summaries: ScopeSummary[] = [];
    for (const scope of task.scopes) {
      let scanned = 0;
      for (const assetId of scope.assetIds) {
        if (scannedIds.has(assetId)) {
          scanned++;
        }
      }

      summaries.push({
        scopeId: scope.id,
        scopeName: scope.name,
        scopeType: scope.type,
        scopeValue: scope.value,
        totalAssets: scope.assetIds.length,
        scannedAssets: scanned,
        unscannedAssets: scope.assetIds.length - scanned,
        completionRate: scope.assetIds.length > 0
          ? Math.round((scanned / scope.assetIds.length) * 10000) / 100
          : 0,
        assignedScanner: scope.assignedScanner
      });
    }

    return summaries.sort((a, b) => b.completionRate - a.completionRate);
  }

  getDetailedStats(taskId: string): DetailedTaskStats {
    const task = store.getTaskById(taskId);
    if (!task) {
      return {
        totalPlanAssets: 0,
        scannedInPlan: 0,
        unscannedInPlan: 0,
        outOfPlanScanned: 0,
        duplicateScans: 0,
        misplacedInPlan: 0,
        unregisteredAssets: 0,
        normalInPlan: 0,
        completionRate: 0,
        accuracyRate: 0
      };
    }

    const planSet = new Set(task.planAssetIds);
    const scannedInPlanIds = new Set<string>();
    const misplacedInPlanIds = new Set<string>();
    const outOfPlanIds = new Set<string>();
    let duplicateCount = 0;
    const unregisteredSet = new Set<string>();

    for (const scan of task.actualScans) {
      if (scan.isDuplicate) {
        duplicateCount++;
        continue;
      }
      if (scan.status === ScanStatus.UNREGISTERED) {
        unregisteredSet.add(scan.assetNo);
        continue;
      }
      if (scan.assetId) {
        if (planSet.has(scan.assetId)) {
          scannedInPlanIds.add(scan.assetId);
          if (scan.status === ScanStatus.MISPLACED) {
            misplacedInPlanIds.add(scan.assetId);
          }
        } else {
          outOfPlanIds.add(scan.assetId);
        }
      }
    }

    const total = task.planAssetIds.length;
    const scanned = scannedInPlanIds.size;
    const unscanned = total - scanned;
    const normal = scanned - misplacedInPlanIds.size;
    const completionRate = total > 0 ? Math.round((scanned / total) * 10000) / 100 : 0;
    const accuracyRate = scanned > 0 ? Math.round((normal / scanned) * 10000) / 100 : 0;

    return {
      totalPlanAssets: total,
      scannedInPlan: scanned,
      unscannedInPlan: unscanned,
      outOfPlanScanned: outOfPlanIds.size,
      duplicateScans: duplicateCount,
      misplacedInPlan: misplacedInPlanIds.size,
      unregisteredAssets: unregisteredSet.size,
      normalInPlan: normal,
      completionRate,
      accuracyRate
    };
  }

  getExceptionListWithAssetInfo(taskId: string, approvalStatus?: ApprovalStatus): ExceptionWithAssetInfo[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const exceptions = store.getExceptions(undefined, taskId);
    const filtered = approvalStatus !== undefined
      ? exceptions.filter(e => e.approvalStatus === approvalStatus)
      : exceptions;

    return filtered.map(e => {
      const asset = e.assetId ? store.getAssetById(e.assetId) : undefined;
      return {
        ...e,
        assetName: asset?.name,
        assetCategory: asset?.category,
        currentLocation: asset?.location,
        responsiblePerson: asset?.responsiblePerson,
        department: asset?.department
      };
    });
  }

  getDuplicateScanList(taskId: string): ScanWithAssetInfo[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const planSet = new Set(task.planAssetIds);
    const duplicates = task.actualScans.filter(s => s.isDuplicate);

    return duplicates.map(scan => {
      const asset = scan.assetId ? store.getAssetById(scan.assetId) : undefined;
      return {
        ...scan,
        assetName: asset?.name,
        assetCategory: asset?.category,
        assetStatus: asset?.status,
        currentLocation: asset?.location,
        responsiblePerson: asset?.responsiblePerson,
        department: asset?.department,
        inPlan: scan.assetId ? planSet.has(scan.assetId) : false
      };
    });
  }

  generateReport(taskId: string): InventoryReport {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    const stats = this.getDetailedStats(taskId);
    const unscannedAssets = this.getUnscannedAssets(taskId);
    const misplacedAssets = this.getMisplacedAssets(taskId);
    const outOfPlanAssets = this.getOutOfPlanAssets(taskId);
    const unregisteredAssetList = this.getUnregisteredAssets(taskId);
    const unregisteredScanDetails = this.getUnregisteredScanDetails(taskId);
    const departmentSummaries = this.summarizeByDepartment(taskId);
    const differenceList = this.generateDifferenceList(taskId);
    const pendingExceptionList = this.getExceptionListWithAssetInfo(taskId, ApprovalStatus.PENDING);
    const approvedExceptionList = this.getExceptionListWithAssetInfo(taskId, ApprovalStatus.APPROVED);
    const rejectedExceptionList = this.getExceptionListWithAssetInfo(taskId, ApprovalStatus.REJECTED);
    const duplicateScanList = this.getDuplicateScanList(taskId);

    const abnormalAssetIds = new Set<string>();
    for (const scan of task.actualScans) {
      if (scan.assetId && !scan.isDuplicate && scan.status !== ScanStatus.NORMAL) {
        abnormalAssetIds.add(scan.assetId);
      }
    }

    const abnormalAssetList = task.planAssetIds
      .filter(id => abnormalAssetIds.has(id))
      .map(id => store.getAssetById(id))
      .filter((a): a is Asset => !!a);

    return {
      taskId: task.id,
      taskName: task.name,
      batchNo: task.batchNo,
      startTime: task.startTime,
      endTime: task.endTime,
      totalAssets: stats.totalPlanAssets,
      scannedAssets: stats.scannedInPlan,
      unscannedAssets: stats.unscannedInPlan,
      duplicateScans: stats.duplicateScans,
      misplacedAssets: stats.misplacedInPlan,
      abnormalAssets: abnormalAssetList.length,
      outOfPlanAssets: outOfPlanAssets.length,
      unregisteredAssets: unregisteredAssetList.length,
      pendingExceptions: pendingExceptionList.length,
      approvedExceptions: approvedExceptionList.length,
      rejectedExceptions: rejectedExceptionList.length,
      completionRate: stats.completionRate,
      accuracyRate: stats.accuracyRate,
      departmentSummaries,
      unscannedAssetList: unscannedAssets,
      misplacedAssetList: misplacedAssets,
      abnormalAssetList,
      outOfPlanAssetList: outOfPlanAssets,
      unregisteredAssetList,
      unregisteredScanDetails,
      pendingExceptionList,
      approvedExceptionList,
      rejectedExceptionList,
      duplicateScanList,
      differenceList,
      generatedAt: formatDate()
    };
  }

  getTaskStats(taskId: string): {
    total: number;
    scanned: number;
    unscanned: number;
    normal: number;
    misplaced: number;
    duplicate: number;
    unregistered: number;
    completionRate: number;
    accuracyRate: number;
  } {
    const stats = this.getDetailedStats(taskId);
    return {
      total: stats.totalPlanAssets,
      scanned: stats.scannedInPlan,
      unscanned: stats.unscannedInPlan,
      normal: stats.normalInPlan,
      misplaced: stats.misplacedInPlan,
      duplicate: stats.duplicateScans,
      unregistered: stats.unregisteredAssets,
      completionRate: stats.completionRate,
      accuracyRate: stats.accuracyRate
    };
  }
}

export const resultSummarizer = new ResultSummarizer();
