import { expect, it } from 'vitest';
import { SessionDraft } from '@deploy-crab/contracts/session';
import { draftFingerprint } from './session-draft-model';

it('新选择的目标保存后不因字段顺序误报未保存，参数内容和目标变化仍会被发现', () => {
  const before = {
    ...SessionDraft.parse({}),
    fields: { b: '2', a: '1' },
    targetSelection: {
      kind: 'hosts' as const,
      hostIds: ['00000000-0000-4000-8000-000000000001'],
    },
  };
  const persisted = SessionDraft.parse({
    ...before,
    fields: { a: '1', b: '2' },
  });
  expect(draftFingerprint(before)).toBe(draftFingerprint(persisted));
  expect(
    draftFingerprint({
      ...before,
      targetSelection: { kind: 'hosts', hostIds: [] },
    }),
  ).not.toBe(draftFingerprint(persisted));
  expect(draftFingerprint({ ...before, fields: { b: '3', a: '1' } })).not.toBe(
    draftFingerprint(persisted),
  );
});
