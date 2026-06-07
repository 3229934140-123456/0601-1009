import { InventoryReport, InventoryReportVersion, ReportDiffItem } from '../types';
import { store } from '../store';
import { generateId, formatDate } from '../utils';
import { resultSummarizer } from './result-summarizer';

export class ReportManager {
  createReportVersion(taskId: string, creator: string): InventoryReportVersion {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    const latest = store.getLatestReportVersion(taskId);
    const nextVersion = latest ? latest.version + 1 : 1;

    const report = resultSummarizer.generateReport(taskId);

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

    store.addReportVersion(version);
    return version;
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
      { field: 'approvedExceptions', label: '已审批异常' },
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

    const listFields: { field: keyof InventoryReport; label: string; keyField?: string }[] = [
      { field: 'unscannedAssetList', label: '未盘资产清单', keyField: 'assetNo' },
      { field: 'misplacedAssetList', label: '错位资产清单', keyField: 'assetNo' },
      { field: 'outOfPlanAssetList', label: '非计划资产清单', keyField: 'assetNo' }
    ];

    for (const { field, label, keyField } of listFields) {
      const oldList = oldReport[field] as any[];
      const newList = newReport[field] as any[];
      const oldKeys = new Set(oldList.map(a => a[keyField!]));
      const newKeys = new Set(newList.map(a => a[keyField!]));
      const added = newList.filter(a => !oldKeys.has(a[keyField!])).length;
      const removed = oldList.filter(a => !newKeys.has(a[keyField!])).length;
      if (added > 0 || removed > 0) {
        diffs.push({
          category: 'list',
          field,
          label,
          oldValue: oldList.length,
          newValue: newList.length,
          change: added - removed
        });
      }
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
    return store.updateReportVersion(versionId, {
      status: 'frozen',
      frozenAt: formatDate()
    })!;
  }

  submitForReview(versionId: string): InventoryReportVersion {
    const version = store.getReportVersionById(versionId);
    if (!version) {
      throw new Error(`报告版本 ${versionId} 不存在`);
    }
    if (version.status !== 'frozen') {
      throw new Error(`只有冻结状态的报告才能提交复核，当前状态: ${version.status}`);
    }
    return store.updateReportVersion(versionId, {
      status: 'reviewing'
    })!;
  }

  approveReport(versionId: string, reviewer: string, comment?: string): InventoryReportVersion {
    const version = store.getReportVersionById(versionId);
    if (!version) {
      throw new Error(`报告版本 ${versionId} 不存在`);
    }
    if (version.status !== 'reviewing') {
      throw new Error(`只有复核中状态的报告才能通过，当前状态: ${version.status}`);
    }
    return store.updateReportVersion(versionId, {
      status: 'approved',
      reviewer,
      reviewComment: comment,
      reviewTime: formatDate()
    })!;
  }

  rejectReport(versionId: string, reviewer: string, comment: string): InventoryReportVersion {
    const version = store.getReportVersionById(versionId);
    if (!version) {
      throw new Error(`报告版本 ${versionId} 不存在`);
    }
    if (version.status !== 'reviewing') {
      throw new Error(`只有复核中状态的报告才能驳回，当前状态: ${version.status}`);
    }
    return store.updateReportVersion(versionId, {
      status: 'rejected',
      reviewer,
      reviewComment: comment,
      reviewTime: formatDate()
    })!;
  }

  regenerateAfterReject(taskId: string, creator: string): InventoryReportVersion {
    return this.createReportVersion(taskId, creator);
  }

  getReportVersions(taskId?: string): InventoryReportVersion[] {
    return store.getReportVersions(taskId);
  }

  getLatestReportVersion(taskId: string): InventoryReportVersion | undefined {
    return store.getLatestReportVersion(taskId);
  }

  getReportVersionById(id: string): InventoryReportVersion | undefined {
    return store.getReportVersionById(id);
  }
}

export const reportManager = new ReportManager();
