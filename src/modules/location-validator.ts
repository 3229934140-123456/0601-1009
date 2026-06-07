import {
  AssetLocation,
  LocationCheckResult,
  Asset,
  AssetHistoryRecord
} from '../types';
import { store } from '../store';
import { generateId, formatDate, getLocationDifference, isSameLocation, formatLocation } from '../utils';

export type LocationCheckLevel = 'strict' | 'building' | 'floor' | 'room';

export class LocationValidator {
  checkLocation(asset: Asset, actualLocation: AssetLocation, level: LocationCheckLevel = 'room'): LocationCheckResult {
    const expected = asset.location;
    const difference = getLocationDifference(expected, actualLocation);

    let isCorrect = false;
    switch (level) {
      case 'strict':
        isCorrect = isSameLocation(expected, actualLocation);
        break;
      case 'building':
        isCorrect = expected.building === actualLocation.building;
        break;
      case 'floor':
        isCorrect = expected.building === actualLocation.building &&
          expected.floor === actualLocation.floor;
        break;
      case 'room':
        isCorrect = expected.building === actualLocation.building &&
          expected.floor === actualLocation.floor &&
          expected.room === actualLocation.room;
        break;
    }

    return {
      isCorrect,
      expectedLocation: expected,
      actualLocation,
      difference
    };
  }

  checkLocationByAssetNo(assetNo: string, actualLocation: AssetLocation, level?: LocationCheckLevel): LocationCheckResult {
    const asset = store.getAssetByNo(assetNo);
    if (!asset) {
      throw new Error(`资产 ${assetNo} 不存在`);
    }
    return this.checkLocation(asset, actualLocation, level);
  }

  isMisplaced(asset: Asset, actualLocation: AssetLocation, level: LocationCheckLevel = 'room'): boolean {
    return !this.checkLocation(asset, actualLocation, level).isCorrect;
  }

  batchCheckLocations(
    items: { assetNo: string; location: AssetLocation }[],
    level?: LocationCheckLevel
  ): { assetNo: string; result: LocationCheckResult }[] {
    return items.map(item => {
      try {
        const result = this.checkLocationByAssetNo(item.assetNo, item.location, level);
        return { assetNo: item.assetNo, result };
      } catch (e: any) {
        return {
          assetNo: item.assetNo,
          result: {
            isCorrect: false,
            expectedLocation: {} as AssetLocation,
            actualLocation: item.location,
            difference: {}
          } as LocationCheckResult
        };
      }
    });
  }

  getMisplacedAssets(actualLocations: Map<string, AssetLocation>, level?: LocationCheckLevel): Asset[] {
    const misplaced: Asset[] = [];

    for (const [assetNo, location] of actualLocations) {
      const asset = store.getAssetByNo(assetNo);
      if (asset && this.isMisplaced(asset, location, level)) {
        misplaced.push(asset);
      }
    }

    return misplaced;
  }

  updateAssetLocation(
    assetId: string,
    newLocation: AssetLocation,
    operator: string,
    reason?: string
  ): Asset {
    const asset = store.getAssetById(assetId);
    if (!asset) {
      throw new Error(`资产 ${assetId} 不存在`);
    }

    const oldLocation = asset.location;
    asset.location = newLocation;
    asset.updatedAt = formatDate();
    store.updateAsset(asset);

    const history: AssetHistoryRecord = {
      id: generateId('hst_'),
      assetId,
      type: 'location_change',
      title: '位置调整',
      description: `位置从 ${formatLocation(oldLocation)} 调整为 ${formatLocation(newLocation)}${reason ? `，原因：${reason}` : ''}`,
      operator,
      timestamp: formatDate(),
      detail: { from: oldLocation, to: newLocation, reason }
    };
    store.addHistory(history);

    return asset;
  }

  getLocationDescription(location: AssetLocation): string {
    return formatLocation(location);
  }

  parseLocationString(locationStr: string, separator: string = '-'): AssetLocation {
    const parts = locationStr.split(separator);
    return {
      building: parts[0] || '',
      floor: parts[1] || '',
      room: parts[2] || '',
      position: parts[3] || undefined
    };
  }

  validateLocation(location: AssetLocation): boolean {
    return !!(location.building && location.floor && location.room);
  }
}

export const locationValidator = new LocationValidator();
