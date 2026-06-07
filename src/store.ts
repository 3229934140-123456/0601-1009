import {
  Asset,
  InventoryTask,
  InventoryScan,
  StatusChangeRecord,
  ExceptionRecord,
  AssetHistoryRecord,
  InventoryDataSnapshot,
  PendingAction,
  InventoryReportVersion
} from './types';
import { formatDate } from './utils';

export class DataStore {
  private assets: Map<string, Asset> = new Map();
  private tasks: Map<string, InventoryTask> = new Map();
  private statusChanges: StatusChangeRecord[] = [];
  private exceptions: ExceptionRecord[] = [];
  private history: AssetHistoryRecord[] = [];
  private pendingActions: PendingAction[] = [];
  private reportVersions: InventoryReportVersion[] = [];

  getAssets(): Asset[] {
    return Array.from(this.assets.values());
  }

  getAssetById(id: string): Asset | undefined {
    return this.assets.get(id);
  }

  getAssetByNo(assetNo: string): Asset | undefined {
    return this.getAssets().find(a => a.assetNo === assetNo);
  }

  addAsset(asset: Asset): void {
    this.assets.set(asset.id, asset);
  }

  updateAsset(asset: Asset): void {
    this.assets.set(asset.id, asset);
  }

  deleteAsset(id: string): boolean {
    return this.assets.delete(id);
  }

  getTasks(): InventoryTask[] {
    return Array.from(this.tasks.values());
  }

  getTaskById(id: string): InventoryTask | undefined {
    return this.tasks.get(id);
  }

  getTaskByBatchNo(batchNo: string): InventoryTask | undefined {
    return this.getTasks().find(t => t.batchNo === batchNo);
  }

  addTask(task: InventoryTask): void {
    this.tasks.set(task.id, task);
  }

  updateTask(task: InventoryTask): void {
    this.tasks.set(task.id, task);
  }

  getStatusChanges(assetId?: string): StatusChangeRecord[] {
    if (assetId) {
      return this.statusChanges.filter(r => r.assetId === assetId);
    }
    return this.statusChanges;
  }

  addStatusChange(record: StatusChangeRecord): void {
    this.statusChanges.push(record);
  }

  getExceptions(assetId?: string, taskId?: string): ExceptionRecord[] {
    return this.exceptions.filter(e => {
      if (assetId && e.assetId !== assetId) return false;
      if (taskId && e.taskId !== taskId) return false;
      return true;
    });
  }

  addException(record: ExceptionRecord): void {
    this.exceptions.push(record);
  }

  updateException(id: string, updates: Partial<ExceptionRecord>): ExceptionRecord | undefined {
    const index = this.exceptions.findIndex(e => e.id === id);
    if (index === -1) return undefined;
    this.exceptions[index] = { ...this.exceptions[index], ...updates };
    return this.exceptions[index];
  }

  getExceptionById(id: string): ExceptionRecord | undefined {
    return this.exceptions.find(e => e.id === id);
  }

  getHistory(assetId?: string): AssetHistoryRecord[] {
    if (assetId) {
      return this.history.filter(h => h.assetId === assetId);
    }
    return this.history;
  }

  addHistory(record: AssetHistoryRecord): void {
    this.history.push(record);
  }

  getPendingActions(params?: {
    status?: PendingAction['status'];
    type?: PendingAction['type'];
    assignee?: string;
    assetId?: string;
  }): PendingAction[] {
    let actions = [...this.pendingActions];

    if (params?.status) {
      actions = actions.filter(a => a.status === params.status);
    }
    if (params?.type) {
      actions = actions.filter(a => a.type === params.type);
    }
    if (params?.assignee) {
      actions = actions.filter(a => a.assignee === params.assignee);
    }
    if (params?.assetId) {
      actions = actions.filter(a => a.assetId === params.assetId);
    }

    return actions.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  addPendingAction(action: PendingAction): void {
    this.pendingActions.push(action);
  }

  updatePendingAction(id: string, updates: Partial<PendingAction>): PendingAction | undefined {
    const index = this.pendingActions.findIndex(a => a.id === id);
    if (index === -1) return undefined;
    this.pendingActions[index] = { ...this.pendingActions[index], ...updates };
    return this.pendingActions[index];
  }

  getPendingActionById(id: string): PendingAction | undefined {
    return this.pendingActions.find(a => a.id === id);
  }

  getReportVersions(taskId?: string): InventoryReportVersion[] {
    let versions = [...this.reportVersions];
    if (taskId) {
      versions = versions.filter(v => v.taskId === taskId);
    }
    return versions.sort((a, b) => b.version - a.version);
  }

  getLatestReportVersion(taskId: string): InventoryReportVersion | undefined {
    const versions = this.getReportVersions(taskId);
    return versions[0];
  }

  getReportVersionById(id: string): InventoryReportVersion | undefined {
    return this.reportVersions.find(v => v.id === id);
  }

  addReportVersion(version: InventoryReportVersion): void {
    this.reportVersions.push(version);
  }

  updateReportVersion(id: string, updates: Partial<InventoryReportVersion>): InventoryReportVersion | undefined {
    const index = this.reportVersions.findIndex(v => v.id === id);
    if (index === -1) return undefined;
    this.reportVersions[index] = { ...this.reportVersions[index], ...updates };
    return this.reportVersions[index];
  }

  clear(): void {
    this.assets.clear();
    this.tasks.clear();
    this.statusChanges = [];
    this.exceptions = [];
    this.history = [];
    this.pendingActions = [];
    this.reportVersions = [];
  }

  exportSnapshot(): InventoryDataSnapshot {
    return {
      version: '1.0.0',
      exportedAt: formatDate(),
      assets: Array.from(this.assets.values()),
      tasks: Array.from(this.tasks.values()),
      statusChanges: [...this.statusChanges],
      exceptions: [...this.exceptions],
      history: [...this.history],
      pendingActions: [...this.pendingActions],
      reportVersions: [...this.reportVersions]
    };
  }

  exportJSON(): string {
    return JSON.stringify(this.exportSnapshot(), null, 2);
  }

  importSnapshot(snapshot: InventoryDataSnapshot, mode: 'merge' | 'replace' = 'replace'): {
    assets: number;
    tasks: number;
    statusChanges: number;
    exceptions: number;
    history: number;
    pendingActions: number;
    reportVersions: number;
  } {
    if (mode === 'replace') {
      this.clear();
    }

    let assetCount = 0;
    let taskCount = 0;

    for (const asset of snapshot.assets) {
      if (!this.assets.has(asset.id)) {
        this.assets.set(asset.id, { ...asset });
        assetCount++;
      }
    }

    for (const task of snapshot.tasks) {
      if (!this.tasks.has(task.id)) {
        this.tasks.set(task.id, {
          ...task,
          planAssetIds: [...task.planAssetIds],
          actualScans: task.actualScans.map(s => ({ ...s }))
        });
        taskCount++;
      }
    }

    const statusChangeIds = new Set(this.statusChanges.map(r => r.id));
    for (const record of snapshot.statusChanges) {
      if (!statusChangeIds.has(record.id)) {
        this.statusChanges.push({ ...record });
      }
    }

    const exceptionIds = new Set(this.exceptions.map(e => e.id));
    for (const record of snapshot.exceptions) {
      if (!exceptionIds.has(record.id)) {
        this.exceptions.push({ ...record });
      }
    }

    const historyIds = new Set(this.history.map(h => h.id));
    for (const record of snapshot.history) {
      if (!historyIds.has(record.id)) {
        this.history.push({ ...record });
      }
    }

    const pendingActionIds = new Set(this.pendingActions.map(a => a.id));
    if (snapshot.pendingActions) {
      for (const action of snapshot.pendingActions) {
        if (!pendingActionIds.has(action.id)) {
          this.pendingActions.push({ ...action });
        }
      }
    }

    let reportVersionCount = 0;
    const reportVersionIds = new Set(this.reportVersions.map(v => v.id));
    if (snapshot.reportVersions) {
      for (const version of snapshot.reportVersions) {
        if (!reportVersionIds.has(version.id)) {
          this.reportVersions.push({ ...version });
          reportVersionCount++;
        }
      }
    }

    return {
      assets: assetCount,
      tasks: taskCount,
      statusChanges: this.statusChanges.length,
      exceptions: this.exceptions.length,
      history: this.history.length,
      pendingActions: this.pendingActions.length,
      reportVersions: reportVersionCount
    };
  }

  importJSON(json: string, mode?: 'merge' | 'replace'): {
    assets: number;
    tasks: number;
    statusChanges: number;
    exceptions: number;
    history: number;
    pendingActions: number;
    reportVersions: number;
  } {
    const snapshot = JSON.parse(json) as InventoryDataSnapshot;
    return this.importSnapshot(snapshot, mode);
  }

  validateSnapshot(snapshot: InventoryDataSnapshot): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!snapshot.version) {
      errors.push('缺少 version 字段');
    }
    if (!Array.isArray(snapshot.assets)) {
      errors.push('assets 不是数组');
    }
    if (!Array.isArray(snapshot.tasks)) {
      errors.push('tasks 不是数组');
    }
    if (!Array.isArray(snapshot.statusChanges)) {
      errors.push('statusChanges 不是数组');
    }
    if (!Array.isArray(snapshot.exceptions)) {
      errors.push('exceptions 不是数组');
    }
    if (!Array.isArray(snapshot.history)) {
      errors.push('history 不是数组');
    }

    const assetIds = new Set<string>();
    for (const asset of snapshot.assets) {
      if (!asset.id) errors.push('资产缺少 id');
      if (!asset.assetNo) errors.push('资产缺少 assetNo');
      if (asset.id) {
        if (assetIds.has(asset.id)) {
          errors.push(`重复的资产ID: ${asset.id}`);
        }
        assetIds.add(asset.id);
      }
    }

    const taskIds = new Set<string>();
    for (const task of snapshot.tasks) {
      if (!task.id) errors.push('任务缺少 id');
      if (!task.batchNo) errors.push('任务缺少 batchNo');
      if (task.id) {
        if (taskIds.has(task.id)) {
          errors.push(`重复的任务ID: ${task.id}`);
        }
        taskIds.add(task.id);
      }
    }

    if (!Array.isArray(snapshot.pendingActions)) {
      errors.push('pendingActions 不是数组');
    }

    if (!Array.isArray(snapshot.reportVersions)) {
      errors.push('reportVersions 不是数组');
    }

    const reportVersionIds = new Set<string>();
    if (snapshot.reportVersions) {
      for (const version of snapshot.reportVersions) {
        if (!version.id) errors.push('报告版本缺少 id');
        if (!version.taskId) errors.push('报告版本缺少 taskId');
        if (typeof version.version !== 'number') errors.push('报告版本 version 不是数字');
        if (!version.report) errors.push('报告版本缺少 report');
        if (version.id) {
          if (reportVersionIds.has(version.id)) {
            errors.push(`重复的报告版本ID: ${version.id}`);
          }
          reportVersionIds.add(version.id);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

export const store = new DataStore();
