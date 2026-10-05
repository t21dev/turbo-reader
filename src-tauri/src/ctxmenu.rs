//! Windows: the webview's own right-click menu, kept but trimmed.
//!
//! WebView2's menu is a browser's. Next to the useful items it offers Back,
//! Reload, Print, Open link in new window, a QR code, and More tools with the
//! developer tools, none of which belong in an app. Before it opens, every
//! item outside an allowlist is removed, and the separators tidied, so what
//! is left is the clipboard, editing, links and pictures. When nothing is
//! left, no menu opens at all.

use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2ContextMenuItemCollection, ICoreWebView2ContextMenuRequestedEventArgs,
    ICoreWebView2_11, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND,
    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR,
};
use webview2_com::{take_pwstr, ContextMenuRequestedEventHandler};
use windows_core::{Interface, PWSTR};

/// WebView2's names for the items worth keeping.
const KEEP: &[&str] = &[
    "undo",
    "redo",
    "cut",
    "copy",
    "paste",
    "pasteAndMatchStyle",
    "selectAll",
    "emoji",
    "copyLinkLocation",
    "copyImage",
    "copyImageLocation",
    "saveImageAs",
];

pub fn install(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        // Older runtimes without the event keep the full menu.
        let Ok(core) = core.cast::<ICoreWebView2_11>() else {
            return;
        };
        let handler = ContextMenuRequestedEventHandler::create(Box::new(|_, args| {
            if let Some(args) = args {
                let _ = trim(&args);
            }
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core.add_ContextMenuRequested(&handler, &mut token);
    });
}

unsafe fn is_separator(items: &ICoreWebView2ContextMenuItemCollection, i: u32) -> bool {
    let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND::default();
    items
        .GetValueAtIndex(i)
        .and_then(|item| item.Kind(&mut kind))
        .is_ok()
        && kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR
}

unsafe fn count(items: &ICoreWebView2ContextMenuItemCollection) -> windows_core::Result<u32> {
    let mut n = 0u32;
    items.Count(&mut n)?;
    Ok(n)
}

unsafe fn trim(args: &ICoreWebView2ContextMenuRequestedEventArgs) -> windows_core::Result<()> {
    let items = args.MenuItems()?;

    // Backwards, so removing an item leaves the indexes still to visit alone.
    for i in (0..count(&items)?).rev() {
        if is_separator(&items, i) {
            continue;
        }
        let mut name = PWSTR::null();
        items.GetValueAtIndex(i)?.Name(&mut name)?;
        let name = take_pwstr(name);
        if !KEEP.contains(&name.as_str()) {
            items.RemoveValueAtIndex(i)?;
        }
    }

    // A separator only between two groups: none first, last, or doubled.
    let mut i = 0;
    while i < count(&items)? {
        let n = count(&items)?;
        let stray =
            is_separator(&items, i) && (i == 0 || i == n - 1 || is_separator(&items, i - 1));
        if stray {
            items.RemoveValueAtIndex(i)?;
            // The one before may now be last.
            i = i.saturating_sub(1);
        } else {
            i += 1;
        }
    }

    if count(&items)? == 0 {
        // Handled with nothing in it: no menu, rather than an empty box.
        args.SetHandled(true)?;
    }
    Ok(())
}
