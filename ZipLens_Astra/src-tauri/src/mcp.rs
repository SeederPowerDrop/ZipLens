//! Local MCP tools over newline-delimited JSON-RPC on standard input/output.
mod tools;

use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{self, BufRead, Read, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
};
use tools::Tool;
use ziplens_astra_core::Context;

pub(crate) const HELP: &str = "ZipLens MCP server\nUsage: ziplens mcp\nConfigure a local MCP client to launch this command over stdio.\n";
const MODERN_VERSION: &str = "2026-07-28";
const LEGACY_VERSIONS: &[&str] = &["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const VERSION_KEY: &str = "io.modelcontextprotocol/protocolVersion";
const CAPABILITIES_KEY: &str = "io.modelcontextprotocol/clientCapabilities";
const SERVER_INFO_KEY: &str = "io.modelcontextprotocol/serverInfo";
const INSTRUCTIONS: &str = "Use absolute local paths. Inspect an archive before selecting entries. Write tools require a destination and keep existing files unless overwrite is explicitly requested.";
const MAX_MESSAGE_BYTES: u64 = 1024 * 1024;
const MAX_ACTIVE_OPERATIONS: usize = 4;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Connection {
    Unselected,
    Initializing,
    Legacy,
    Modern,
}

pub(crate) fn run() -> i32 {
    let pending = Mutex::new(HashMap::new());
    let result = thread::scope(|scope| {
        let result = serve(io::stdin().lock(), scope, &pending);
        for cancelled in pending.lock().unwrap().values() {
            cancelled.store(true, Ordering::Relaxed);
        }
        result
    });
    match result {
        Ok(()) => 0,
        Err(error) if error.kind() == io::ErrorKind::BrokenPipe => 0,
        Err(error) => {
            eprintln!("ZipLens MCP: {error}");
            1
        }
    }
}

type Pending = Mutex<HashMap<String, Arc<AtomicBool>>>;

fn serve<'scope>(
    mut input: impl BufRead,
    scope: &'scope thread::Scope<'scope, '_>,
    pending: &'scope Pending,
) -> io::Result<()> {
    let mut connection = Connection::Unselected;
    let mut line = Vec::new();
    loop {
        line.clear();
        if (&mut input)
            .take(MAX_MESSAGE_BYTES + 1)
            .read_until(b'\n', &mut line)?
            == 0
        {
            return Ok(());
        }
        if line.len() as u64 > MAX_MESSAGE_BYTES {
            return write(&rpc_error(
                &Value::Null,
                -32700,
                "MCP message exceeds 1 MiB.",
            ));
        }
        let Ok(message) = serde_json::from_slice::<Value>(&line) else {
            write(&rpc_error(&Value::Null, -32700, "Invalid JSON."))?;
            continue;
        };
        let Some(method) = message
            .get("method")
            .and_then(Value::as_str)
            .filter(|_| message["jsonrpc"] == "2.0")
        else {
            write(&rpc_error(&Value::Null, -32600, "Invalid request."))?;
            continue;
        };
        let params = &message["params"];
        let Some(id) = message.get("id") else {
            match method {
                "notifications/initialized" if connection == Connection::Initializing => {
                    connection = Connection::Legacy;
                }
                "notifications/cancelled" => {
                    if let Some(request_id) = params.get("requestId").filter(|id| valid_id(id)) {
                        if let Some(cancelled) =
                            pending.lock().unwrap().get(&request_id.to_string())
                        {
                            cancelled.store(true, Ordering::Relaxed);
                        }
                    }
                }
                _ => {}
            }
            continue;
        };
        if !valid_id(id) {
            write(&rpc_error(
                &Value::Null,
                -32600,
                "Request ID must be a string or integer.",
            ))?;
            continue;
        }
        if message.get("params").is_some() && !params.is_object() {
            write(&rpc_error(id, -32602, "params must be an object."))?;
            continue;
        }
        let meta = &params["_meta"];
        let modern = connection == Connection::Modern
            || (connection == Connection::Unselected
                && (method == "server/discover" || meta.get(VERSION_KEY).is_some()));
        if modern {
            let Some(version) = meta[VERSION_KEY].as_str() else {
                write(&rpc_error(
                    id,
                    -32602,
                    "MCP protocol version metadata is required.",
                ))?;
                continue;
            };
            if version != MODERN_VERSION {
                let mut response = rpc_error(id, -32022, "Unsupported protocol version");
                response["error"]["data"] =
                    json!({"supported": [MODERN_VERSION], "requested": version});
                write(&response)?;
                continue;
            }
            if !meta[CAPABILITIES_KEY].is_object() {
                write(&rpc_error(
                    id,
                    -32602,
                    "MCP client capabilities metadata is required.",
                ))?;
                continue;
            }
            connection = Connection::Modern;
        }

        let result = match method {
            "initialize" if connection == Connection::Unselected => {
                let Some(requested) = params["protocolVersion"].as_str().filter(|_| {
                    params["capabilities"].is_object()
                        && params["clientInfo"]["name"].is_string()
                        && params["clientInfo"]["version"].is_string()
                }) else {
                    write(&rpc_error(id, -32602, "Invalid initialization parameters."))?;
                    continue;
                };
                let version = LEGACY_VERSIONS
                    .iter()
                    .copied()
                    .find(|version| *version == requested)
                    .unwrap_or(LEGACY_VERSIONS[0]);
                connection = Connection::Initializing;
                json!({
                    "protocolVersion": version, "capabilities": {"tools": {}},
                    "serverInfo": server_info(), "instructions": INSTRUCTIONS
                })
            }
            "server/discover" if modern => json!({
                "supportedVersions": [MODERN_VERSION], "capabilities": {"tools": {}},
                "instructions": INSTRUCTIONS, "ttlMs": 3600000, "cacheScope": "public"
            }),
            "ping" => json!({}),
            "tools/list" if modern || connection == Connection::Legacy => {
                let definitions: Vec<_> = Tool::ALL.into_iter().map(Tool::definition).collect();
                if modern {
                    json!({"tools": definitions, "ttlMs": 3600000, "cacheScope": "public"})
                } else {
                    json!({"tools": definitions})
                }
            }
            "tools/call" if modern || connection == Connection::Legacy => {
                let Some(tool) = Tool::ALL
                    .into_iter()
                    .find(|tool| params["name"] == tool.name())
                else {
                    write(&rpc_error(id, -32602, "Unknown ZipLens tool."))?;
                    continue;
                };
                let arguments = params
                    .get("arguments")
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                let key = id.to_string();
                let mut active = pending.lock().unwrap();
                if active.contains_key(&key) {
                    write(&rpc_error(id, -32600, "Request ID is already in use."))?;
                    continue;
                }
                if active.len() >= MAX_ACTIVE_OPERATIONS {
                    let busy = tools::error(
                        "BUSY",
                        "Four ZipLens operations are active. Retry after one finishes.",
                    );
                    write(&tool_reply(id, busy, modern))?;
                    continue;
                }

                let cancelled = Arc::new(AtomicBool::new(false));
                active.insert(key.clone(), cancelled.clone());
                let id = id.clone();
                scope.spawn(move || {
                    let ctx = Context::new(cancelled.clone(), |_| {});
                    let result = tool.call(arguments, &ctx);
                    let mut active = pending.lock().unwrap();
                    if !cancelled.load(Ordering::Relaxed) {
                        let _ = write(&tool_reply(&id, result, modern));
                    }
                    active.remove(&key);
                });
                continue;
            }
            "tools/list" | "tools/call" => {
                write(&rpc_error(
                    id,
                    -32600,
                    "Initialize the MCP connection first.",
                ))?;
                continue;
            }
            _ => {
                write(&rpc_error(id, -32601, "Method not found."))?;
                continue;
            }
        };
        write(&reply(id, result, modern))?;
    }
}

fn valid_id(id: &Value) -> bool {
    id.is_string() || id.is_i64() || id.is_u64()
}

fn server_info() -> Value {
    json!({"name": "ziplens", "title": "ZipLens", "version": env!("CARGO_PKG_VERSION")})
}

fn reply(id: &Value, mut result: Value, modern: bool) -> Value {
    if modern {
        result["resultType"] = json!("complete");
        result["_meta"] = json!({SERVER_INFO_KEY: server_info()});
    }
    json!({"jsonrpc": "2.0", "id": id, "result": result})
}

fn tool_reply(id: &Value, result: Value, modern: bool) -> Value {
    reply(
        id,
        json!({
            "content": [{"type": "text", "text": result.to_string()}],
            "isError": result["ok"] != true,
            "structuredContent": result
        }),
        modern,
    )
}

fn rpc_error(id: &Value, code: i32, message: &str) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})
}

fn write(message: &Value) -> io::Result<()> {
    let mut output = io::stdout().lock();
    serde_json::to_writer(&mut output, message)?;
    writeln!(output)?;
    output.flush()
}
