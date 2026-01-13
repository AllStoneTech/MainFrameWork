use rusb::{Device, DeviceDescriptor, GlobalContext};
use serde::Serialize;
use std::time::Duration;

const FRAMEWORK_VID: u16 = 0x32AC;

#[derive(Serialize, Debug, Clone)]
pub struct ConnectedDevice {
    pub vid: u16,
    pub pid: u16,
    pub description: String,
    pub device_type: String, // "Keyboard", "Macropad", "Matrix", "Unknown"
}

// Helper to determine device type based on PID (Simplified for MVP)
fn identify_device(pid: u16) -> (String, String) {
    match pid {
        0x0010..=0x001F => ("Laptop 16 Keyboard".to_string(), "Keyboard".to_string()),
        0x0020..=0x002F => ("Laptop 16 Numpad".to_string(), "Numpad".to_string()),
        0x0030..=0x003F => ("Laptop 16 Macropad".to_string(), "Macropad".to_string()),
        0x0040..=0x004F => ("LED Matrix".to_string(), "Matrix".to_string()),
        _ => (format!("Unknown Device ({:04x})", pid), "Unknown".to_string()),
    }
}

#[tauri::command]
pub fn scan_devices() -> Result<Vec<ConnectedDevice>, String> {
    println!("Scanning for Framework Devices (VID: {:04x})...", FRAMEWORK_VID);
    
    let mut found_devices = Vec::new();

    if let Ok(devices) = rusb::devices() {
        for device in devices.iter() {
            if let Ok(desc) = device.device_descriptor() {
                if desc.vendor_id() == FRAMEWORK_VID {
                    let (description, device_type) = identify_device(desc.product_id());
                    
                    found_devices.push(ConnectedDevice {
                        vid: desc.vendor_id(),
                        pid: desc.product_id(),
                        description,
                        device_type,
                    });
                }
            }
        }
    } else {
        return Err("Failed to access USB bus".to_string());
    }

    println!("Found {} devices.", found_devices.len());
    Ok(found_devices)
}
