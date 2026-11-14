import { ResourceId } from '@deploy-crab/contracts/fields';
import { CreateHostInput, UpdateHostInput } from '@deploy-crab/contracts/host';
import { z } from 'zod';
import { createZodDto } from '../../../utils/zod-dto';

/** `POST /hosts` 的请求体 */
export class CreateHostDto extends createZodDto(CreateHostInput) {}

/** `PATCH /hosts/:id` 的请求体 */
export class UpdateHostDto extends createZodDto(UpdateHostInput) {}

/**
 * 路径参数 `:id`。id 会拼进存储的文件路径，先在这里校验成 UUID，
 * 非法时返回 400，而不是让存储层报出 500。
 */
export class HostParamsDto extends createZodDto(z.object({ id: ResourceId })) {}
