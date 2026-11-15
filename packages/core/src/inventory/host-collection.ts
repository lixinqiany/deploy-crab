import { Host } from '@deploy-crab/contracts/host';
import { defineCollection } from '../storage/document-store';

/** 主机：需要人阅读和手工编辑，用 YAML 保存 */
export const HostCollection = defineCollection({
  name: 'hosts',
  schema: Host,
  format: 'yaml',
});
