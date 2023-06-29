/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

#import <ABI49_0_0React/ABI49_0_0RCTRootView.h>

/**
 * The interface provides a set of functions that allow other internal framework
 * classes to change the ABI49_0_0RCTRootViews's internal state.
 */
@interface ABI49_0_0RCTRootView ()

/**
 * This setter should be used only by ABI49_0_0RCTUIManager on ABI49_0_0React root view
 * intrinsic content size update.
 */
@property (readwrite, nonatomic, assign) CGSize intrinsicContentSize;

- (void)contentViewInvalidated;

@end
