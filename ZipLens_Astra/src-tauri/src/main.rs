// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // CLI 여부를 창·메뉴 생성 전에 판별합니다. Some(종료 코드)이면 GUI로 넘어가지 않습니다.
    if let Some(exit_code) = ziplens_lib::cli::run_if_requested() {
        std::process::exit(exit_code);
    }
    ziplens_lib::run()
}
