import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateSecret } from '@deploy-crab/contracts/secret';
import { LocalSecretStore } from '@deploy-crab/core/secrets/local-secret-store';
import { createZodDto } from '@/utils/zod-dto';

class CreateSecretDto extends createZodDto(CreateSecret) {}
@Controller('secrets')
export class SecretsController {
  constructor(private readonly secrets: LocalSecretStore) {}
  @Get() list() {
    return this.secrets.list();
  }
  @Post() create(@Body() body: CreateSecretDto) {
    return this.secrets.create(body);
  }
}
