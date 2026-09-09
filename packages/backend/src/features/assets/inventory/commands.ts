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
