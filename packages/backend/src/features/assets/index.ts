export { createAssets } from "./assets.js";
export type {
  AddAssetIdentifierCommand,
  AssetCreatedOutcome,
  AssetDeletedOutcome,
  AssetIdentifierAddedOutcome,
  AssetIdentifierDeletedOutcome,
  AssetIdentifierUpdatedOutcome,
  AssetInventory,
  AssetListOptions,
  AssetUpdatedOutcome,
  CreateAssetCommand,
  DeleteAssetByIDCommand,
  DeleteAssetIdentifierByIDCommand,
  UpdateAssetByIDCommand,
  UpdateAssetIdentifierByIDCommand,
} from "./inventory/commands.js";
export type {
  AssetCustomFieldAssignmentsReplacedOutcome,
  AssetCustomFieldDefinitionCreatedOutcome,
  AssetCustomFieldDefinitionDeletedOutcome,
  AssetCustomFieldDefinitionUpdatedOutcome,
  AssetCustomFields,
  AssetCustomFieldValuesReplacedOutcome,
  CreateAssetCustomFieldDefinitionCommand,
  DeleteAssetCustomFieldDefinitionByIDCommand,
  ReplaceAssetCustomFieldAssignmentsCommand,
  ReplaceAssetCustomFieldValuesCommand,
  UpdateAssetCustomFieldDefinitionByIDCommand,
} from "./custom-fields/commands.js";
export type { Assets } from "./assets.js";
