use serialport::SerialPort;
use std::time::Duration;

// Framework LED Matrix Constants
const BAUD_RATE: u32 = 115200;
const FRAMEWORK_VID: u16 = 0x32AC;
const MATRIX_PID: u16 = 0x0040; // Assuming 0x0040 based on scanning logic, verifying later

// A managed state to hold the open port if needed, 
// though for this MVP we might open/close on demand or keep it open.
// For robustness, opening on demand is safer for hot-plugging.

#[tauri::command]
pub fn update_matrix(img_data: Vec<u8>) -> Result<String, String> {
    // 1. Find the Matrix Serial Port
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    
    let matrix_port_info = ports.into_iter().find(|p| {
        if let serialport::SerialPortType::UsbPort(info) = &p.port_type {
            return info.vid == FRAMEWORK_VID; // checking VID mainly, PID if strictly needed
        }
        false
    });

    let port_name = match matrix_port_info {
        Some(info) => info.port_name,
        None => return Err("Framework Matrix not found".to_string()),
    };

    // 2. Open the Port
    let mut port = serialport::new(&port_name, BAUD_RATE)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| format!("Failed to open port {}: {}", port_name, e))?;

    // 3. Write Data
    // The protocol typically expects raw bytes or a specific header. 
    // For this MVP we assume the "img_data" is strictly the buffer the firmware expects.
    port.write_all(&img_data).map_err(|e| e.to_string())?;

    Ok("Updated".to_string())
}
