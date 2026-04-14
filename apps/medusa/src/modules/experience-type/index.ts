import ExperienceTypeModuleService from './service';
import { Module } from '@medusajs/framework/utils';

export const EXPERIENCE_TYPE_MODULE = 'experienceTypeModuleService';

export default Module(EXPERIENCE_TYPE_MODULE, {
  service: ExperienceTypeModuleService,
});
