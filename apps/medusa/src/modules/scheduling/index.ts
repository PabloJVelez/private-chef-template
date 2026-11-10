import { Module } from '@medusajs/framework/utils';
import SchedulingModuleService from './service';
export const SCHEDULING_MODULE = 'scheduling';
export default Module(SCHEDULING_MODULE, { service: SchedulingModuleService });
