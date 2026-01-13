use hidapi::HidApi;

const FRAMEWORK_VID: u16 = 0x32AC;
const USAGE_PAGE: u16 = 0xFF60; // Common Raw HID usage page for QMK

#[tauri::command]
pub fn set_keyboard_color(r: u8, g: u8, b: u8) -> Result<String, String> {
    println!("Setting Keyboard Color to R:{} G:{} B:{}", r, g, b);

    let api = HidApi::new().map_err(|e| e.to_string())?;
    
    // Find gateway to QMK
    // We look for VID + Usage Page 0xFF60 (Raw HID)
    let device_info = api.device_list().find(|d| {
        d.vendor_id() == FRAMEWORK_VID && d.usage_page() == USAGE_PAGE
    }).ok_or("Keyboard not found (Raw HID Interface missing)".to_string())?;

    let device = device_info.open_device(&api).map_err(|e| e.to_string())?;

    // QMK Raw HID packet size is usually 32 bytes
    let mut packet = [0u8; 32];
    // Byte 0: Report ID (0 if not used, but hidapi requires it for `write` usually)
    packet[0] = 0x00; 
    
    // Custom Protocol for "Set Color": [0x07, R, G, B]
    // Note: This must match the handler in the QMK firmware (raw_hid_receive)
    packet[1] = 0x07; // Command ID for "Lighting" (Placeholder)
    packet[2] = r;
    packet[3] = g;
    packet[4] = b;

    device.write(&packet).map_err(|e| e.to_string())?;

    Ok("Color Updated".to_string())
}
