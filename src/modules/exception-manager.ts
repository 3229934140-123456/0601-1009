import {
  ExceptionRecord,
  ExceptionType,
  ApprovalStatus,
  AssetHistoryRecord,
  PendingAction,
  Asset,
  AssetLocation,
  AssetStatus,
  ExceptionProcessChain,
  ExceptionProcessNode
} from '../types';
import { store } from '../store';
import { generateId, formatDate } from '../utils';
import { statusManager } from './status-manager';
import { assetRegistration } from './asset-registration';

export interface CreateExceptionInput {
  taskId?: string;
  assetId: string;
  assetNo: string;
  type: ExceptionType;
  description: string;
  reporter: string;
  priority?: 'low' | 'medium' | 'high';
  suggestedAction?: {
    updateStatus?: AssetStatus;
    updateLocation?: AssetLocation;
    updateResponsiblePerson?: string;
  };
  assignee?: string;
}

export interface ApprovalOptions {
  syncAssetUpdate?: boolean;
}

export type ApprovalCallback = (exception: ExceptionRecord, pendingAction?: PendingAction) => void;

export class ExceptionManager {
  private approvalCallbacks: Set<ApprovalCallback> = new Set();

  createException(input: CreateExceptionInput): { exception: ExceptionRecord; pendingAction: PendingAction } {
    const now = formatDate();

    const record: ExceptionRecord = {
      id: generateId('exc_'),
      taskId: input.taskId,
      assetId: input.assetId,
      assetNo: input.assetNo,
      type: input.type,
      description: input.description,
      reporter: input.reporter,
      timestamp: now,
      approvalStatus: ApprovalStatus.PENDING,
      handled: false,
      suggestedAction: input.suggestedAction
    };

    store.addException(record);

    const pendingAction: PendingAction = {
      id: generateId('pa_'),
      type: 'exception_approval',
      refId: record.id,
      assetId: input.assetId,
      assetNo: input.assetNo,
      title: `${this.getTypeLabel(input.type)}异常待审批`,
      description: input.description,
      priority: input.priority || this.getDefaultPriority(input.type),
      assignee: input.assignee,
      status: 'pending',
      createdAt: now,
      detail: { exceptionId: record.id, type: input.type }
    };

    store.addPendingAction(pendingAction);

    const history: AssetHistoryRecord = {
      id: generateId('hst_'),
      assetId: input.assetId,
      type: 'exception',
      title: '异常记录上报',
      description: `上报 ${this.getTypeLabel(input.type)} 异常：${input.description}，待审批处理`,
      operator: input.reporter,
      timestamp: now,
      detail: {
        exceptionId: record.id,
        pendingActionId: pendingAction.id,
        type: input.type,
        description: input.description
      }
    };
    store.addHistory(history);

    this.triggerApprovalPrompt(record, pendingAction);

    return { exception: record, pendingAction };
  }

  private getDefaultPriority(type: ExceptionType): PendingAction['priority'] {
    switch (type) {
      case ExceptionType.LOST:
        return 'high';
      case ExceptionType.DAMAGED:
        return 'high';
      case ExceptionType.MISPLACED:
        return 'medium';
      case ExceptionType.UNREGISTERED:
        return 'low';
      case ExceptionType.DUPLICATE_TAG:
        return 'low';
      default:
        return 'medium';
    }
  }

  getException(id: string): ExceptionRecord | undefined {
    return store.getExceptionById(id);
  }

  listExceptions(params?: {
    type?: ExceptionType;
    approvalStatus?: ApprovalStatus;
    handled?: boolean;
    assetId?: string;
    taskId?: string;
  }): ExceptionRecord[] {
    let exceptions = store.getExceptions(params?.assetId, params?.taskId);

    if (params?.type) {
      exceptions = exceptions.filter(e => e.type === params.type);
    }
    if (params?.approvalStatus) {
      exceptions = exceptions.filter(e => e.approvalStatus === params.approvalStatus);
    }
    if (params?.handled !== undefined) {
      exceptions = exceptions.filter(e => e.handled === params.handled);
    }

    return exceptions.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  approve(exceptionId: string, operator: string, remark?: string, options: ApprovalOptions = {}): ExceptionRecord {
    const record = store.getExceptionById(exceptionId);
    if (!record) {
      throw new Error(`异常记录 ${exceptionId} 不存在`);
    }
    if (record.approvalStatus !== ApprovalStatus.PENDING) {
      throw new Error(`该异常已被审批，状态：${record.approvalStatus}`);
    }

    const now = formatDate();
    let syncDetail: any = { performed: false };

    if (options.syncAssetUpdate && record.suggestedAction) {
      try {
        const asset = store.getAssetById(record.assetId);
        if (asset) {
          if (record.suggestedAction.updateStatus) {
            statusManager.changeStatus({
              assetId: record.assetId,
              toStatus: record.suggestedAction.updateStatus,
              operator,
              reason: `异常审批通过，自动更新状态：${remark || ''}`
            });
          }
          if (record.suggestedAction.updateLocation) {
            assetRegistration.updateLocation(
              record.assetId,
              record.suggestedAction.updateLocation,
              operator
            );
          }
          if (record.suggestedAction.updateResponsiblePerson) {
            assetRegistration.updateResponsiblePerson(
              record.assetId,
              record.suggestedAction.updateResponsiblePerson,
              operator
            );
          }
          syncDetail = { performed: true, actions: record.suggestedAction };
        }
      } catch (e: any) {
        syncDetail = { performed: false, error: e.message };
      }
    }

    const updated = store.updateException(exceptionId, {
      approvalStatus: ApprovalStatus.APPROVED,
      approvalOperator: operator,
      approvalTime: now,
      approvalRemark: remark,
      syncPerformed: syncDetail.performed,
      syncDetail
    });

    const pendingAction = store.getPendingActions().find(
      p => p.refId === exceptionId && p.type === 'exception_approval'
    );
    if (pendingAction) {
      store.updatePendingAction(pendingAction.id, {
        status: 'done',
        detail: { ...pendingAction.detail, approvedBy: operator, remark }
      });
    }

    const history: AssetHistoryRecord = {
      id: generateId('hst_'),
      assetId: record.assetId,
      type: 'exception',
      title: '异常审批通过',
      description: `异常审批通过：${remark || '无备注'}${syncDetail.performed ? '，已同步更新资产信息' : ''}`,
      operator,
      timestamp: now,
      detail: { exceptionId, remark, syncDetail }
    };
    store.addHistory(history);

    return updated!;
  }

  reject(exceptionId: string, operator: string, remark: string): ExceptionRecord {
    const record = store.getExceptionById(exceptionId);
    if (!record) {
      throw new Error(`异常记录 ${exceptionId} 不存在`);
    }
    if (record.approvalStatus !== ApprovalStatus.PENDING) {
      throw new Error(`该异常已被审批，状态：${record.approvalStatus}`);
    }

    const now = formatDate();

    const updated = store.updateException(exceptionId, {
      approvalStatus: ApprovalStatus.REJECTED,
      approvalOperator: operator,
      approvalTime: now,
      approvalRemark: remark
    });

    const pendingAction = store.getPendingActions().find(
      p => p.refId === exceptionId && p.type === 'exception_approval'
    );
    if (pendingAction) {
      store.updatePendingAction(pendingAction.id, {
        status: 'cancelled',
        detail: { ...pendingAction.detail, rejectedBy: operator, remark }
      });
    }

    const history: AssetHistoryRecord = {
      id: generateId('hst_'),
      assetId: record.assetId,
      type: 'exception',
      title: '异常审批驳回',
      description: `异常审批被驳回，原因：${remark}`,
      operator,
      timestamp: now,
      detail: { exceptionId, remark }
    };
    store.addHistory(history);

    return updated!;
  }

  handleException(exceptionId: string, remark: string): ExceptionRecord {
    const record = store.getExceptionById(exceptionId);
    if (!record) {
      throw new Error(`异常记录 ${exceptionId} 不存在`);
    }

    const updated = store.updateException(exceptionId, {
      handled: true,
      handleRemark: remark,
      handleTime: formatDate()
    });

    const history: AssetHistoryRecord = {
      id: generateId('hst_'),
      assetId: record.assetId,
      type: 'exception',
      title: '异常已处理',
      description: `异常处理完成：${remark}`,
      timestamp: formatDate(),
      detail: { exceptionId, remark }
    };
    store.addHistory(history);

    return updated!;
  }

  listPendingActions(params?: {
    status?: PendingAction['status'];
    type?: PendingAction['type'];
    assignee?: string;
    assetId?: string;
  }): PendingAction[] {
    return store.getPendingActions(params);
  }

  updatePendingAction(id: string, updates: Partial<PendingAction>): PendingAction | undefined {
    return store.updatePendingAction(id, updates);
  }

  onApprovalPrompt(callback: ApprovalCallback): void {
    this.approvalCallbacks.add(callback);
  }

  offApprovalPrompt(callback: ApprovalCallback): void {
    this.approvalCallbacks.delete(callback);
  }

  private triggerApprovalPrompt(exception: ExceptionRecord, pendingAction?: PendingAction): void {
    for (const callback of this.approvalCallbacks) {
      try {
        callback(exception, pendingAction);
      } catch (e) {
        console.error('审批提示回调执行失败:', e);
      }
    }
  }

  getTypeLabel(type: ExceptionType): string {
    const labels: Record<ExceptionType, string> = {
      [ExceptionType.MISPLACED]: '位置错位',
      [ExceptionType.DAMAGED]: '资产损坏',
      [ExceptionType.LOST]: '资产丢失',
      [ExceptionType.UNREGISTERED]: '未注册资产',
      [ExceptionType.DUPLICATE_TAG]: '重复标签',
      [ExceptionType.OTHER]: '其他异常'
    };
    return labels[type] || type;
  }

  getApprovalStatusLabel(status: ApprovalStatus): string {
    const labels: Record<ApprovalStatus, string> = {
      [ApprovalStatus.PENDING]: '待审批',
      [ApprovalStatus.APPROVED]: '已通过',
      [ApprovalStatus.REJECTED]: '已驳回'
    };
    return labels[status] || status;
  }

  getExceptionCounts(params?: { taskId?: string; assetId?: string }): {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    handled: number;
    unhandled: number;
    byType: Record<ExceptionType, number>;
  } {
    const exceptions = store.getExceptions(params?.assetId, params?.taskId);

    const counts = {
      total: exceptions.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      handled: 0,
      unhandled: 0,
      byType: {
        [ExceptionType.MISPLACED]: 0,
        [ExceptionType.DAMAGED]: 0,
        [ExceptionType.LOST]: 0,
        [ExceptionType.UNREGISTERED]: 0,
        [ExceptionType.DUPLICATE_TAG]: 0,
        [ExceptionType.OTHER]: 0
      } as Record<ExceptionType, number>
    };

    for (const e of exceptions) {
      if (e.approvalStatus === ApprovalStatus.PENDING) counts.pending++;
      if (e.approvalStatus === ApprovalStatus.APPROVED) counts.approved++;
      if (e.approvalStatus === ApprovalStatus.REJECTED) counts.rejected++;
      if (e.handled) counts.handled++;
      else counts.unhandled++;
      if (counts.byType[e.type] !== undefined) {
        counts.byType[e.type]++;
      }
    }

    return counts;
  }

  getExceptionProcessChain(exceptionId: string): ExceptionProcessChain | null {
    const exception = store.getExceptionById(exceptionId);
    if (!exception) return null;

    const asset = store.getAssetById(exception.assetId);
    const nodes: ExceptionProcessNode[] = [];

    nodes.push({
      type: 'report',
      title: '异常上报',
      description: exception.description,
      operator: exception.reporter,
      timestamp: exception.timestamp,
      detail: { type: exception.type }
    });

    if (exception.approvalStatus === ApprovalStatus.APPROVED && exception.approvalTime) {
      nodes.push({
        type: 'approval',
        title: '审批通过',
        description: exception.approvalRemark || '审批通过',
        operator: exception.approvalOperator,
        timestamp: exception.approvalTime,
        detail: { syncPerformed: exception.syncPerformed, syncDetail: exception.syncDetail }
      });

      if (exception.syncPerformed && exception.syncDetail) {
        nodes.push({
          type: 'sync',
          title: '同步更新资产',
          description: '审批通过后自动同步更新资产信息',
          operator: exception.approvalOperator,
          timestamp: exception.approvalTime,
          detail: exception.syncDetail
        });
      }
    } else if (exception.approvalStatus === ApprovalStatus.REJECTED && exception.approvalTime) {
      nodes.push({
        type: 'approval',
        title: '审批驳回',
        description: exception.approvalRemark || '审批驳回',
        operator: exception.approvalOperator,
        timestamp: exception.approvalTime
      });
    }

    if (exception.handled && exception.handleTime) {
      nodes.push({
        type: 'complete',
        title: '处理完成',
        description: exception.handleRemark || '异常已处理',
        timestamp: exception.handleTime,
        detail: { handleRemark: exception.handleRemark }
      });
    }

    nodes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let currentStatus: ExceptionProcessChain['currentStatus'] = 'pending';
    if (exception.approvalStatus === ApprovalStatus.APPROVED) {
      currentStatus = exception.handled ? 'completed' : 'approved';
    } else if (exception.approvalStatus === ApprovalStatus.REJECTED) {
      currentStatus = 'rejected';
    }

    let totalDurationMinutes: number | undefined;
    if (nodes.length >= 2) {
      const start = new Date(nodes[0].timestamp).getTime();
      const end = new Date(nodes[nodes.length - 1].timestamp).getTime();
      totalDurationMinutes = Math.round((end - start) / 60000);
    }

    return {
      exceptionId: exception.id,
      assetId: exception.assetId,
      assetNo: exception.assetNo,
      assetName: asset?.name,
      nodes,
      totalDurationMinutes,
      currentStatus
    };
  }
}

export const exceptionManager = new ExceptionManager();
