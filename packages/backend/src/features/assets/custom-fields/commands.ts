import type { AssetWithCustomFields } from "@exposurenexus/contracts/model/asset";
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldValue,
} from "@exposurenexus/contracts/model/asset-custom-field";

export interface CreateAssetCustomFieldDefinitionCommand {
  definition: CreateAssetCustomFieldDefinition;
  performedBy: string;
}

export interface UpdateAssetCustomFieldDefinitionByIDCommand {
  id: string;
  definition: UpdateAssetCustomFieldDefinition;
  performedBy: string;
}

export interface DeleteAssetCustomFieldDefinitionByIDCommand {
  id: string;
  performedBy: string;
}

export interface ReplaceAssetCustomFieldAssignmentsCommand {
  assetId: string;
  fieldIds: readonly string[];
  performedBy: string;
}

export interface ReplaceAssetCustomFieldValuesCommand {
  assetId: string;
  values: readonly UpdateAssetCustomFieldValue[];
  performedBy: string;
}

export interface AssetCustomFieldDefinitionCreatedOutcome {
  current: AssetCustomFieldDefinition;
  performedBy: string;
}

export interface AssetCustomFieldDefinitionUpdatedOutcome {
  previous: AssetCustomFieldDefinition;
  current: AssetCustomFieldDefinition;
  changed: boolean;
  performedBy: string;
}

export interface AssetCustomFieldDefinitionDeletedOutcome {
  previous: AssetCustomFieldDefinition;
  performedBy: string;
}

export interface AssetCustomFieldAssignmentsReplacedOutcome {
  values: AssetCustomFieldValue[];
  previous: AssetWithCustomFields;
  current: AssetWithCustomFields;
  changed: boolean;
  performedBy: string;
}

export interface AssetCustomFieldValuesReplacedOutcome {
  values: AssetCustomFieldValue[];
  previous: AssetWithCustomFields;
  current: AssetWithCustomFields;
  changed: boolean;
  performedBy: string;
}

export interface AssetCustomFields {
  listDefinitions(): Promise<AssetCustomFieldDefinition[]>;
  getDefinitionByID(id: string): Promise<AssetCustomFieldDefinition | null>;
  createDefinition(
    command: CreateAssetCustomFieldDefinitionCommand,
  ): Promise<AssetCustomFieldDefinitionCreatedOutcome>;
  updateDefinitionByID(
    command: UpdateAssetCustomFieldDefinitionByIDCommand,
  ): Promise<AssetCustomFieldDefinitionUpdatedOutcome | null>;
  deleteDefinitionByID(
    command: DeleteAssetCustomFieldDefinitionByIDCommand,
  ): Promise<AssetCustomFieldDefinitionDeletedOutcome | null>;
  listEffectiveValuesForAsset(assetId: string): Promise<AssetCustomFieldValue[] | null>;
  listEffectiveValuesForAssets(
    assetIds: readonly string[],
  ): Promise<Map<string, AssetCustomFieldValue[]>>;
  listAvailableDefinitionsForAsset(assetId: string): Promise<AssetCustomFieldDefinition[] | null>;
  replaceAssignmentsForAsset(
    command: ReplaceAssetCustomFieldAssignmentsCommand,
  ): Promise<AssetCustomFieldAssignmentsReplacedOutcome | null>;
  replaceValuesForAsset(
    command: ReplaceAssetCustomFieldValuesCommand,
  ): Promise<AssetCustomFieldValuesReplacedOutcome | null>;
}
