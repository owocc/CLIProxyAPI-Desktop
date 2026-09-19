//go:build darwin

package service

/*
#cgo CFLAGS: -mmacosx-version-min=10.14 -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework WebKit

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#include <stdlib.h>

void darwinApplyWindowBackdrop(void* nsWindow, const char* appearanceName) {
    if (nsWindow == NULL) return;

    // 1. Convert C string to immutable NSString synchronously BEFORE dispatch_async
    // to prevent dangling pointer when Go frees the C string on function exit.
    NSString *themeName = (appearanceName != NULL) ? [NSString stringWithUTF8String:appearanceName] : @"";

    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow* window = (__bridge NSWindow*)nsWindow;
        if (!window) return;

        // 2. Determine and apply native NSAppearance (Dark / Light)
        NSAppearance *appearance = nil;
        if ([themeName isEqualToString:@"dark"]) {
            if (@available(macOS 10.14, *)) {
                appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
            }
        } else if ([themeName isEqualToString:@"light"]) {
            if (@available(macOS 10.14, *)) {
                appearance = [NSAppearance appearanceNamed:NSAppearanceNameAqua];
            }
        }
        [window setAppearance:appearance];

        // 3. Set window transparent & non-opaque so visual effect view shows
        [window setOpaque:NO];
        [window setBackgroundColor:[NSColor clearColor]];

        // 4. Ensure NSVisualEffectView exists with native sidebar material and sync appearance
        NSView *contentView = [window contentView];
        if (contentView != nil) {
            NSVisualEffectView *ve = nil;
            for (NSView *sub in [contentView subviews]) {
                if ([sub isKindOfClass:[NSVisualEffectView class]]) {
                    ve = (NSVisualEffectView*)sub;
                    break;
                }
            }
            if (ve == nil) {
                ve = [[NSVisualEffectView alloc] initWithFrame:[contentView bounds]];
                [ve setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];
                [ve setBlendingMode:NSVisualEffectBlendingModeBehindWindow];
                [contentView addSubview:ve positioned:NSWindowBelow relativeTo:nil];
            }
            [ve setMaterial:NSVisualEffectMaterialSidebar];
            [ve setState:NSVisualEffectStateActive];
            [ve setAppearance:appearance];

            // 5. Force WKWebView drawsBackground to NO recursively
            NSMutableArray *queue = [NSMutableArray arrayWithObject:contentView];
            while ([queue count] > 0) {
                NSView *curr = [queue objectAtIndex:0];
                [queue removeObjectAtIndex:0];
                if ([curr isKindOfClass:NSClassFromString(@"WKWebView")]) {
                    @try {
                        [curr setValue:@NO forKey:@"drawsBackground"];
                    } @catch (NSException *e) {}
                }
                [queue addObjectsFromArray:[curr subviews]];
            }
        }
    });
}
*/
import "C"
import (
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func applyNativeWindowBackdrop(win *application.WebviewWindow, theme string) {
	if win == nil {
		return
	}
	handle := win.NativeWindow()
	if handle == nil {
		return
	}
	cTheme := C.CString(theme)
	defer C.free(unsafe.Pointer(cTheme))
	C.darwinApplyWindowBackdrop(handle, cTheme)
}
