import {
  Asset,
  AssetRegistrationInput,
  AssetStatus,
  AssetHistoryRecord,
  AssetCategory,
  PaginationParams,
  PaginationResult
} from '../types';
import { store } from '../store';
import { generateId, formatDate } from '../utils';

export class AssetRegistration {
  registerAsset(input: AssetRegistrationInput): Asset {
    const existing = store.getAssetByNo(input.assetNo);
    if (existing) {
      throw new Error(`资产编号 ${input.assetNo} 已存在`);
    }

    const now = formatDate();
    const asset: Asset = {
      id: generateId('ast_'),
      assetNo: input.assetNo,
      name: input.name,
      category: input.category,
      status: input.status || AssetStatus.IN_USE,
      location: input.location,
      responsiblePerson: input.responsiblePerson,
      department: input.department,
      purchaseDate: input.purchaseDate,
      price: input.price,
      brand: input.brand,
      model: input.model,
      serialNo: input.serialNo,
      tagCode: input.tagCode,
      description: input.description,
      createdAt: now,
      updatedAt: now
    };

    store.addAsset(asset);

    const history: AssetHistoryRecord = {
      id: generateId('hst_'),
      assetId: asset.id,
      type: 'register',
      title: '资产注册',
      description: `资产 ${asset.assetNo} ${asset.name} 注册成功`,
      operator: input.responsiblePerson,
      timestamp: now,
      detail: input
    };
    store.addHistory(history);

    return asset;
  }

  getAsset(id: string): Asset | undefined {
    return store.getAssetById(id);
  }

  getAssetByNo(assetNo: string): Asset | undefined {
    return store.getAssetByNo(assetNo);
  }

  listAssets(params?: {
    department?: string;
    category?: AssetCategory;
    status?: AssetStatus;
    keyword?: string;
  } & PaginationParams): PaginationResult<Asset> {
    let assets = store.getAssets();

    if (params?.department) {
      assets = assets.filter(a => a.department === params.department);
    }
    if (params?.category) {
      assets = assets.filter(a => a.category === params.category);
    }
    if (params?.status) {
      assets = assets.filter(a => a.status === params.status);
    }
    if (params?.keyword) {
      const kw = params.keyword.toLowerCase();
      assets = assets.filter(a =>
        a.assetNo.toLowerCase().includes(kw) ||
        a.name.toLowerCase().includes(kw) ||
        a.serialNo?.toLowerCase().includes(kw)
      );
    }

    const total = assets.length;
    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    const start = (page - 1) * pageSize;
    const list = assets.slice(start, start + pageSize);

    return { list, total, page, pageSize };
  }

  updateAsset(id: string, updates: Partial<Asset>): Asset {
    const asset = store.getAssetById(id);
    if (!asset) {
      throw new Error(`资产 ${id} 不存在`);
    }

    const updated: Asset = {
      ...asset,
      ...updates,
      id: asset.id,
      assetNo: asset.assetNo,
      updatedAt: formatDate()
    };

    store.updateAsset(updated);

    const history: AssetHistoryRecord = {
      id: generateId('hst_'),
      assetId: asset.id,
      type: 'update',
      title: '资产信息更新',
      description: `资产信息已更新`,
      timestamp: formatDate(),
      detail: updates
    };
    store.addHistory(history);

    return updated;
  }

  updateResponsiblePerson(id: string, responsiblePerson: string, operator: string): Asset {
    const original = store.getAssetById(id);
    if (!original) {
      throw new Error(`资产 ${id} 不存在`);
    }
    if (original.responsiblePerson === responsiblePerson) {
      return original;
    }

    const fromPerson = original.responsiblePerson;
    const updated = this.updateAsset(id, { responsiblePerson });

    const history: AssetHistoryRecord = {
      id: generateId('hst_'),
      assetId: id,
      type: 'update',
      title: '责任人变更',
      description: `责任人由 ${fromPerson} 变更为 ${responsiblePerson}`,
      operator,
      timestamp: formatDate(),
      detail: { from: fromPerson, to: responsiblePerson }
    };
    store.addHistory(history);

    return updated;
  }

  updateLocation(id: string, location: Asset['location'], operator: string): Asset {
    const asset = store.getAssetById(id);
    if (!asset) {
      throw new Error(`资产 ${id} 不存在`);
    }

    const updated = this.updateAsset(id, { location });

    const history: AssetHistoryRecord = {
      id: generateId('hst_'),
      assetId: id,
      type: 'location_change',
      title: '位置变更',
      description: `资产位置已变更`,
      operator,
      timestamp: formatDate(),
      detail: { from: asset.location, to: location }
    };
    store.addHistory(history);

    return updated;
  }

  deleteAsset(id: string): boolean {
    const asset = store.getAssetById(id);
    if (!asset) {
      return false;
    }
    return store.deleteAsset(id);
  }

  batchRegister(inputs: AssetRegistrationInput[]): { success: Asset[]; failed: { input: AssetRegistrationInput; error: string }[] } {
    const success: Asset[] = [];
    const failed: { input: AssetRegistrationInput; error: string }[] = [];

    for (const input of inputs) {
      try {
        const asset = this.registerAsset(input);
        success.push(asset);
      } catch (e: any) {
        failed.push({ input, error: e.message });
      }
    }

    return { success, failed };
  }

  getAssetHistory(assetId: string): AssetHistoryRecord[] {
    return store.getHistory(assetId).sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
}

export const assetRegistration = new AssetRegistration();
