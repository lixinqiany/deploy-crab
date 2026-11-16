import { describe, expect, it } from 'vitest';
import {
  resolveTargetSelection,
  TargetSelection,
} from '@deploy-crab/contracts/execution-target';
import { SessionDraft } from '@deploy-crab/contracts/session';

const clusters = [
  {
    id: 'cluster',
    name: '测试集群',
    members: [
      { hostId: 'a', groups: ['app', 'infra'] },
      { hostId: 'b', groups: ['app'] },
      { hostId: 'c', groups: ['db'] },
    ],
  },
];
const hosts = ['a', 'b', 'c', 'outside'].map((id) => ({ id }));

describe('执行目标解析', () => {
  it('全部成员、分组并集、指定成员分别解析，交叉分组不重复执行', () => {
    expect(
      resolveTargetSelection(
        { kind: 'cluster', clusterId: 'cluster', scope: { kind: 'all' } },
        clusters,
        hosts,
      ).hostIds,
    ).toEqual(['a', 'b', 'c']);
    expect(
      resolveTargetSelection(
        {
          kind: 'cluster',
          clusterId: 'cluster',
          scope: { kind: 'groups', groups: ['app', 'infra'] },
        },
        clusters,
        hosts,
      ),
    ).toMatchObject({ label: '测试集群 / app、infra', hostIds: ['a', 'b'] });
    expect(
      resolveTargetSelection(
        {
          kind: 'cluster',
          clusterId: 'cluster',
          scope: { kind: 'hosts', hostIds: ['c'] },
        },
        clusters,
        hosts,
      ).hostIds,
    ).toEqual(['c']);
  });
  it('单独主机不要求属于集群', () => {
    expect(
      resolveTargetSelection(
        { kind: 'hosts', hostIds: ['outside'] },
        [],
        hosts,
      ),
    ).toMatchObject({ label: '单独主机', hostIds: ['outside'] });
  });
  it('拒绝已删除集群、分组、主机和越界成员', () => {
    expect(() =>
      resolveTargetSelection(
        { kind: 'cluster', clusterId: 'gone', scope: { kind: 'all' } },
        clusters,
        hosts,
      ),
    ).toThrow('集群已不存在');
    expect(() =>
      resolveTargetSelection(
        {
          kind: 'cluster',
          clusterId: 'cluster',
          scope: { kind: 'groups', groups: ['gone'] },
        },
        clusters,
        hosts,
      ),
    ).toThrow('分组已不存在');
    expect(() =>
      resolveTargetSelection(
        {
          kind: 'cluster',
          clusterId: 'cluster',
          scope: { kind: 'hosts', hostIds: ['outside'] },
        },
        clusters,
        hosts,
      ),
    ).toThrow('不属于这个集群');
    expect(() =>
      resolveTargetSelection(
        { kind: 'hosts', hostIds: ['gone'] },
        clusters,
        hosts,
      ),
    ).toThrow('已被删除');
  });
  it('空范围不能执行，超过单次并发派发上限需缩小范围', () => {
    expect(() =>
      resolveTargetSelection(
        {
          kind: 'cluster',
          clusterId: 'cluster',
          scope: { kind: 'groups', groups: [] },
        },
        clusters,
        hosts,
      ),
    ).toThrow('至少一个分组');
    expect(() =>
      resolveTargetSelection({ kind: 'hosts', hostIds: [] }, [], hosts),
    ).toThrow('没有执行主机');
    const many = Array.from({ length: 33 }, (_, i) => ({
      hostId: `host-${i}`,
      groups: ['app'],
    }));
    expect(() =>
      resolveTargetSelection(
        { kind: 'cluster', clusterId: 'big', scope: { kind: 'all' } },
        [{ id: 'big', name: '大集群', members: many }],
        many.map(({ hostId }) => ({ id: hostId })),
      ),
    ).toThrow('最多执行 32 台');
  });
  it('旧草稿仍能加载，新草稿允许暂未选完的范围', () => {
    expect(SessionDraft.parse({ hostIds: [] }).targetSelection).toBeUndefined();
    expect(TargetSelection.parse({ kind: 'hosts', hostIds: [] })).toEqual({
      kind: 'hosts',
      hostIds: [],
    });
  });
});
