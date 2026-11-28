//! Running from the Microsoft Store package (MSIX).
//!
//! The Store copy is the same exe inside a package, and a package changes a
//! few things the plain installer takes for granted:
//!
//! - Start at login is a startup task declared in the manifest. A package's
//!   writes to the registry Run key are virtualised and never run, and the
//!   user can switch the task off in Task Manager.
//! - The install folder's name carries the version, so agents start the app
//!   through the `turbo-reader.exe` execution alias, which stays put across
//!   updates.
//! - The library lives in the package's own LocalState folder. Windows removes
//!   it on uninstall, and it is never shared with an installer copy, whose
//!   database a packaged copy could otherwise split across two folders.
//! - Notifications have to carry the package's own app ID.
//!
//! The IDs below must match `msix/Package.appxmanifest`.

#![cfg_attr(not(windows), allow(dead_code))]

use std::path::PathBuf;

/// The `<Application Id>` in the manifest.
const APP_ID: &str = "App";
/// The startup task's `TaskId` in the manifest.
const STARTUP_TASK: &str = "TurboReaderAtLogin";
/// The execution alias in the manifest.
const ALIAS: &str = "turbo-reader.exe";

/// The package family name, when this copy runs from a package.
pub fn family_name() -> Option<&'static str> {
    #[cfg(windows)]
    {
        static NAME: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
        NAME.get_or_init(current_family_name).as_deref()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[cfg(windows)]
fn current_family_name() -> Option<String> {
    use windows_sys::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER;
    use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFamilyName;
    let mut len = 0u32;
    // Unpackaged, this returns APPMODEL_ERROR_NO_PACKAGE instead.
    if unsafe { GetCurrentPackageFamilyName(&mut len, std::ptr::null_mut()) }
        != ERROR_INSUFFICIENT_BUFFER
    {
        return None;
    }
    let mut buf = vec![0u16; len as usize];
    if unsafe { GetCurrentPackageFamilyName(&mut len, buf.as_mut_ptr()) } != 0 {
        return None;
    }
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    Some(String::from_utf16_lossy(&buf[..end]))
}

/// The package's LocalState folder, where a packaged copy keeps everything.
pub fn data_dir() -> Option<PathBuf> {
    let name = family_name()?;
    Some(
        dirs::data_local_dir()?
            .join("Packages")
            .join(name)
            .join("LocalState"),
    )
}

/// The execution alias agents start the packaged app through.
pub fn alias_path() -> Option<PathBuf> {
    family_name()?;
    Some(
        dirs::data_local_dir()?
            .join("Microsoft")
            .join("WindowsApps")
            .join(ALIAS),
    )
}

/// Whether Windows started this launch from the startup task, at sign-in.
pub fn launched_at_login() -> bool {
    #[cfg(windows)]
    {
        use windows::ApplicationModel::Activation::ActivationKind;
        use windows::ApplicationModel::AppInstance;
        family_name().is_some()
            && AppInstance::GetActivatedEventArgs()
                .and_then(|args| args.Kind())
                .is_ok_and(|kind| kind == ActivationKind::StartupTask)
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(windows)]
fn startup_task() -> Result<windows::ApplicationModel::StartupTask, String> {
    windows::ApplicationModel::StartupTask::GetAsync(&STARTUP_TASK.into())
        .and_then(|op| op.join())
        .map_err(|e| format!("Could not reach the startup task: {e}"))
}

/// Whether the startup task is on. Blocks, so call it off the main thread.
pub fn start_at_login() -> Result<bool, String> {
    #[cfg(windows)]
    {
        use windows::ApplicationModel::StartupTaskState as S;
        let state = startup_task()?.State().map_err(|e| e.to_string())?;
        Ok(matches!(state, S::Enabled | S::EnabledByPolicy))
    }
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

/// Switch the startup task on or off and return whether it is now on. Windows
/// will not switch on a task the user or a policy turned off, so that is an
/// error naming where to change it. Blocks, so call it off the main thread.
pub fn set_start_at_login(on: bool) -> Result<bool, String> {
    #[cfg(windows)]
    {
        use windows::ApplicationModel::StartupTaskState as S;
        let task = startup_task()?;
        if !on {
            task.Disable().map_err(|e| e.to_string())?;
            return Ok(false);
        }
        let state = task
            .RequestEnableAsync()
            .and_then(|op| op.join())
            .map_err(|e| e.to_string())?;
        match state {
            S::Enabled | S::EnabledByPolicy => Ok(true),
            S::DisabledByUser => Err("Turbo Reader is switched off in Task Manager > Startup apps. Switch it on there.".into()),
            S::DisabledByPolicy => Err("A policy on this computer keeps Turbo Reader from starting at login.".into()),
            _ => Ok(false),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = on;
        Ok(false)
    }
}

/// Show a notification under the package's own app ID. Returns false when
/// this copy is not packaged, so the caller can use the usual route.
pub fn notify(title: &str, body: &str) -> bool {
    #[cfg(windows)]
    {
        let Some(name) = family_name() else {
            return false;
        };
        let aumid = format!("{name}!{APP_ID}");
        let (title, body) = (title.to_owned(), body.to_owned());
        // Off the calling thread, as the notification plugin does.
        std::thread::spawn(move || {
            let _ = tauri_winrt_notification::Toast::new(&aumid)
                .title(&title)
                .text1(&body)
                .show();
        });
        true
    }
    #[cfg(not(windows))]
    {
        let _ = (title, body);
        false
    }
}
