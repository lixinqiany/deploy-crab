import type { SessionDraft } from '@deploy-crab/contracts/session';

/** 字段写入顺序不代表草稿变更，尤其新增的可选 targetSelection 会在 API 解析后重排。 */
export const draftFingerprint = (draft: SessionDraft): string => {
  const target = draft.targetSelection;
  const selection = !target
    ? null
    : target.kind === 'hosts'
      ? ['hosts', target.hostIds]
      : [
          'cluster',
          target.clusterId,
          target.scope.kind,
          target.scope.kind === 'groups'
            ? target.scope.groups
            : target.scope.kind === 'hosts'
              ? target.scope.hostIds
              : [],
        ];
  return JSON.stringify([
    draft.taskId,
    draft.hostIds,
    Object.entries(draft.fields).sort(([a], [b]) => a.localeCompare(b)),
    draft.skippedSteps,
    draft.dependsOn,
    selection,
  ]);
};
