import {
  InventoryTask,
  Asset,
  ScanStatus,
  InventoryReport,
  DepartmentSummary,
  DifferenceItem,
  ExceptionType
} from '../types';
import { store } from '../store';
import { formatDate, formatLocation } from '../utils';

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
      if (scan.status === ScanStatus.UNREGISTERED) {
        unregistered.add(scan.assetNo);
      }
    }
    return Array.from(unregistered);
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

  generateReport(taskId: string): InventoryReport {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    const totalAssets = task.planAssetIds.length;
    const unscannedAssets = this.getUnscannedAssets(taskId);
    const misplacedAssets = this.getMisplacedAssets(taskId);
    const duplicateScans = this.getDuplicateScanCount(taskId);
    const completionRate = this.calculateCompletionRate(taskId);
    const accuracyRate = this.calculateAccuracyRate(taskId);
    const departmentSummaries = this.summarizeByDepartment(taskId);
    const differenceList = this.generateDifferenceList(taskId);

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

    const scannedAssets = task.planAssetIds.filter(id => scannedAssetIds.has(id)).length;
    const abnormalAssets = task.planAssetIds.filter(id => abnormalAssetIds.has(id)).length;

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
      totalAssets,
      scannedAssets,
      unscannedAssets: unscannedAssets.length,
      duplicateScans,
      misplacedAssets: misplacedAssets.length,
      abnormalAssets,
      completionRate,
      accuracyRate,
      departmentSummaries,
      unscannedAssetList: unscannedAssets,
      misplacedAssetList: misplacedAssets,
      abnormalAssetList,
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
    const task = store.getTaskById(taskId);
    if (!task) {
      return {
        total: 0,
        scanned: 0,
        unscanned: 0,
        normal: 0,
        misplaced: 0,
        duplicate: 0,
        unregistered: 0,
        completionRate: 0,
        accuracyRate: 0
      };
    }

    const total = task.planAssetIds.length;
    const scannedAssetIds = new Set<string>();
    const misplacedAssetIds = new Set<string>();
    let duplicateCount = 0;
    let unregisteredCount = 0;

    for (const scan of task.actualScans) {
      if (scan.isDuplicate) {
        duplicateCount++;
        continue;
      }
      if (scan.status === ScanStatus.UNREGISTERED) {
        unregisteredCount++;
        continue;
      }
      if (scan.assetId) {
        scannedAssetIds.add(scan.assetId);
        if (scan.status === ScanStatus.MISPLACED) {
          misplacedAssetIds.add(scan.assetId);
        }
      }
    }

    const inPlanScanned = task.planAssetIds.filter(id => scannedAssetIds.has(id)).length;
    const unscanned = total - inPlanScanned;
    const normal = inPlanScanned - misplacedAssetIds.size;
    const completionRate = total > 0 ? Math.round((inPlanScanned / total) * 10000) / 100 : 0;
    const accuracyRate = inPlanScanned > 0 ? Math.round((normal / inPlanScanned) * 10000) / 100 : 0;

    return {
      total,
      scanned: inPlanScanned,
      unscanned,
      normal,
      misplaced: misplacedAssetIds.size,
      duplicate: duplicateCount,
      unregistered: unregisteredCount,
      completionRate,
      accuracyRate
    };
  }
}

export const resultSummarizer = new ResultSummarizer();
