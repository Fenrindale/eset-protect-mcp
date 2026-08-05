export type EdrRuleExclusionInput = {
  enabled: boolean;
  xmlDefinition: string;
  ruleUuids: string[];
  note?: string;
  scopes?: Array<{
    deviceUuid?: string;
    deviceGroupUuid?: string;
  }>;
};

const SHA1_LIKE_VALUE = /\b[a-f0-9]{40}\b/gi;

export function countDistinctSha1LikeValues(xmlDefinition: unknown): number {
  if (typeof xmlDefinition !== "string") return 0;
  return new Set((xmlDefinition.match(SHA1_LIKE_VALUE) ?? []).map((value) => value.toLowerCase())).size;
}

export function edrRuleExclusionCreateFailure(
  error: unknown,
  exclusion: Partial<EdrRuleExclusionInput>,
): Record<string, unknown> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const sha1LikeValuesCount = countDistinctSha1LikeValues(exclusion.xmlDefinition);
  const wafRejected = /ESET API error 403\b/i.test(errorMessage) && /Request Rejected/i.test(errorMessage);
  const multipleSha1Values = sha1LikeValuesCount > 1;

  let hint =
    "Ensure ruleUuids contains valid EDR rule UUIDs (use list_edr_rules) and xmlDefinition is valid ESET Inspect XML.";
  if (wafRejected && multipleSha1Values) {
    hint =
      "ESET/WAF rejected XML containing multiple SHA1-like values. Provide separate complete XML definitions to " +
      "create_edr_rule_exclusions_batch, normally one SHA1 per item. MCP does not rewrite, split, or retry XML " +
      "automatically because that can change Boolean rule semantics or create duplicate exclusions.";
  } else if (wafRejected) {
    hint =
      "ESET/WAF rejected the request content. Review the Support ID in error, then simplify the XML or submit " +
      "separate complete definitions with create_edr_rule_exclusions_batch. MCP does not retry rejected writes automatically.";
  }

  const failure: Record<string, unknown> = {
    error: errorMessage,
    hint,
    payloadSent: {
      exclusionKeys: Object.entries(exclusion)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key),
      ruleUuidsCount: Array.isArray(exclusion.ruleUuids) ? exclusion.ruleUuids.length : 0,
      xmlDefinitionLength: typeof exclusion.xmlDefinition === "string" ? exclusion.xmlDefinition.length : 0,
      sha1LikeValuesCount,
      scopesCount: Array.isArray(exclusion.scopes) ? exclusion.scopes.length : 0,
    },
  };

  if (wafRejected) {
    failure.upstreamRejection = {
      kind: "ESET_WAF_REQUEST_REJECTED",
      httpStatus: 403,
      automaticRetry: false,
      sha1LikeValuesCount,
      ...(multipleSha1Values ? { recommendedTool: "create_edr_rule_exclusions_batch" } : {}),
    };
  }

  return failure;
}
