use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_opener::OpenerExt;

fn build_temp_file_path(file_name: &str) -> Result<PathBuf, String> {
  let mut temp_dir = std::env::temp_dir();
  temp_dir.push("svarka-weld-messenger");
  fs::create_dir_all(&temp_dir).map_err(|error| error.to_string())?;

  let safe_name = file_name
    .chars()
    .map(|char| match char {
      '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
      _ => char,
    })
    .collect::<String>();

  let unique = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|error| error.to_string())?
    .as_millis();

  temp_dir.push(format!("{unique}-{safe_name}"));
  Ok(temp_dir)
}

fn to_local_path(path: FilePath) -> Result<PathBuf, String> {
  path.into_path()
    .map_err(|_| "Неподдерживаемый путь файла.".to_string())
}

#[tauri::command]
fn save_downloaded_attachment(app: AppHandle, file_name: String, bytes: Vec<u8>) -> Result<(), String> {
  let suggested_name = if file_name.trim().is_empty() {
    "attachment.bin".to_string()
  } else {
    file_name
  };

  let target_path = app
    .dialog()
    .file()
    .set_file_name(&suggested_name)
    .blocking_save_file();

  let Some(target_path) = target_path else {
    return Ok(());
  };

  let target_path = to_local_path(target_path)?;
  fs::write(target_path, bytes).map_err(|error| error.to_string())
}

#[tauri::command]
fn open_downloaded_attachment(app: AppHandle, file_name: String, bytes: Vec<u8>) -> Result<(), String> {
  let target_path = build_temp_file_path(&file_name)?;
  fs::write(&target_path, bytes).map_err(|error| error.to_string())?;
  app.opener()
    .open_path(target_path.to_string_lossy().to_string(), None::<&str>)
    .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      save_downloaded_attachment,
      open_downloaded_attachment
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
