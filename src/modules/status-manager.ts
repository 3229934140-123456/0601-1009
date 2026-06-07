import {
  AssetStatus,
  StatusChangeRecord,
  Asset,
  AssetHistoryRecord
} from '../types';
import { store } from '../store';
import { generateId, formatDate } from '../utils';

export interface StatusChangeInput {
  assetId: string;
  toStatus: AssetStatus;
  operator: string;
  reason: string;
}

export class StatusManager {
  changeStatus(input: StatusChangeInput): Asset {
    const asset = store.getAssetById(input.assetId);
    if (!asset) {
      throw new Error(`资产 ${input.assetId} 不存在`);
    }

    if (asset.status === input.toStatus) {
      return asset;
    }

    const fromStatus = asset.status;
    asset.status = input.toStatus;
    asset.updatedAt = formatDate();
    store.updateAsset(asset);

    const record: StatusChangeRecord = {
      id: generateId('stc_'),
      assetId: asset.id,
      assetNo: asset.assetNo,
      fromStatus,
      toStatus: input.toStatus,
      operator: input.operator,
      reason: input.reason,
      timestamp: formatDate()
    };
    store.addStatusChange(record);

    const history: AssetHistoryRecord = {
      id: generateId('hst_'),
      assetId: asset.id,
      type: 'status_change',
      title: '状态变更',
      description: `状态从 ${this.getStatusLabel(fromStatus)} 变更为 ${this.getStatusLabel(input.toStatus)}，原因：${input.reason}`,
      operator: input.operator,
      timestamp: record.timestamp,
      detail: { fromStatus, toStatus: input.toStatus, reason: input.reason }
    };
    store.addHistory(history);

    return asset;
  }

  changeStatusByAssetNo(assetNo: string, toStatus: AssetStatus, operator: string, reason: string): Asset {
    const asset = store.getAssetByNo(assetNo);
    if (!asset) {
      throw new Error(`资产 ${assetNo} 不存在`);
    }
    return this.changeStatus({
      assetId: asset.id,
      toStatus,
      operator,
      reason
    });
  }

  markIdle(assetId: string, operator: string, reason: string): Asset {
    return this.changeStatus({
      assetId,
      toStatus: AssetStatus.IDLE,
      operator,
      reason
    });
  }

  markDamaged(assetId: string, operator: string, reason: string): Asset {
    return this.changeStatus({
      assetId,
      toStatus: AssetStatus.DAMAGED,
      operator,
      reason
    });
  }

  markScrapped(assetId: string, operator: string, reason: string): Asset {
    return this.changeStatus({
      assetId,
      toStatus: AssetStatus.SCRAPPED,
      operator,
      reason
    });
  }

  markInUse(assetId: string, operator: string, reason: string): Asset {
    return this.changeStatus({
      assetId,
      toStatus: AssetStatus.IN_USE,
      operator,
      reason
    });
  }

  markBorrowed(assetId: string, operator: string, reason: string): Asset {
    return this.changeStatus({
      assetId,
      toStatus: AssetStatus.BORROWED,
      operator,
      reason
    });
  }

  markUnderMaintenance(assetId: string, operator: string, reason: string): Asset {
    return this.changeStatus({
      assetId,
      toStatus: AssetStatus.UNDER_MAINTENANCE,
      operator,
      reason
    });
  }

  getStatusHistory(assetId: string): StatusChangeRecord[] {
    return store.getStatusChanges(assetId).sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  canTransition(from: AssetStatus, to: AssetStatus): boolean {
    const validTransitions: Record<AssetStatus, AssetStatus[]> = {
      [AssetStatus.IN_USE]: [
        AssetStatus.IDLE,
        AssetStatus.DAMAGED,
        AssetStatus.BORROWED,
        AssetStatus.UNDER_MAINTENANCE,
        AssetStatus.SCRAPPED
      ],
      [AssetStatus.IDLE]: [
        AssetStatus.IN_USE,
        AssetStatus.DAMAGED,
        AssetStatus.SCRAPPED
      ],
      [AssetStatus.DAMAGED]: [
        AssetStatus.UNDER_MAINTENANCE,
        AssetStatus.SCRAPPED,
        AssetStatus.IDLE
      ],
      [AssetStatus.SCRAPPED]: [],
      [AssetStatus.BORROWED]: [
        AssetStatus.IN_USE,
        AssetStatus.DAMAGED
      ],
      [AssetStatus.UNDER_MAINTENANCE]: [
        AssetStatus.IN_USE,
        AssetStatus.IDLE,
        AssetStatus.DAMAGED,
        AssetStatus.SCRAPPED
      ]
    };

    return validTransitions[from]?.includes(to) || false;
  }

  getStatusLabel(status: AssetStatus): string {
    const labels: Record<AssetStatus, string> = {
      [AssetStatus.IN_USE]: '使用中',
      [AssetStatus.IDLE]: '闲置',
      [AssetStatus.DAMAGED]: '损坏',
      [AssetStatus.SCRAPPED]: '报废',
      [AssetStatus.BORROWED]: '借用中',
      [AssetStatus.UNDER_MAINTENANCE]: '维修中'
    };
    return labels[status] || status;
  }

  batchChangeStatus(
    assetIds: string[],
    toStatus: AssetStatus,
    operator: string,
    reason: string
  ): { success: Asset[]; failed: { assetId: string; error: string }[] } {
    const success: Asset[] = [];
    const failed: { assetId: string; error: string }[] = [];

    for (const assetId of assetIds) {
      try {
        const asset = this.changeStatus({ assetId, toStatus, operator, reason });
        success.push(asset);
      } catch (e: any) {
        failed.push({ assetId, error: e.message });
      }
    }

    return { success, failed };
  }

  getAssetsByStatus(status: AssetStatus): Asset[] {
    return store.getAssets().filter(a => a.status === status);
  }

  getStatusCounts(): Record<AssetStatus, number> {
    const counts: Record<AssetStatus, number> = {
      [AssetStatus.IN_USE]: 0,
      [AssetStatus.IDLE]: 0,
      [AssetStatus.DAMAGED]: 0,
      [AssetStatus.SCRAPPED]: 0,
      [AssetStatus.BORROWED]: 0,
      [AssetStatus.UNDER_MAINTENANCE]: 0
    };

    for (const asset of store.getAssets()) {
      if (counts[asset.status] !== undefined) {
        counts[asset.status]++;
      }
    }

    return counts;
  }
}

export const statusManager = new StatusManager();
