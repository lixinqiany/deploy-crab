import { Cluster } from '@deploy-crab/contracts/cluster';
import { defineCollection } from '../storage/document-store';

/** 集群：需要人阅读和手工编辑，用 YAML 保存 */
export const ClusterCollection = defineCollection({
  name: 'clusters',
  schema: Cluster,
  format: 'yaml',
});
