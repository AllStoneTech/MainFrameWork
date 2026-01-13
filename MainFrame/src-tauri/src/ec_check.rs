use serde::Serialize;


#[derive(Serialize, Debug, Clone)]
pub enum EcStatus {
    Available,
    DriverMissing,
    NotFramework,
}

#[cfg(target_os = "windows")]
fn platform_check() -> EcStatus {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HANDLE, INVALID_HANDLE_VALUE, GENERIC_READ, GENERIC_WRITE};
    use windows::Win32::Storage::FileSystem::{CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL};
    
    // We try to open the DOS device name for the CrosEC driver
    // Common names: \\.\CrosEC or \\.\Global\CrosEC
    // We need wide strings for Windows API
    
    let path_str = "\\\\.\\CrosEC\0";
    let wide_path: Vec<u16> = path_str.encode_utf16().collect();

    unsafe {
        let handle: HANDLE = CreateFileW(
            PCWSTR(wide_path.as_ptr()),
            GENERIC_READ.0 | GENERIC_WRITE.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            HANDLE::default()
        ).unwrap_or(INVALID_HANDLE_VALUE); // unwrap_or to be safe vs panic, though CreateFile usually returns handle or INVALID

        if handle != INVALID_HANDLE_VALUE {
            // Close handle immediately, we just wanted to check existence
            let _ = windows::Win32::Foundation::CloseHandle(handle);
            EcStatus::Available
        } else {
            // Further refinement: Check GetLastError(). 
            // If strictly FileNotFound, then DriverMissing.
            // For now, simplicity:
            EcStatus::DriverMissing
        }
    }
}

#[cfg(target_os = "linux")]
fn platform_check() -> EcStatus {
    use std::path::Path;
    if Path::new("/dev/cros_ec").exists() {
        EcStatus::Available
    } else {
        // On Linux, if the device Node is missing, it could be "NotFramework" or kernel module not loaded.
        // We'll assume DriverMissing/KernelModuleMissing for safety.
        EcStatus::DriverMissing
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn platform_check() -> EcStatus {
    EcStatus::NotFramework 
}

#[tauri::command]
pub fn check_ec_status() -> EcStatus {
    let status = platform_check();
    println!("EC Status Check: {:?}", status);
    status
}
