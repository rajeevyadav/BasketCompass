// Native desktop entry point. It hosts the static dist/ web app in a Tauri window;
// all application logic stays in the shared JavaScript so the desktop build and the
// web build behave identically. The windows_subsystem attribute hides the console
// window on a release Windows build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running BasketCompass");
}
