use crate::{github::Result, store::read_snapshot};
use std::{fs, io::Write, path::Path};
use tiny_http::{Header, Method, Response, Server};
pub fn serve(state: &Path, assets: &Path, port: u16) -> Result<()> {
    let server = Server::http(format!("127.0.0.1:{port}")).map_err(|e| e.to_string())?;
    println!("Isoscope replacement http://127.0.0.1:{port}");
    for req in server.incoming_requests() {
        let path = req.url().split('?').next().unwrap_or("/");
        let (status, mime, body) = if req.method() != &Method::Get {
            (405, "text/plain", b"read-only API".to_vec())
        } else if path == "/api/snapshot" {
            match read_snapshot(state) {
                Ok(s) => (
                    200,
                    "application/json",
                    serde_json::to_vec(&s).map_err(|e| e.to_string())?,
                ),
                Err(_) => (
                    503,
                    "application/json",
                    br#"{"status":"unknown","error":"No complete forge snapshot available"}"#
                        .to_vec(),
                ),
            }
        } else if path == "/api/events" {
            match read_snapshot(state) {
                Ok(snapshot) => (
                    200,
                    "application/json",
                    serde_json::to_vec(&crate::events::from_snapshot(&snapshot))
                        .map_err(|e| e.to_string())?,
                ),
                Err(_) => (503, "application/json", b"[]".to_vec()),
            }
        } else if path == "/api/graph" {
            (
                200,
                "application/json",
                fs::read(state.join("graph.json")).unwrap_or_else(|_| b"null".to_vec()),
            )
        } else if path == "/api/refresh-status" {
            (
                200,
                "application/json",
                fs::read(state.join("refresh-status.json")).unwrap_or_else(|_| b"null".to_vec()),
            )
        } else if path.split('/').any(|s| s == "..") || path.contains('%') || path.contains('\\') {
            (400, "text/plain", b"invalid path".to_vec())
        } else {
            let relative = if path == "/" {
                "index.html"
            } else {
                path.trim_start_matches('/')
            };
            let candidate = assets.join(relative);
            match candidate.canonicalize() {
                Ok(p) if assets.canonicalize().is_ok_and(|a| p.starts_with(a)) => {
                    match fs::read(&p) {
                        Ok(bytes) => {
                            let mime = match p.extension().and_then(|s| s.to_str()) {
                                Some("js") => "text/javascript",
                                Some("css") => "text/css",
                                Some("json") => "application/json",
                                Some("woff2") => "font/woff2",
                                _ => "text/html",
                            };
                            (200, mime, bytes)
                        }
                        Err(_) => (404, "text/plain", b"not found".to_vec()),
                    }
                }
                _ => (404, "text/plain", b"not found".to_vec()),
            }
        };
        let etag = format!("\"{}\"", crate::github::hash(&body));
        let not_modified = status == 200
            && req
                .headers()
                .iter()
                .any(|h| h.field.equiv("If-None-Match") && h.value.as_str() == etag);
        let gzip = !not_modified
            && body.len() > 1024
            && req.headers().iter().any(|h| {
                h.field.equiv("Accept-Encoding")
                    && h.value.as_str().split(',').any(|e| e.trim() == "gzip")
            });
        let body = if not_modified {
            Vec::new()
        } else if gzip {
            let mut encoder =
                flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
            encoder.write_all(&body).map_err(|e| e.to_string())?;
            encoder.finish().map_err(|e| e.to_string())?
        } else {
            body
        };
        let mut response =
            Response::from_data(body).with_status_code(if not_modified { 304 } else { status });
        if let Ok(header) = Header::from_bytes("ETag", etag.as_str()) {
            response.add_header(header);
        }
        if gzip && let Ok(header) = Header::from_bytes("Content-Encoding", "gzip") {
            response.add_header(header);
        }
        if let Ok(header) = Header::from_bytes("Vary", "Accept-Encoding") {
            response.add_header(header);
        }
        for (name, value) in [
            ("Content-Type", mime),
            ("Cache-Control", "no-store"),
            ("X-Content-Type-Options", "nosniff"),
            (
                "Content-Security-Policy",
                "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; script-src 'self'; frame-ancestors 'none'",
            ),
        ] {
            if let Ok(header) = Header::from_bytes(name, value) {
                response.add_header(header);
            }
        }
        let _ = req.respond(response);
    }
    Ok(())
}
