import {
  InventoryTask,
  InventoryScan,
  InventoryStatus,
  ScanStatus,
  ScanInput,
  Asset,
  AssetLocation,
  AssetHistoryRecord,
  InventoryScope
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
      scopes: [],
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

    const existingScan = this.findLatestScanByAssetId(task.id, asset.id);
    const isDuplicate = !!existingScan;

    let status: ScanStatus = ScanStatus.NORMAL;
    if (isDuplicate) {
      status = ScanStatus.DUPLICATE;
    } else if (input.scanLocation && !isSameLocation(asset.location, input.scanLocation)) {
      status = ScanStatus.MISPLACED;
    }

    const inPlan = task.planAssetIds.includes(asset.id);
    if (!inPlan && !isDuplicate) {
      status = ScanStatus.NORMAL;
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
        detail: { taskId: task.id, taskName: task.name, status, inPlan }
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
    const task = store.getTaskById(input.taskId);
    const existingScan = task ? this.findLatestUnregisteredScan(task.id, input.assetNo) : undefined;
    const isDuplicate = !!existingScan;

    const scan: InventoryScan = {
      id: generateId('scan_'),
      taskId: input.taskId,
      assetId: '',
      assetNo: input.assetNo,
      scanTime: input.scanTime || formatDate(),
      scanner: input.scanner,
      scanLocation: input.scanLocation,
      status: isDuplicate ? ScanStatus.DUPLICATE : ScanStatus.UNREGISTERED,
      isDuplicate,
      note: input.note || '未注册资产'
    };

    if (task) {
      task.actualScans.push(scan);
      task.updatedAt = formatDate();
      store.updateTask(task);
    }

    return scan;
  }

  private findLatestScanByAssetId(taskId: string, assetId: string): InventoryScan | undefined {
    const task = store.getTaskById(taskId);
    if (!task) return undefined;

    const assetScans = task.actualScans
      .filter(s => s.assetId === assetId && !s.isDuplicate)
      .sort((a, b) => new Date(b.scanTime).getTime() - new Date(a.scanTime).getTime());

    return assetScans[0];
  }

  private findLatestUnregisteredScan(taskId: string, assetNo: string): InventoryScan | undefined {
    const task = store.getTaskById(taskId);
    if (!task) return undefined;

    const scans = task.actualScans
      .filter(s => s.assetNo === assetNo && s.status === ScanStatus.UNREGISTERED && !s.isDuplicate)
      .sort((a, b) => new Date(b.scanTime).getTime() - new Date(a.scanTime).getTime());

    return scans[0];
  }

  mergeDuplicateScans(taskId: string): { merged: number; kept: InventoryScan[] } {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    const registeredMap = new Map<string, InventoryScan>();
    const unregisteredMap = new Map<string, InventoryScan>();

    for (const scan of task.actualScans) {
      if (scan.assetId) {
        if (!registeredMap.has(scan.assetId)) {
          registeredMap.set(scan.assetId, { ...scan, isDuplicate: false });
        }
      } else {
        if (!unregisteredMap.has(scan.assetNo)) {
          unregisteredMap.set(scan.assetNo, { ...scan, isDuplicate: false });
        }
      }
    }

    const kept = [
      ...Array.from(registeredMap.values()),
      ...Array.from(unregisteredMap.values())
    ];
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

  createScope(taskId: string, params: {
    name: string;
    type: InventoryScope['type'];
    value: string;
    assetIds?: string[];
    assignedScanner?: string;
  }): InventoryScope {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    let assetIds = params.assetIds || [];

    if (assetIds.length === 0) {
      switch (params.type) {
        case 'department':
          assetIds = store.getAssets()
            .filter(a => a.department === params.value && task.planAssetIds.includes(a.id))
            .map(a => a.id);
          break;
        case 'location':
          assetIds = store.getAssets()
            .filter(a => {
              if (!task.planAssetIds.includes(a.id)) return false;
              const loc = a.location;
              return loc.building === params.value ||
                `${loc.building}-${loc.floor}` === params.value ||
                `${loc.building}-${loc.floor}-${loc.room}` === params.value;
            })
            .map(a => a.id);
          break;
        case 'responsible_person':
          assetIds = store.getAssets()
            .filter(a => a.responsiblePerson === params.value && task.planAssetIds.includes(a.id))
            .map(a => a.id);
          break;
      }
    }

    const now = formatDate();
    const scope: InventoryScope = {
      id: generateId('scope_'),
      taskId,
      name: params.name,
      type: params.type,
      value: params.value,
      assetIds,
      assignedScanner: params.assignedScanner,
      status: InventoryStatus.PENDING,
      createdAt: now,
      updatedAt: now
    };

    task.scopes.push(scope);
    task.updatedAt = now;
    store.updateTask(task);

    return scope;
  }

  splitByDepartment(taskId: string, departments?: string[], scannerMap?: Record<string, string>): InventoryScope[] {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    const planAssets = task.planAssetIds
      .map(id => store.getAssetById(id))
      .filter((a): a is Asset => !!a);

    const deptSet = departments
      ? new Set(departments)
      : new Set(planAssets.map(a => a.department));

    const scopes: InventoryScope[] = [];
    for (const dept of deptSet) {
      const scope = this.createScope(taskId, {
        name: `${dept}盘点范围`,
        type: 'department',
        value: dept,
        assignedScanner: scannerMap?.[dept]
      });
      scopes.push(scope);
    }

    return scopes;
  }

  splitByLocation(taskId: string, level: 'building' | 'floor' | 'room' = 'building', scannerMap?: Record<string, string>): InventoryScope[] {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    const planAssets = task.planAssetIds
      .map(id => store.getAssetById(id))
      .filter((a): a is Asset => !!a);

    const locationKeys = new Set<string>();
    for (const asset of planAssets) {
      const loc = asset.location;
      let key = '';
      switch (level) {
        case 'building':
          key = loc.building;
          break;
        case 'floor':
          key = `${loc.building}-${loc.floor}`;
          break;
        case 'room':
          key = `${loc.building}-${loc.floor}-${loc.room}`;
          break;
      }
      if (key) locationKeys.add(key);
    }

    const scopes: InventoryScope[] = [];
    for (const key of locationKeys) {
      const scope = this.createScope(taskId, {
        name: `${key}盘点范围`,
        type: 'location',
        value: key,
        assignedScanner: scannerMap?.[key]
      });
      scopes.push(scope);
    }

    return scopes;
  }

  splitByResponsiblePerson(taskId: string, persons?: string[], scannerMap?: Record<string, string>): InventoryScope[] {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    const planAssets = task.planAssetIds
      .map(id => store.getAssetById(id))
      .filter((a): a is Asset => !!a);

    const personSet = persons
      ? new Set(persons)
      : new Set(planAssets.map(a => a.responsiblePerson));

    const scopes: InventoryScope[] = [];
    for (const person of personSet) {
      const scope = this.createScope(taskId, {
        name: `${person}负责资产盘点`,
        type: 'responsible_person',
        value: person,
        assignedScanner: scannerMap?.[person]
      });
      scopes.push(scope);
    }

    return scopes;
  }

  getScopes(taskId: string): InventoryScope[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];
    return task.scopes;
  }

  getScope(taskId: string, scopeId: string): InventoryScope | undefined {
    const task = store.getTaskById(taskId);
    if (!task) return undefined;
    return task.scopes.find(s => s.id === scopeId);
  }

  updateScope(taskId: string, scopeId: string, updates: Partial<InventoryScope>): InventoryScope {
    const task = store.getTaskById(taskId);
    if (!task) {
      throw new Error(`盘点任务 ${taskId} 不存在`);
    }

    const scopeIndex = task.scopes.findIndex(s => s.id === scopeId);
    if (scopeIndex === -1) {
      throw new Error(`盘点范围 ${scopeId} 不存在`);
    }

    task.scopes[scopeIndex] = {
      ...task.scopes[scopeIndex],
      ...updates,
      id: scopeId,
      taskId,
      updatedAt: formatDate()
    };

    task.updatedAt = formatDate();
    store.updateTask(task);

    return task.scopes[scopeIndex];
  }

  assignScanner(taskId: string, scopeId: string, scanner: string): InventoryScope {
    return this.updateScope(taskId, scopeId, { assignedScanner: scanner });
  }

  startScope(taskId: string, scopeId: string): InventoryScope {
    return this.updateScope(taskId, scopeId, {
      status: InventoryStatus.IN_PROGRESS,
      startTime: formatDate()
    });
  }

  completeScope(taskId: string, scopeId: string): InventoryScope {
    return this.updateScope(taskId, scopeId, {
      status: InventoryStatus.COMPLETED,
      endTime: formatDate()
    });
  }

  getScopeStats(taskId: string, scopeId: string): {
    total: number;
    scanned: number;
    unscanned: number;
    completionRate: number;
    scanner?: string;
  } {
    const scope = this.getScope(taskId, scopeId);
    const task = store.getTaskById(taskId);
    if (!scope || !task) {
      return { total: 0, scanned: 0, unscanned: 0, completionRate: 0 };
    }

    const scannedIds = new Set<string>();
    for (const scan of task.actualScans) {
      if (scan.assetId && !scan.isDuplicate) {
        scannedIds.add(scan.assetId);
      }
    }

    let scanned = 0;
    for (const assetId of scope.assetIds) {
      if (scannedIds.has(assetId)) {
        scanned++;
      }
    }

    const total = scope.assetIds.length;
    return {
      total,
      scanned,
      unscanned: total - scanned,
      completionRate: total > 0 ? Math.round((scanned / total) * 10000) / 100 : 0,
      scanner: scope.assignedScanner
    };
  }

  getTaskScanners(taskId: string): string[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const scanners = new Set<string>();
    for (const scan of task.actualScans) {
      if (scan.scanner) {
        scanners.add(scan.scanner);
      }
    }
    return Array.from(scanners);
  }

  getScannerStats(taskId: string, scanner: string): {
    totalScans: number;
    uniqueAssets: number;
    duplicates: number;
    misplaced: number;
    unregistered: number;
  } {
    const task = store.getTaskById(taskId);
    if (!task) {
      return { totalScans: 0, uniqueAssets: 0, duplicates: 0, misplaced: 0, unregistered: 0 };
    }

    const scannerScans = task.actualScans.filter(s => s.scanner === scanner);
    const uniqueIds = new Set<string>();
    let duplicates = 0;
    let misplaced = 0;
    let unregistered = 0;

    for (const scan of scannerScans) {
      if (scan.isDuplicate) {
        duplicates++;
      } else if (scan.assetId) {
        uniqueIds.add(scan.assetId);
        if (scan.status === ScanStatus.MISPLACED) {
          misplaced++;
        }
      } else if (scan.status === ScanStatus.UNREGISTERED) {
        unregistered++;
      }
    }

    return {
      totalScans: scannerScans.length,
      uniqueAssets: uniqueIds.size,
      duplicates,
      misplaced,
      unregistered
    };
  }
}

export const inventoryTaskManager = new InventoryTaskManager();
