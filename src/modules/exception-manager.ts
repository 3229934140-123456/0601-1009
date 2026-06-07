import {
  ExceptionRecord,
  ExceptionType,
  ApprovalStatus,
  AssetHistoryRecord
} from '../types';
import { store } from '../store';
import { generateId, formatDate } from '../utils';

export interface CreateExceptionInput {
  taskId?: string;
  assetId: string;
  assetNo: string;
  type: ExceptionType;
  description: string;
  reporter: string;
}

export interface ApprovalInput {
  exceptionId: string;
  operator: string;
  status: ApprovalStatus;
  remark?: string;
}

export type ApprovalCallback = (exception: ExceptionRecord) => void;

export class ExceptionManager {
  private approvalCallbacks: Set<ApprovalCallback> = new Set();

  createException(input: CreateExceptionInput): ExceptionRecord {
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
      handled: false
    };

    store.addException(record);

    const history: AssetHistoryRecord = {
      id: generateId('hst_'),
      assetId: input.assetId,
      type: 'exception',
      title: '异常记录',
      description: `记录 ${this.getTypeLabel(input.type)} 异常：${input.description}`,
      operator: input.reporter,
      timestamp: now,
      detail: input
    };
    store.addHistory(history);

    this.triggerApprovalPrompt(record);

    return record;
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

  approve(exceptionId: string, operator: string, remark?: string): ExceptionRecord {
    const record = store.getExceptionById(exceptionId);
    if (!record) {
      throw new Error(`异常记录 ${exceptionId} 不存在`);
    }
    if (record.approvalStatus !== ApprovalStatus.PENDING) {
      throw new Error(`该异常已被审批，状态：${record.approvalStatus}`);
    }

    const updated = store.updateException(exceptionId, {
      approvalStatus: ApprovalStatus.APPROVED,
      approvalOperator: operator,
      approvalTime: formatDate(),
      approvalRemark: remark
    });

    if (updated) {
      const history: AssetHistoryRecord = {
        id: generateId('hst_'),
        assetId: record.assetId,
        type: 'exception',
        title: '异常审批通过',
        description: `异常已通过审批：${remark || '无备注'}`,
        operator,
        timestamp: formatDate(),
        detail: { exceptionId, remark }
      };
      store.addHistory(history);
    }

    return updated!;
  }

  reject(exceptionId: string, operator: string, remark?: string): ExceptionRecord {
    const record = store.getExceptionById(exceptionId);
    if (!record) {
      throw new Error(`异常记录 ${exceptionId} 不存在`);
    }
    if (record.approvalStatus !== ApprovalStatus.PENDING) {
      throw new Error(`该异常已被审批，状态：${record.approvalStatus}`);
    }

    const updated = store.updateException(exceptionId, {
      approvalStatus: ApprovalStatus.REJECTED,
      approvalOperator: operator,
      approvalTime: formatDate(),
      approvalRemark: remark
    });

    if (updated) {
      const history: AssetHistoryRecord = {
        id: generateId('hst_'),
        assetId: record.assetId,
        type: 'exception',
        title: '异常审批驳回',
        description: `异常审批被驳回：${remark || '无备注'}`,
        operator,
        timestamp: formatDate(),
        detail: { exceptionId, remark }
      };
      store.addHistory(history);
    }

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

    return updated!;
  }

  onApprovalPrompt(callback: ApprovalCallback): void {
    this.approvalCallbacks.add(callback);
  }

  offApprovalPrompt(callback: ApprovalCallback): void {
    this.approvalCallbacks.delete(callback);
  }

  private triggerApprovalPrompt(exception: ExceptionRecord): void {
    for (const callback of this.approvalCallbacks) {
      try {
        callback(exception);
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
}

export const exceptionManager = new ExceptionManager();
