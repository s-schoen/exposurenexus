import type { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import type { Generated } from "kysely";

export type AssetCustomFieldStoredValue = string | number;

export interface AssetCustomFieldTable {
  id: Generated<string>;
  key: string;
  name: string;
  type: AssetCustomFieldType;
  required: Generated<boolean>;
  defaultValue: AssetCustomFieldStoredValue | null;
}

export interface AssetCustomFieldOptionTable {
  id: Generated<string>;
  fieldId: string;
  value: string;
  label: string;
}

export interface AssetCustomFieldValueTable {
  assetId: string;
  fieldId: string;
  value: AssetCustomFieldStoredValue;
}

export interface AssetCustomFieldAssignmentTable {
  assetId: string;
  fieldId: string;
}
