import {
  InventoryTask,
  InventoryScan,
  InventoryStatus,
  ScanStatus,
  ScanInput,
  Asset,
  AssetLocation,
  AssetHistoryRecord
} from '../types';
import { store } from '../store';
import { generateId, formatDate, isSameLocation } from '../utils';
import { tagParser } from './tag-parser';

export interface CreateTaskInput {
  name: string;
  batchNo: string;
  operator: string;
  department?: string;
  location?: AssetLocation;
  planAssetIds?: string[];
  planByDepartment?: string;
}

export class InventoryTaskManager {
  createTask(input: CreateTaskInput): InventoryTask {
    const existing = store.getTaskByBatchNo(input.batchNo);
    if (existing) {
      throw new Error(`批次号 ${input.batchNo} 已存在`);
    }

    let planAssetIds = input.planAssetIds || [];

    if (input.planByDepartment && planAssetIds.length === 0) {
      const assets = store.getAssets().filter(a => a.department === input.planByDepartment);
      planAssetIds = assets.map(a => a.id);
    }

    const now = formatDate();
    const task: InventoryTask = {
      id: generateId('task_'),
      name: input.name,
      batchNo: input.batchNo,
      status: InventoryStatus.PENDING,
      department: input.department,
      location: input.location,
      operator: input.operator,
      planAssetIds,
      actualScans: [],
      createdAt: now,
      updatedAt: now
    };

    store.addTask(task);
    return task;
  }

  getTask(id: string): InventoryTask | undefined {
    return store.getTaskById(id);
  }

  getTaskByBatchNo(batchNo: string): InventoryTask | undefined {
    return store.getTaskByBatchNo(batchNo);
  }

  listTasks(params?: {
    status?: InventoryStatus;
    department?: string;
    operator?: string;
  }): InventoryTask[] {
    let tasks = store.getTasks();

    if (params?.status) {
      tasks = tasks.filter(t => t.status === params.status);
    }
    if (params?.department) {
      tasks = tasks.filter(t => t.department === params.department);
    }
    if (params?.operator) {
      tasks = tasks.filter(t => t.operator === params.operator);
    }

    return tasks.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  startTask(taskId: string): InventoryTask {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }
    if (task.status !== InventoryStatus.PENDING) {
      throw new Error(`只有待开始的任务才能启动`);
    }

    const updated: InventoryTask = {
      ...task,
      status: InventoryStatus.IN_PROGRESS,
      startTime: formatDate(),
      updatedAt: formatDate()
    };

    store.updateTask(updated);
    return updated;
  }

  completeTask(taskId: string): InventoryTask {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }
    if (task.status !== InventoryStatus.IN_PROGRESS) {
      throw new Error(`只有进行中的任务才能完成`);
    }

    const updated: InventoryTask = {
      ...task,
      status: InventoryStatus.COMPLETED,
      endTime: formatDate(),
      updatedAt: formatDate()
    };

    store.updateTask(updated);
    return updated;
  }

  cancelTask(taskId: string): InventoryTask {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }
    if (task.status === InventoryStatus.COMPLETED) {
      throw new Error(`已完成的任务不能取消`);
    }

    const updated: InventoryTask = {
      ...task,
      status: InventoryStatus.CANCELLED,
      updatedAt: formatDate()
    };

    store.updateTask(updated);
    return updated;
  }

  submitScan(input: ScanInput): InventoryScan {
    const task = store.getTaskById(input.taskId);
    if (!task) {
      throw new Error(`盘点任务 ${input.taskId} 不存在`);
    }
    if (task.status !== InventoryStatus.IN_PROGRESS) {
      throw new Error(`只有进行中的任务才能提交扫描`);
    }

    const asset = store.getAssetByNo(input.assetNo);
    if (!asset) {
      return this.createUnregisteredScan(input);
    }

    const existingScan = this.findLatestScan(task.id, asset.id);
    const isDuplicate = !!existingScan;

    let status: ScanStatus = ScanStatus.NORMAL;
    if (isDuplicate) {
      status = ScanStatus.DUPLICATE;
    } else if (input.scanLocation && !isSameLocation(asset.location, input.scanLocation)) {
      status = ScanStatus.MISPLACED;
    }

    const scan: InventoryScan = {
      id: generateId('scan_'),
      taskId: task.id,
      assetId: asset.id,
      assetNo: asset.assetNo,
      scanTime: input.scanTime || formatDate(),
      scanner: input.scanner,
      scanLocation: input.scanLocation,
      status,
      isDuplicate,
      note: input.note
    };

    task.actualScans.push(scan);
    task.updatedAt = formatDate();
    store.updateTask(task);

    if (!isDuplicate) {
      const history: AssetHistoryRecord = {
        id: generateId('hst_'),
        assetId: asset.id,
        type: 'scan',
        title: '资产盘点扫描',
        description: `在盘点任务 ${task.name} (${task.batchNo}) 中被扫描`,
        operator: input.scanner,
        timestamp: scan.scanTime,
        detail: { taskId: task.id, taskName: task.name, status }
      };
      store.addHistory(history);
    }

    return scan;
  }

  submitScanByTag(taskId: string, tagContent: string, scanner: string, scanLocation?: AssetLocation): InventoryScan {
    const tagInfo = tagParser.parse(tagContent);
    return this.submitScan({
      taskId,
      assetNo: tagInfo.assetNo,
      scanner,
      scanLocation
    });
  }

  batchSubmitScans(scans: ScanInput[]): { success: InventoryScan[]; failed: { input: ScanInput; error: string }[] } {
    const success: InventoryScan[] = [];
    const failed: { input: ScanInput; error: string }[] = [];

    for (const scan of scans) {
      try {
        const result = this.submitScan(scan);
        success.push(result);
      } catch (e: any) {
        failed.push({ input: scan, error: e.message });
      }
    }

    return { success, failed };
  }

  private createUnregisteredScan(input: ScanInput): InventoryScan {
    const scan: InventoryScan = {
      id: generateId('scan_'),
      taskId: input.taskId,
      assetId: '',
      assetNo: input.assetNo,
      scanTime: input.scanTime || formatDate(),
      scanner: input.scanner,
      scanLocation: input.scanLocation,
      status: ScanStatus.UNREGISTERED,
      isDuplicate: false,
      note: input.note || '未注册资产'
    };

    const task = store.getTaskById(input.taskId);
    if (task) {
      task.actualScans.push(scan);
      task.updatedAt = formatDate();
      store.updateTask(task);
    }

    return scan;
  }

  private findLatestScan(taskId: string, assetId: string): InventoryScan | undefined {
    const task = store.getTaskById(taskId);
    if (!task) return undefined;

    const assetScans = task.actualScans
      .filter(s => s.assetId === assetId && !s.isDuplicate)
      .sort((a, b) => new Date(b.scanTime).getTime() - new Date(a.scanTime).getTime());

    return assetScans[0];
  }

  mergeDuplicateScans(taskId: string): { merged: number; kept: InventoryScan[] } {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    const uniqueScans = new Map<string, InventoryScan>();
    const duplicateCount = 0;

    for (const scan of task.actualScans) {
      const existing = uniqueScans.get(scan.assetId);
      if (!existing) {
        uniqueScans.set(scan.assetId, { ...scan, isDuplicate: false });
      }
    }

    const kept = Array.from(uniqueScans.values());
    const merged = task.actualScans.length - kept.length;

    task.actualScans = kept;
    task.updatedAt = formatDate();
    store.updateTask(task);

    return { merged, kept };
  }

  getTaskScans(taskId: string, filter?: { status?: ScanStatus; isDuplicate?: boolean }): InventoryScan[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    let scans = [...task.actualScans];

    if (filter?.status) {
      scans = scans.filter(s => s.status === filter.status);
    }
    if (filter?.isDuplicate !== undefined) {
      scans = scans.filter(s => s.isDuplicate === filter.isDuplicate);
    }

    return scans.sort((a, b) =>
      new Date(b.scanTime).getTime() - new Date(a.scanTime).getTime()
    );
  }

  getUniqueScannedAssets(taskId: string): Asset[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const assetIds = new Set<string>();
    for (const scan of task.actualScans) {
      if (scan.assetId && !scan.isDuplicate) {
        assetIds.add(scan.assetId);
      }
    }

    return Array.from(assetIds)
      .map(id => store.getAssetById(id))
      .filter((a): a is Asset => !!a);
  }

  addPlanAssets(taskId: string, assetIds: string[]): InventoryTask {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    for (const assetId of assetIds) {
      if (!task.planAssetIds.includes(assetId)) {
        task.planAssetIds.push(assetId);
      }
    }

    task.updatedAt = formatDate();
    store.updateTask(task);
    return task;
  }

  removePlanAsset(taskId: string, assetId: string): InventoryTask {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    task.planAssetIds = task.planAssetIds.filter(id => id !== assetId);
    task.updatedAt = formatDate();
    store.updateTask(task);
    return task;
  }
}

export const inventoryTaskManager = new InventoryTaskManager();
