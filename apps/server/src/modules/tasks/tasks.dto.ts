import { CreateTaskInput, UpdateTaskInput } from '@deploy-crab/contracts/task';
import { ResourceId } from '@deploy-crab/contracts/fields';
import { z } from 'zod';
import { createZodDto } from '@/utils/zod-dto';

export class CreateTaskDto extends createZodDto(CreateTaskInput) {}
export class UpdateTaskDto extends createZodDto(UpdateTaskInput) {}
export class TaskParamsDto extends createZodDto(z.object({ id: ResourceId })) {}
