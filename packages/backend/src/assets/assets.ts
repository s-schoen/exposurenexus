import { getUserProfileByID } from "../identity/user-profile-persistence.js";
import {
  getOrCreateRuntimeValue,
  getRuntimeDatabase,
  getRuntimeLogger,
  type BackendRuntime,
} from "../runtime.js";
import { createAssetCustomFieldRepository } from "./asset-custom-field-repository.js";
import { createAssetRepository } from "./asset-repository.js";
import { createAssetCustomFields } from "./custom-fields.js";
import { createAssetInventory } from "./inventory.js";

import type {
  Asset,
  AssetEnvironment,
  AssetIdentifierRecord,
  AssetLifecycleState,
  AssetType,
  AssetWithCustomFields,
  CreateAsset,
  CreateAssetIdentifier,
  UpdateAsset,
  UpdateAssetIdentifier,
} from "@exposurenexus/contracts/model/asset";
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldValue,
} from "@exposurenexus/contracts/model/asset-custom-field";

export interface AssetListOptions {
  search?: string;
  types?: readonly AssetType[];
  environments?: readonly AssetEnvironment[];
  lifecycleStates?: readonly AssetLifecycleState[];
  ownerIds?: readonly (string | null)[];
}

export interface CreateAssetCommand {
  asset: CreateAsset;
  performedBy: string;
}

export interface UpdateAssetByIDCommand {
  id: string;
  asset: UpdateAsset;
  performedBy: string;
}

export interface AddAssetIdentifierCommand {
  assetId: string;
  identifier: CreateAssetIdentifier;
  performedBy: string;
}

export interface UpdateAssetIdentifierByIDCommand {
  assetId: string;
  identifierId: string;
  identifier: UpdateAssetIdentifier;
  performedBy: string;
}

export interface DeleteAssetIdentifierByIDCommand {
  assetId: string;
  identifierId: string;
  performedBy: string;
}

export interface DeleteAssetByIDCommand {
  id: string;
  performedBy: string;
}

export interface AssetCreatedOutcome {
  asset: Asset;
  current: AssetWithCustomFields;
  performedBy: string;
}

export interface AssetUpdatedOutcome {
  asset: Asset;
  previous: AssetWithCustomFields;
  current: AssetWithCustomFields;
  changed: boolean;
  performedBy: string;
}

export interface AssetIdentifierAddedOutcome {
  identifier: AssetIdentifierRecord;
  previous: AssetWithCustomFields;
  current: AssetWithCustomFields;
  performedBy: string;
}

export interface AssetIdentifierUpdatedOutcome {
  identifier: AssetIdentifierRecord;
  previous: AssetWithCustomFields;
  current: AssetWithCustomFields;
  changed: boolean;
  performedBy: string;
}

export interface AssetIdentifierDeletedOutcome {
  identifier: AssetIdentifierRecord;
  previous: AssetWithCustomFields;
  current: AssetWithCustomFields;
  performedBy: string;
}

export interface AssetDeletedOutcome {
  asset: Asset;
  previous: AssetWithCustomFields;
  performedBy: string;
}

export interface AssetInventory {
  listAll(options?: AssetListOptions): Promise<Asset[]>;
  listAllWithCustomFields(options?: AssetListOptions): Promise<AssetWithCustomFields[]>;
  getByID(id: string): Promise<Asset | null>;
  getByDisplayName(displayName: string, type?: AssetType): Promise<Asset | null>;
  listByDisplayName(displayName: string, type?: AssetType): Promise<Asset[]>;
  create(command: CreateAssetCommand): Promise<AssetCreatedOutcome>;
  updateByID(command: UpdateAssetByIDCommand): Promise<AssetUpdatedOutcome | null>;
  addIdentifier(command: AddAssetIdentifierCommand): Promise<AssetIdentifierAddedOutcome | null>;
  updateIdentifierByID(
    command: UpdateAssetIdentifierByIDCommand,
  ): Promise<AssetIdentifierUpdatedOutcome | null>;
  deleteIdentifierByID(
    command: DeleteAssetIdentifierByIDCommand,
  ): Promise<AssetIdentifierDeletedOutcome | null>;
  deleteByID(command: DeleteAssetByIDCommand): Promise<AssetDeletedOutcome | null>;
}

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

export interface Assets {
  inventory: AssetInventory;
  customFields: AssetCustomFields;
}

const assetsRuntimeKey = {};

export function createAssets(runtime: BackendRuntime): Assets {
  return getOrCreateRuntimeValue(runtime, assetsRuntimeKey, () => {
    const database = getRuntimeDatabase(runtime);
    const logger = getRuntimeLogger(runtime);
    const assetRepository = createAssetRepository(database);
    const assetCustomFieldRepository = createAssetCustomFieldRepository(database);
    const userProfileLookup = {
      getByID: (id: string) => getUserProfileByID(database, id),
    };
    const customFields = createAssetCustomFields({
      assetCustomFieldRepository,
      assetRepository,
      userProfileLookup,
      logger: logger.child({ capability: "assets", component: "custom-fields" }),
    });

    return {
      inventory: createAssetInventory({
        assetRepository,
        assetCustomFieldReader: customFields,
        userProfileLookup,
        logger: logger.child({ capability: "assets", component: "inventory" }),
      }),
      customFields,
    } satisfies Assets;
  });
}
