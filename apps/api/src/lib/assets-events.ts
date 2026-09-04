import { createDomainEventEmitter } from "./eventbus/events/index.js";

import type {
  AssetEventPayloads,
  CustomFieldEventPayloads,
  DomainEventContext,
  DomainEventEmitter,
  EventSubjects,
} from "./eventbus/events/index.js";
import type { AssetCustomFields, AssetInventory, Assets } from "@exposurenexus/backend/assets";
import type {
  Asset,
  AssetIdentifierRecord,
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
import type { UserProfile } from "@exposurenexus/contracts/model/user";

export interface CreateApiAssetOptions {
  asset: CreateAsset;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface UpdateApiAssetOptions {
  id: string;
  asset: UpdateAsset;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface AddApiAssetIdentifierOptions {
  assetId: string;
  identifier: CreateAssetIdentifier;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface UpdateApiAssetIdentifierOptions {
  assetId: string;
  identifierId: string;
  identifier: UpdateAssetIdentifier;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface DeleteApiAssetIdentifierOptions {
  assetId: string;
  identifierId: string;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface ApiAssetInventory {
  listAll: AssetInventory["listAll"];
  listAllWithCustomFields: AssetInventory["listAllWithCustomFields"];
  getByID: AssetInventory["getByID"];
  getByDisplayName: AssetInventory["getByDisplayName"];
  listByDisplayName: AssetInventory["listByDisplayName"];
  create(options: CreateApiAssetOptions): Promise<Asset>;
  updateByID(options: UpdateApiAssetOptions): Promise<Asset | null>;
  addIdentifier(options: AddApiAssetIdentifierOptions): Promise<AssetIdentifierRecord | null>;
  updateIdentifierByID(
    options: UpdateApiAssetIdentifierOptions,
  ): Promise<AssetIdentifierRecord | null>;
  deleteIdentifierByID(
    options: DeleteApiAssetIdentifierOptions,
  ): Promise<AssetIdentifierRecord | null>;
  deleteByID(id: string, eventContext?: DomainEventContext): Promise<Asset | null>;
}

export interface UpdateApiAssetCustomFieldDefinitionOptions {
  id: string;
  definition: UpdateAssetCustomFieldDefinition;
  eventContext?: DomainEventContext;
}

export interface ReplaceApiAssetCustomFieldAssignmentsOptions {
  assetId: string;
  fieldIds: string[];
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface ReplaceApiAssetCustomFieldValuesOptions {
  assetId: string;
  values: UpdateAssetCustomFieldValue[];
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface ApiAssetCustomFields {
  listDefinitions: AssetCustomFields["listDefinitions"];
  getDefinitionByID: AssetCustomFields["getDefinitionByID"];
  createDefinition(
    definition: CreateAssetCustomFieldDefinition,
    eventContext?: DomainEventContext,
  ): Promise<AssetCustomFieldDefinition>;
  updateDefinitionByID(
    options: UpdateApiAssetCustomFieldDefinitionOptions,
  ): Promise<AssetCustomFieldDefinition | null>;
  deleteDefinitionByID(
    id: string,
    eventContext?: DomainEventContext,
  ): Promise<AssetCustomFieldDefinition | null>;
  listEffectiveValuesForAsset: AssetCustomFields["listEffectiveValuesForAsset"];
  listEffectiveValuesForAssets: AssetCustomFields["listEffectiveValuesForAssets"];
  listAvailableDefinitionsForAsset: AssetCustomFields["listAvailableDefinitionsForAsset"];
  replaceAssignmentsForAsset(
    options: ReplaceApiAssetCustomFieldAssignmentsOptions,
  ): Promise<AssetCustomFieldValue[] | null>;
  replaceValuesForAsset(
    options: ReplaceApiAssetCustomFieldValuesOptions,
  ): Promise<AssetCustomFieldValue[] | null>;
}

export interface ApiAssets {
  inventory: ApiAssetInventory;
  customFields: ApiAssetCustomFields;
}

function requirePerformedBy(eventContext?: DomainEventContext): string {
  if (!eventContext?.actor) {
    throw new TypeError("asset mutations require an authenticated actor");
  }

  return eventContext.actor;
}

export function decorateAssetsWithEvents(
  assets: Assets,
  domainEventEmitter: DomainEventEmitter,
): ApiAssets {
  const emitAssetEvent = createDomainEventEmitter<EventSubjects<AssetEventPayloads>>(
    domainEventEmitter,
    "asset",
  );
  const emitCustomFieldEvent = createDomainEventEmitter<EventSubjects<CustomFieldEventPayloads>>(
    domainEventEmitter,
    "asset-custom-field",
  );

  return {
    inventory: {
      listAll: assets.inventory.listAll.bind(assets.inventory),
      listAllWithCustomFields: assets.inventory.listAllWithCustomFields.bind(assets.inventory),
      getByID: assets.inventory.getByID.bind(assets.inventory),
      getByDisplayName: assets.inventory.getByDisplayName.bind(assets.inventory),
      listByDisplayName: assets.inventory.listByDisplayName.bind(assets.inventory),

      async create({ asset, user, eventContext }): Promise<Asset> {
        const outcome = await assets.inventory.create({ asset, performedBy: user.id });
        emitAssetEvent("asset.created", { asset: outcome.current }, eventContext);
        return outcome.asset;
      },

      async updateByID({ id, asset, user, eventContext }): Promise<Asset | null> {
        const outcome = await assets.inventory.updateByID({
          id,
          asset,
          performedBy: user.id,
        });
        if (!outcome) {
          return null;
        }

        if (outcome.changed) {
          emitAssetEvent(
            "asset.updated",
            { previous: outcome.previous, current: outcome.current },
            eventContext,
          );
        }
        return outcome.asset;
      },

      async addIdentifier({
        assetId,
        identifier,
        user,
        eventContext,
      }): Promise<AssetIdentifierRecord | null> {
        const outcome = await assets.inventory.addIdentifier({
          assetId,
          identifier,
          performedBy: user.id,
        });
        if (!outcome) {
          return null;
        }

        emitAssetEvent(
          "asset.updated",
          { previous: outcome.previous, current: outcome.current },
          eventContext,
        );
        return outcome.identifier;
      },

      async updateIdentifierByID({
        assetId,
        identifierId,
        identifier,
        user,
        eventContext,
      }): Promise<AssetIdentifierRecord | null> {
        const outcome = await assets.inventory.updateIdentifierByID({
          assetId,
          identifierId,
          identifier,
          performedBy: user.id,
        });
        if (!outcome) {
          return null;
        }

        if (outcome.changed) {
          emitAssetEvent(
            "asset.updated",
            { previous: outcome.previous, current: outcome.current },
            eventContext,
          );
        }
        return outcome.identifier;
      },

      async deleteIdentifierByID({
        assetId,
        identifierId,
        user,
        eventContext,
      }): Promise<AssetIdentifierRecord | null> {
        const outcome = await assets.inventory.deleteIdentifierByID({
          assetId,
          identifierId,
          performedBy: user.id,
        });
        if (!outcome) {
          return null;
        }

        emitAssetEvent(
          "asset.updated",
          { previous: outcome.previous, current: outcome.current },
          eventContext,
        );
        return outcome.identifier;
      },

      async deleteByID(id, eventContext): Promise<Asset | null> {
        const outcome = await assets.inventory.deleteByID({
          id,
          performedBy: requirePerformedBy(eventContext),
        });
        if (!outcome) {
          return null;
        }

        emitAssetEvent("asset.deleted", { asset: outcome.previous }, eventContext);
        return outcome.asset;
      },
    },

    customFields: {
      listDefinitions: assets.customFields.listDefinitions.bind(assets.customFields),
      getDefinitionByID: assets.customFields.getDefinitionByID.bind(assets.customFields),
      listEffectiveValuesForAsset: assets.customFields.listEffectiveValuesForAsset.bind(
        assets.customFields,
      ),
      listEffectiveValuesForAssets: assets.customFields.listEffectiveValuesForAssets.bind(
        assets.customFields,
      ),
      listAvailableDefinitionsForAsset: assets.customFields.listAvailableDefinitionsForAsset.bind(
        assets.customFields,
      ),

      async createDefinition(definition, eventContext): Promise<AssetCustomFieldDefinition> {
        const outcome = await assets.customFields.createDefinition({
          definition,
          performedBy: requirePerformedBy(eventContext),
        });
        emitCustomFieldEvent(
          "custom-field.created",
          { customFieldDefinition: outcome.current },
          eventContext,
        );
        return outcome.current;
      },

      async updateDefinitionByID({
        id,
        definition,
        eventContext,
      }): Promise<AssetCustomFieldDefinition | null> {
        const outcome = await assets.customFields.updateDefinitionByID({
          id,
          definition,
          performedBy: requirePerformedBy(eventContext),
        });
        if (!outcome) {
          return null;
        }

        if (outcome.changed) {
          emitCustomFieldEvent(
            "custom-field.updated",
            { previous: outcome.previous, current: outcome.current },
            eventContext,
          );
        }
        return outcome.current;
      },

      async deleteDefinitionByID(id, eventContext): Promise<AssetCustomFieldDefinition | null> {
        const outcome = await assets.customFields.deleteDefinitionByID({
          id,
          performedBy: requirePerformedBy(eventContext),
        });
        if (!outcome) {
          return null;
        }

        emitCustomFieldEvent(
          "custom-field.deleted",
          { customFieldDefinition: outcome.previous },
          eventContext,
        );
        return outcome.previous;
      },

      async replaceAssignmentsForAsset({
        assetId,
        fieldIds,
        user,
        eventContext,
      }): Promise<AssetCustomFieldValue[] | null> {
        const outcome = await assets.customFields.replaceAssignmentsForAsset({
          assetId,
          fieldIds,
          performedBy: user.id,
        });
        if (!outcome) {
          return null;
        }

        if (outcome.changed) {
          emitAssetEvent(
            "asset.updated",
            { previous: outcome.previous, current: outcome.current },
            eventContext,
          );
        }
        return outcome.values;
      },

      async replaceValuesForAsset({
        assetId,
        values,
        user,
        eventContext,
      }): Promise<AssetCustomFieldValue[] | null> {
        const outcome = await assets.customFields.replaceValuesForAsset({
          assetId,
          values,
          performedBy: user.id,
        });
        if (!outcome) {
          return null;
        }

        if (outcome.changed) {
          emitAssetEvent(
            "asset.updated",
            { previous: outcome.previous, current: outcome.current },
            eventContext,
          );
        }
        return outcome.values;
      },
    },
  };
}
