import {
  AffectedResourceType,
  type FindingAffectedResource,
  type ObservationAffectedResource,
} from "@exposurenexus/contracts/model/affected-resource";

/**
 * Projects an observation's affected resource onto finding identity by dropping the
 * observation-only source snapshot fields: `reportedUrl`, `revision`, `version`, `tag` and
 * `displayName`.
 */
export function toFindingAffectedResource(
  resource: ObservationAffectedResource,
): FindingAffectedResource {
  switch (resource.type) {
    case AffectedResourceType.WebEndpoint: {
      const { reportedUrl: _, ...rest } = resource;
      return rest;
    }
    case AffectedResourceType.SourceCode: {
      const { revision: _, ...rest } = resource;
      return rest;
    }
    case AffectedResourceType.Package: {
      const { version: _, ...rest } = resource;
      return rest;
    }
    case AffectedResourceType.ContainerImage: {
      const { tag: _, ...rest } = resource;
      return rest;
    }
    case AffectedResourceType.CloudResource: {
      const { displayName: _, ...rest } = resource;
      return rest;
    }
    default:
      return resource;
  }
}
