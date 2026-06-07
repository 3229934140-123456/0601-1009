import {
  Asset,
  InventoryTask,
  InventoryScan,
  StatusChangeRecord,
  ExceptionRecord,
  AssetHistoryRecord
} from './types';

export class DataStore {
  private assets: Map<string, Asset> = new Map();
  private tasks: Map<string, InventoryTask> = new Map();
  private statusChanges: StatusChangeRecord[] = [];
  private exceptions: ExceptionRecord[] = [];
  private history: AssetHistoryRecord[] = [];

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

  clear(): void {
    this.assets.clear();
    this.tasks.clear();
    this.statusChanges = [];
    this.exceptions = [];
    this.history = [];
  }
}

export const store = new DataStore();
