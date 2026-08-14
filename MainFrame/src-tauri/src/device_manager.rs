use framework_lib::audio_card::AUDIO_CARD_PID;
use serde::Serialize;

const FRAMEWORK_VID: u16 = 0x32AC;

#[derive(Serialize, Debug, Clone)]
pub struct ConnectedDevice {
    pub vid: u16,
    pub pid: u16,
    pub description: String,
    pub device_type: String, // "Keyboard", "Matrix", "Expansion", "Unknown"
}

// Maps a Framework-VID device's PID to a friendly name/type. Entries below
// are PIDs confirmed against real hardware (Windows Device Manager +, for
// the Matrix, a live serial round-trip — see matrix_control.rs) or sourced
// directly from FrameworkComputer/framework-system's own constants (the
// Audio Card PID). This replaces an earlier guessed PID-range scheme that
// had never been verified and silently misclassified the LED Matrix
// (0x0020) as a Numpad.
//
// Only Expansion Cards with their own chip/firmware (HDMI/DisplayPort,
// Audio) enumerate as distinct USB devices at all — confirmed against
// framework-system's own feature list, which only offers firmware-info
// commands for those two. Plain USB-A/USB-C/SD/Storage/Ethernet cards are
// passive pass-throughs with no identity of their own; nothing shows up
// for them until something is plugged into the port, and even then it's
// the plugged-in peripheral's PID, not the card's. Numpad/Macropad PIDs
// are also still unconfirmed — both intentionally fall through to
// "Unknown" rather than guess again.
fn identify_device(pid: u16) -> (String, String) {
    match pid {
        0x0012 => ("Framework Laptop 16 Keyboard".to_string(), "Keyboard".to_string()),
        0x0020 => ("Framework Laptop 16 LED Matrix".to_string(), "Matrix".to_string()),
        0x0002 => ("HDMI Expansion Card".to_string(), "Expansion".to_string()),
        pid if pid == AUDIO_CARD_PID => ("Audio Expansion Card".to_string(), "Expansion".to_string()),
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
