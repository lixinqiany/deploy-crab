import { createConfig } from '@deploy-crab/eslint-config';
import { reactConfig } from '@deploy-crab/eslint-config/react';

export default createConfig(import.meta.dirname, reactConfig);
