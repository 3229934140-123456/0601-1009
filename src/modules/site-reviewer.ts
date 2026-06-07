import {
  Asset,
  InventoryTask,
  ScanStatus,
  AreaSummary,
  AreaDetail,
  AssetLocation,
  UnregisteredScanDetail,
  ScanWithAssetInfo
} from '../types';
import { store } from '../store';
import { formatLocation } from '../utils';

function locationMatchesPartial(assetLocation: AssetLocation | undefined, query: Partial<AssetLocation>): boolean {
  if (!assetLocation) return false;
  if (query.building && assetLocation.building !== query.building) return false;
  if (query.floor && assetLocation.floor !== query.floor) return false;
  if (query.room && assetLocation.room !== query.room) return false;
  return true;
}

function getLocationKey(location: AssetLocation, level: 'building' | 'floor' | 'room'): string {
  if (level === 'building') return location.building;
  if (level === 'floor') return `${location.building}|${location.floor}`;
  return `${location.building}|${location.floor}|${location.room}`;
}

export class SiteReviewer {
  getBuildingSummaries(taskId: string): AreaSummary[] {
    const task = store.getTaskById(taskId);
    if (!task) return [];

    const plannedAssets = this.getPlannedAssets(task);
    const scans = task.actualScans;

    const buildingMap = new Map<string, {
      planned: Asset[];
      scanned: Set<string>;
      misplaced: Set<string>;
      unregistered: Map<string, UnregisteredScanDetail>;
      duplicateCount: number;
    }>();

    for (const asset of plannedAssets) {
      const key = asset.location.building;
      if (!buildingMap.has(key)) {
        buildingMap.set(key, { planned: [], scanned: new Set(), misplaced: new Set(), unregistered: new Map(), duplicateCount: 0 });
      }
      buildingMap.get(key)!.planned.push(asset);
    }

    for (const scan of scans) {
      const scanLoc = scan.scanLocation;
      if (!scanLoc) continue;

      const key = scanLoc.building;
      if (!buildingMap.has(key)) {
        buildingMap.set(key, { planned: [], scanned: new Set(), misplaced: new Set(), unregistered: new Map(), duplicateCount: 0 });
      }
      const bucket = buildingMap.get(key)!;

      if (scan.status === ScanStatus.UNREGISTERED) {
        const existing = bucket.unregistered.get(scan.assetNo);
        if (existing) {
          existing.scanCount++;
        } else {
          bucket.unregistered.set(scan.assetNo, {
            assetNo: scan.assetNo,
            scanTime: scan.scanTime,
            scanner: scan.scanner,
            scanLocation: scan.scanLocation,
            scanCount: 1
          });
        }
      } else if (scan.assetId) {
        if (scan.isDuplicate) {
          bucket.duplicateCount++;
        } else {
          bucket.scanned.add(scan.assetId);
        }
        if (scan.status === ScanStatus.MISPLACED) {
          bucket.misplaced.add(scan.assetId);
        }
      }
    }

    const summaries: AreaSummary[] = [];
    for (const [building, data] of buildingMap) {
      const total = data.planned.length;
      const scanned = data.scanned.size;
      summaries.push({
        level: 'building',
        building,
        totalAssets: total,
        scannedAssets: scanned,
        unscannedAssets: total - scanned,
        misplacedAssets: data.misplaced.size,
        unregisteredAssets: data.unregistered.size,
        duplicateScans: data.duplicateCount,
        normalAssets: scanned - data.misplaced.size,
        completionRate: total > 0 ? Math.round((scanned / total) * 10000) / 100 : 0,
        children: this.getFloorSummariesForBuilding(task, building)
      });
    }

    return summaries.sort((a, b) => a.building.localeCompare(b.building));
  }

  private getFloorSummariesForBuilding(task: InventoryTask, building: string): AreaSummary[] {
    const plannedAssets = this.getPlannedAssets(task).filter(a => a.location.building === building);
    const scans = task.actualScans.filter(s => s.scanLocation?.building === building);

    const floorMap = new Map<string, {
      planned: Asset[];
      scanned: Set<string>;
      misplaced: Set<string>;
      unregistered: Map<string, UnregisteredScanDetail>;
      duplicateCount: number;
    }>();

    for (const asset of plannedAssets) {
      const key = asset.location.floor;
      if (!floorMap.has(key)) {
        floorMap.set(key, { planned: [], scanned: new Set(), misplaced: new Set(), unregistered: new Map(), duplicateCount: 0 });
      }
      floorMap.get(key)!.planned.push(asset);
    }

    for (const scan of scans) {
      const scanLoc = scan.scanLocation;
      if (!scanLoc) continue;
      const key = scanLoc.floor;
      if (!floorMap.has(key)) {
        floorMap.set(key, { planned: [], scanned: new Set(), misplaced: new Set(), unregistered: new Map(), duplicateCount: 0 });
      }
      const bucket = floorMap.get(key)!;

      if (scan.status === ScanStatus.UNREGISTERED) {
        const existing = bucket.unregistered.get(scan.assetNo);
        if (existing) {
          existing.scanCount++;
        } else {
          bucket.unregistered.set(scan.assetNo, {
            assetNo: scan.assetNo,
            scanTime: scan.scanTime,
            scanner: scan.scanner,
            scanLocation: scan.scanLocation,
            scanCount: 1
          });
        }
      } else if (scan.assetId) {
        if (scan.isDuplicate) {
          bucket.duplicateCount++;
        } else {
          bucket.scanned.add(scan.assetId);
        }
        if (scan.status === ScanStatus.MISPLACED) {
          bucket.misplaced.add(scan.assetId);
        }
      }
    }

    const summaries: AreaSummary[] = [];
    for (const [floor, data] of floorMap) {
      const total = data.planned.length;
      const scanned = data.scanned.size;
      summaries.push({
        level: 'floor',
        building,
        floor,
        totalAssets: total,
        scannedAssets: scanned,
        unscannedAssets: total - scanned,
        misplacedAssets: data.misplaced.size,
        unregisteredAssets: data.unregistered.size,
        duplicateScans: data.duplicateCount,
        normalAssets: scanned - data.misplaced.size,
        completionRate: total > 0 ? Math.round((scanned / total) * 10000) / 100 : 0,
        children: this.getRoomSummariesForFloor(task, building, floor)
      });
    }

    return summaries.sort((a, b) => (a.floor || '').localeCompare(b.floor || ''));
  }

  private getRoomSummariesForFloor(task: InventoryTask, building: string, floor: string): AreaSummary[] {
    const plannedAssets = this.getPlannedAssets(task).filter(a => a.location.building === building && a.location.floor === floor);
    const scans = task.actualScans.filter(s => s.scanLocation?.building === building && s.scanLocation?.floor === floor);

    const roomMap = new Map<string, {
      planned: Asset[];
      scanned: Set<string>;
      misplaced: Set<string>;
      unregistered: Map<string, UnregisteredScanDetail>;
      duplicateCount: number;
    }>();

    for (const asset of plannedAssets) {
      const key = asset.location.room;
      if (!roomMap.has(key)) {
        roomMap.set(key, { planned: [], scanned: new Set(), misplaced: new Set(), unregistered: new Map(), duplicateCount: 0 });
      }
      roomMap.get(key)!.planned.push(asset);
    }

    for (const scan of scans) {
      const scanLoc = scan.scanLocation;
      if (!scanLoc) continue;
      const key = scanLoc.room;
      if (!roomMap.has(key)) {
        roomMap.set(key, { planned: [], scanned: new Set(), misplaced: new Set(), unregistered: new Map(), duplicateCount: 0 });
      }
      const bucket = roomMap.get(key)!;

      if (scan.status === ScanStatus.UNREGISTERED) {
        const existing = bucket.unregistered.get(scan.assetNo);
        if (existing) {
          existing.scanCount++;
        } else {
          bucket.unregistered.set(scan.assetNo, {
            assetNo: scan.assetNo,
            scanTime: scan.scanTime,
            scanner: scan.scanner,
            scanLocation: scan.scanLocation,
            scanCount: 1
          });
        }
      } else if (scan.assetId) {
        if (scan.isDuplicate) {
          bucket.duplicateCount++;
        } else {
          bucket.scanned.add(scan.assetId);
        }
        if (scan.status === ScanStatus.MISPLACED) {
          bucket.misplaced.add(scan.assetId);
        }
      }
    }

    const summaries: AreaSummary[] = [];
    for (const [room, data] of roomMap) {
      const total = data.planned.length;
      const scanned = data.scanned.size;
      summaries.push({
        level: 'room',
        building,
        floor,
        room,
        totalAssets: total,
        scannedAssets: scanned,
        unscannedAssets: total - scanned,
        misplacedAssets: data.misplaced.size,
        unregisteredAssets: data.unregistered.size,
        duplicateScans: data.duplicateCount,
        normalAssets: scanned - data.misplaced.size,
        completionRate: total > 0 ? Math.round((scanned / total) * 10000) / 100 : 0
      });
    }

    return summaries.sort((a, b) => (a.room || '').localeCompare(b.room || ''));
  }

  getAreaDetail(taskId: string, location: Partial<AssetLocation>): AreaDetail | null {
    const task = store.getTaskById(taskId);
    if (!task) return null;

    const plannedAssets = this.getPlannedAssets(task).filter(a => locationMatchesPartial(a.location, location));
    const scansInArea = task.actualScans.filter(s => s.scanLocation && locationMatchesPartial(s.scanLocation, location));

    const scannedAssetIds = new Set<string>();
    const misplacedAssetIds = new Set<string>();
    const duplicateScans: ScanWithAssetInfo[] = [];
    const unregisteredMap = new Map<string, UnregisteredScanDetail>();
    let duplicateCount = 0;

    const scanRecordsWithInfo: ScanWithAssetInfo[] = [];
    for (const scan of scansInArea) {
      const asset = scan.assetId ? store.getAssetById(scan.assetId) : null;
      const scanWithInfo: ScanWithAssetInfo = {
        ...scan,
        assetName: asset?.name,
        assetCategory: asset?.category,
        assetStatus: asset?.status,
        currentLocation: asset?.location,
        responsiblePerson: asset?.responsiblePerson,
        department: asset?.department,
        inPlan: task.planAssetIds.includes(scan.assetId)
      };
      scanRecordsWithInfo.push(scanWithInfo);

      if (scan.status === ScanStatus.UNREGISTERED) {
        const existing = unregisteredMap.get(scan.assetNo);
        if (existing) {
          existing.scanCount++;
        } else {
          unregisteredMap.set(scan.assetNo, {
            assetNo: scan.assetNo,
            scanTime: scan.scanTime,
            scanner: scan.scanner,
            scanLocation: scan.scanLocation,
            scanCount: 1
          });
        }
      } else if (scan.assetId) {
        if (scan.isDuplicate) {
          duplicateCount++;
          duplicateScans.push(scanWithInfo);
        } else {
          scannedAssetIds.add(scan.assetId);
        }
        if (scan.status === ScanStatus.MISPLACED) {
          misplacedAssetIds.add(scan.assetId);
        }
      }
    }

    const scannedAssets = plannedAssets.filter(a => scannedAssetIds.has(a.id));
    const unscannedAssets = plannedAssets.filter(a => !scannedAssetIds.has(a.id));
    const misplacedAssets = plannedAssets.filter(a => misplacedAssetIds.has(a.id));

    const level: 'building' | 'floor' | 'room' = location.room ? 'room' : location.floor ? 'floor' : 'building';

    const summary: AreaSummary = {
      level,
      building: location.building || '',
      floor: location.floor,
      room: location.room,
      totalAssets: plannedAssets.length,
      scannedAssets: scannedAssets.length,
      unscannedAssets: unscannedAssets.length,
      misplacedAssets: misplacedAssets.length,
      unregisteredAssets: unregisteredMap.size,
      duplicateScans: duplicateCount,
      normalAssets: scannedAssets.length - misplacedAssets.length,
      completionRate: plannedAssets.length > 0
        ? Math.round((scannedAssets.length / plannedAssets.length) * 10000) / 100
        : 0
    };

    return {
      level,
      building: location.building || '',
      floor: location.floor,
      room: location.room,
      summary,
      plannedAssets,
      scannedAssets,
      unscannedAssets,
      misplacedAssets,
      unregisteredScanDetails: Array.from(unregisteredMap.values()),
      duplicateScans,
      scanRecords: scanRecordsWithInfo
    };
  }

  private getPlannedAssets(task: InventoryTask): Asset[] {
    return task.planAssetIds
      .map(id => store.getAssetById(id))
      .filter((a): a is Asset => !!a);
  }
}

export const siteReviewer = new SiteReviewer();
