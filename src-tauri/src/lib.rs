use std::{
    io::{BufRead, BufReader, Write},
    net::{TcpListener, TcpStream},
    thread,
    time::Duration,
};

use tauri::State;

const YOUTUBE_PLAYER_HTML: &str = include_str!("../../public/yt-player.html");

struct PlayerPort(u16);

#[tauri::command]
fn player_port(port: State<'_, PlayerPort>) -> u16 {
    port.0
}

fn serve_player_page(mut stream: TcpStream) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;

    let mut request_line = String::new();
    {
        let mut reader = BufReader::new(&mut stream);
        reader.read_line(&mut request_line)?;
    }

    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or("");
    let path = request_parts.next().unwrap_or("").split('?').next().unwrap_or("");
    let valid = method == "GET" && path == "/yt-player.html";
    let (status, body) = if valid {
        ("200 OK", YOUTUBE_PLAYER_HTML)
    } else {
        ("404 Not Found", "Not found")
    };

    let headers = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: strict-origin-when-cross-origin\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(headers.as_bytes())?;
    stream.write_all(body.as_bytes())?;
    Ok(())
}

// Bind only to loopback and serve only the player document, not app assets.
fn start_player_server() -> std::io::Result<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();

    thread::Builder::new()
        .name("ubermensch-youtube-player".into())
        .spawn(move || {
            for incoming in listener.incoming() {
                match incoming {
                    Ok(stream) => {
                        if let Err(error) = serve_player_page(stream) {
                            log::debug!("YouTube player HTTP request failed: {error}");
                        }
                    }
                    Err(error) => log::warn!("YouTube player HTTP server stopped: {error}"),
                }
            }
        })?;

    Ok(port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = start_player_server().expect("failed to start local YouTube player server");

    tauri::Builder::default()
        .manage(PlayerPort(port))
        .invoke_handler(tauri::generate_handler![player_port])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
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
        .expect("error while building tauri application");
}
