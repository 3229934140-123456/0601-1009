import { InventoryReport, InventoryReportVersion, ReportDiffItem, UnregisteredScanDetail, ExceptionWithAssetInfo, ScanWithAssetInfo } from '../types';
import { store } from '../store';
import { generateId, formatDate } from '../utils';
import { resultSummarizer } from './result-summarizer';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class ReportManager {
  createReportVersion(taskId: string, creator: string): InventoryReportVersion {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    const latest = store.getLatestReportVersion(taskId);
    const nextVersion = latest ? latest.version + 1 : 1;

    const report = deepClone(resultSummarizer.generateReport(taskId));

    const version: InventoryReportVersion = {
      id: generateId('rv_'),
      taskId,
      version: nextVersion,
      report,
      status: 'draft',
      creator,
      createdAt: formatDate()
    };

    if (latest) {
      version.differencesFromPrev = this.calculateDiff(latest.report, report);
    }

    store.addReportVersion(deepClone(version));
    return deepClone(version);
  }

  private calculateDiff(oldReport: InventoryReport, newReport: InventoryReport): ReportDiffItem[] {
    const diffs: ReportDiffItem[] = [];

    const countFields: { field: keyof InventoryReport; label: string }[] = [
      { field: 'totalAssets', label: '计划总数' },
      { field: 'scannedAssets', label: '已盘数量' },
      { field: 'unscannedAssets', label: '未盘数量' },
      { field: 'duplicateScans', label: '重复扫描' },
      { field: 'misplacedAssets', label: '错位资产' },
      { field: 'abnormalAssets', label: '异常资产' },
      { field: 'outOfPlanAssets', label: '非计划资产' },
      { field: 'unregisteredAssets', label: '未注册资产' },
      { field: 'pendingExceptions', label: '待处理异常' },
      { field: 'approvedExceptions', label: '已通过异常' },
      { field: 'rejectedExceptions', label: '已驳回异常' }
    ];

    for (const { field, label } of countFields) {
      const oldVal = oldReport[field] as number;
      const newVal = newReport[field] as number;
      if (oldVal !== newVal) {
        diffs.push({
          category: 'count',
          field,
          label,
          oldValue: oldVal,
          newValue: newVal,
          change: newVal - oldVal
        });
      }
    }

    const rateFields: { field: keyof InventoryReport; label: string }[] = [
      { field: 'completionRate', label: '完成率' },
      { field: 'accuracyRate', label: '准确率' }
    ];

    for (const { field, label } of rateFields) {
      const oldVal = oldReport[field] as number;
      const newVal = newReport[field] as number;
      if (Math.abs(oldVal - newVal) > 0.01) {
        diffs.push({
          category: 'rate',
          field,
          label,
          oldValue: oldVal,
          newValue: newVal,
          change: Math.round((newVal - oldVal) * 100) / 100
        });
      }
    }

    const assetListFields: { field: keyof InventoryReport; label: string; keyField: string }[] = [
      { field: 'unscannedAssetList', label: '未盘资产清单', keyField: 'assetNo' },
      { field: 'misplacedAssetList', label: '错位资产清单', keyField: 'assetNo' },
      { field: 'outOfPlanAssetList', label: '非计划资产清单', keyField: 'assetNo' },
      { field: 'abnormalAssetList', label: '异常资产清单', keyField: 'assetNo' }
    ];

    for (const { field, label, keyField } of assetListFields) {
      const oldList = oldReport[field] as any[];
      const newList = newReport[field] as any[];
      const oldKeys = new Set(oldList.map(a => a[keyField]));
      const newKeys = new Set(newList.map(a => a[keyField]));

      const addedItems: string[] = [];
      const removedItems: string[] = [];

      for (const item of newList) {
        if (!oldKeys.has(item[keyField])) {
          addedItems.push(item[keyField] + (item.name ? `（${item.name}）` : ''));
        }
      }

      for (const item of oldList) {
        if (!newKeys.has(item[keyField])) {
          removedItems.push(item[keyField] + (item.name ? `（${item.name}）` : ''));
        }
      }

      if (addedItems.length > 0 || removedItems.length > 0) {
        diffs.push({
          category: 'list',
          field,
          label,
          oldValue: oldList.length,
          newValue: newList.length,
          change: addedItems.length - removedItems.length,
          addedItems,
          removedItems
        });
      }
    }

    const unregisteredOld = oldReport.unregisteredScanDetails || [];
    const unregisteredNew = newReport.unregisteredScanDetails || [];
    const unregOldKeys = new Set(unregisteredOld.map(u => u.assetNo));
    const unregNewKeys = new Set(unregisteredNew.map(u => u.assetNo));
    const unregAdded: string[] = [];
    const unregRemoved: string[] = [];
    for (const u of unregisteredNew) {
      if (!unregOldKeys.has(u.assetNo)) {
        unregAdded.push(u.assetNo);
      }
    }
    for (const u of unregisteredOld) {
      if (!unregNewKeys.has(u.assetNo)) {
        unregRemoved.push(u.assetNo);
      }
    }
    if (unregAdded.length > 0 || unregRemoved.length > 0) {
      diffs.push({
        category: 'list',
        field: 'unregisteredScanDetails',
        label: '未注册资产',
        oldValue: unregisteredOld.length,
        newValue: unregisteredNew.length,
        change: unregAdded.length - unregRemoved.length,
        addedItems: unregAdded,
        removedItems: unregRemoved
      });
    }

    const exceptionListFields: { field: keyof InventoryReport; label: string; keyField: string }[] = [
      { field: 'pendingExceptionList', label: '待处理异常', keyField: 'id' },
      { field: 'approvedExceptionList', label: '已通过异常', keyField: 'id' },
      { field: 'rejectedExceptionList', label: '已驳回异常', keyField: 'id' }
    ];

    for (const { field, label, keyField } of exceptionListFields) {
      const oldList = oldReport[field] as any[];
      const newList = newReport[field] as any[];
      const oldKeys = new Set(oldList.map(e => e[keyField]));
      const newKeys = new Set(newList.map(e => e[keyField]));

      const addedItems: string[] = [];
      const removedItems: string[] = [];

      for (const item of newList) {
        if (!oldKeys.has(item[keyField])) {
          addedItems.push(`${item.assetNo} - ${item.type}`);
        }
      }

      for (const item of oldList) {
        if (!newKeys.has(item[keyField])) {
          removedItems.push(`${item.assetNo} - ${item.type}`);
        }
      }

      if (addedItems.length > 0 || removedItems.length > 0) {
        diffs.push({
          category: 'list',
          field,
          label,
          oldValue: oldList.length,
          newValue: newList.length,
          change: addedItems.length - removedItems.length,
          addedItems,
          removedItems
        });
      }
    }

    const dupOld = oldReport.duplicateScanList || [];
    const dupNew = newReport.duplicateScanList || [];
    const dupOldKeys = new Set(dupOld.map(d => d.id));
    const dupNewKeys = new Set(dupNew.map(d => d.id));
    const dupAdded: string[] = [];
    const dupRemoved: string[] = [];
    for (const d of dupNew) {
      if (!dupOldKeys.has(d.id)) {
        dupAdded.push(d.assetNo || d.id);
      }
    }
    for (const d of dupOld) {
      if (!dupNewKeys.has(d.id)) {
        dupRemoved.push(d.assetNo || d.id);
      }
    }
    if (dupAdded.length > 0 || dupRemoved.length > 0) {
      diffs.push({
        category: 'list',
        field: 'duplicateScanList',
        label: '重复扫描',
        oldValue: dupOld.length,
        newValue: dupNew.length,
        change: dupAdded.length - dupRemoved.length,
        addedItems: dupAdded,
        removedItems: dupRemoved
      });
    }

    return diffs;
  }

  freezeReport(versionId: string): InventoryReportVersion {
    const version = store.getReportVersionById(versionId);
    if (!version) {
      throw new Error(`报告版本 ${versionId} 不存在`);
    }
    if (version.status !== 'draft') {
      throw new Error(`只有草稿状态的报告才能冻结，当前状态: ${version.status}`);
    }
    const updated = store.updateReportVersion(versionId, {
      status: 'frozen',
      frozenAt: formatDate()
    })!;
    return deepClone(updated);
  }

  submitForReview(versionId: string): InventoryReportVersion {
    const version = store.getReportVersionById(versionId);
    if (!version) {
      throw new Error(`报告版本 ${versionId} 不存在`);
    }
    if (version.status !== 'frozen') {
      throw new Error(`只有冻结状态的报告才能提交复核，当前状态: ${version.status}`);
    }
    const updated = store.updateReportVersion(versionId, {
      status: 'reviewing'
    })!;
    return deepClone(updated);
  }

  approveReport(versionId: string, reviewer: string, comment?: string): InventoryReportVersion {
    const version = store.getReportVersionById(versionId);
    if (!version) {
      throw new Error(`报告版本 ${versionId} 不存在`);
    }
    if (version.status !== 'reviewing') {
      throw new Error(`只有复核中状态的报告才能通过，当前状态: ${version.status}`);
    }
    const updated = store.updateReportVersion(versionId, {
      status: 'approved',
      reviewer,
      reviewComment: comment,
      reviewTime: formatDate()
    })!;
    return deepClone(updated);
  }

  rejectReport(versionId: string, reviewer: string, comment: string): InventoryReportVersion {
    const version = store.getReportVersionById(versionId);
    if (!version) {
      throw new Error(`报告版本 ${versionId} 不存在`);
    }
    if (version.status !== 'reviewing') {
      throw new Error(`只有复核中状态的报告才能驳回，当前状态: ${version.status}`);
    }
    const updated = store.updateReportVersion(versionId, {
      status: 'rejected',
      reviewer,
      reviewComment: comment,
      reviewTime: formatDate()
    })!;
    return deepClone(updated);
  }

  regenerateAfterReject(taskId: string, creator: string): InventoryReportVersion {
    return this.createReportVersion(taskId, creator);
  }

  getReportVersions(taskId?: string): InventoryReportVersion[] {
    return store.getReportVersions(taskId).map(v => deepClone(v));
  }

  getLatestReportVersion(taskId: string): InventoryReportVersion | undefined {
    const latest = store.getLatestReportVersion(taskId);
    return latest ? deepClone(latest) : undefined;
  }

  getReportVersionById(id: string): InventoryReportVersion | undefined {
    const version = store.getReportVersionById(id);
    return version ? deepClone(version) : undefined;
  }
}

export const reportManager = new ReportManager();
