import { Module } from '@medusajs/framework/utils';
import AvailabilityModuleService from './service';
export const AVAILABILITY_MODULE = 'availability';
export default Module(AVAILABILITY_MODULE, { service: AvailabilityModuleService });
