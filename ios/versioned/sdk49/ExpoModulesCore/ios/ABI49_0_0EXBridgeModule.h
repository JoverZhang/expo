// Copyright 2018-present 650 Industries. All rights reserved.

#import <ABI49_0_0React/ABI49_0_0RCTBridgeModule.h>

// Escape hatch for modules that both have to depend on ABI49_0_0React Native
// and want to be exported as an internal universal module.
#define ABI49_0_0EX_RCT_REGISTER_MODULE(external_name) \
  + (const NSString *)moduleName { return @#external_name; } \
  ABI49_0_0EX_EXPORT_MODULE_WITH_CUSTOM_LOAD(external_name, \
    ABI49_0_0RCT_EXTERN void ABI49_0_0RCTRegisterModule(Class); \
    ABI49_0_0RCTRegisterModule(self); \
  )

@protocol ABI49_0_0EXBridgeModule <ABI49_0_0RCTBridgeModule>

@optional

- (void)setBridge:(ABI49_0_0RCTBridge *)bridge;

@end
