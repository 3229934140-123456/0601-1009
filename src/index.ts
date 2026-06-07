export * from './types';

export { store, DataStore } from './store';
export * from './utils';

export { AssetRegistration, assetRegistration } from './modules/asset-registration';
export { TagParser, tagParser } from './modules/tag-parser';
export { InventoryTaskManager, inventoryTaskManager } from './modules/inventory-task';
export { LocationValidator, locationValidator } from './modules/location-validator';
export { StatusManager, statusManager } from './modules/status-manager';
export { ExceptionManager, exceptionManager } from './modules/exception-manager';
export { ResultSummarizer, resultSummarizer } from './modules/result-summarizer';

import { assetRegistration } from './modules/asset-registration';
import { tagParser } from './modules/tag-parser';
import { inventoryTaskManager } from './modules/inventory-task';
import { locationValidator } from './modules/location-validator';
import { statusManager } from './modules/status-manager';
import { exceptionManager } from './modules/exception-manager';
import { resultSummarizer } from './modules/result-summarizer';

export const AssetInventory = {
  asset: assetRegistration,
  tag: tagParser,
  task: inventoryTaskManager,
  location: locationValidator,
  status: statusManager,
  exception: exceptionManager,
  summary: resultSummarizer
};

export default AssetInventory;
