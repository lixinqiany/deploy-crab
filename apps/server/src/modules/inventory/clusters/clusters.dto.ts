import {
  CreateClusterInput,
  UpdateClusterInput,
} from '@deploy-crab/contracts/cluster';
import { ResourceId } from '@deploy-crab/contracts/fields';
import { z } from 'zod';
import { createZodDto } from '@/utils/zod-dto';

/** `POST /clusters` 的请求体 */
export class CreateClusterDto extends createZodDto(CreateClusterInput) {}

/** `PATCH /clusters/:id` 的请求体 */
export class UpdateClusterDto extends createZodDto(UpdateClusterInput) {}

/** 路径参数 `:id`，先校验成 UUID，理由同 `HostParamsDto` */
export class ClusterParamsDto extends createZodDto(
  z.object({ id: ResourceId }),
) {}
