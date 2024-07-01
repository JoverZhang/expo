import EventEmitter, { type EventSubscription } from './EventEmitter';
import { LegacyEventEmitter } from './LegacyEventEmitter';
import NativeModule from './NativeModule';
import NativeModulesProxy from './NativeModulesProxy';
import { ProxyNativeModule } from './NativeModulesProxy.types';
import { requireNativeViewManager } from './NativeViewManagerAdapter';
import Platform from './Platform';
import SharedObject from './SharedObject';
import { CodedError } from './errors/CodedError';
import { UnavailabilityError } from './errors/UnavailabilityError';

import './sweet/setUpErrorManager.fx';
import './web/index';

export type * from './ts-declarations/global';

export { default as uuid } from './uuid';

export {
  NativeModulesProxy,
  ProxyNativeModule,
  Platform,
  requireNativeViewManager,
  // Globals
  EventEmitter,
  SharedObject,
  NativeModule,
  // Errors
  CodedError,
  UnavailabilityError,
  // Types
  EventSubscription,
  // Deprecated
  LegacyEventEmitter,
};

export * from './requireNativeModule';
export * from './createWebModule';
export * from './TypedArrays.types';

export * from './PermissionsInterface';
export * from './PermissionsHook';

export * from './Refs';

export * from './hooks/useReleasingSharedObject';
export * from './reload';
