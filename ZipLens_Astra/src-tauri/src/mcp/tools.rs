use crate::cli::{run_mcp_operation, ListPage};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::Path;
use ziplens_astra_core::Context;

const PAGE_SIZE: usize = 100;
const MAX_PAGE_SIZE: usize = 500;
const DEFAULT_TIMEOUT: u64 = 300;

#[derive(Clone, Copy)]
pub(super) enum Tool {
    Capabilities,
    List,
    Extract,
    Compress,
}

impl Tool {
    pub(super) const ALL: [Self; 4] = [
        Self::Capabilities,
        Self::List,
        Self::Extract,
        Self::Compress,
    ];

    pub(super) fn name(self) -> &'static str {
        match self {
            Self::Capabilities => "ziplens_capabilities",
            Self::List => "ziplens_list",
            Self::Extract => "ziplens_extract",
            Self::Compress => "ziplens_compress",
        }
    }

    pub(super) fn definition(self) -> Value {
        let path = json!({"type": "string", "minLength": 1, "description": "Absolute local path."});
        let timeout =
            json!({"type": "integer", "minimum": 1, "maximum": 604800, "default": DEFAULT_TIMEOUT});
        let overwrite = json!({
            "type": "boolean", "default": false,
            "description": "Replace conflicting regular files only when the user requests it."
        });
        let (description, properties, required, read_only) = match self {
            Self::Capabilities => (
                "Report supported archive formats and available ZipLens backends.",
                json!({}),
                json!([]),
                true,
            ),
            Self::List => (
                "List metadata and entry names in a local archive. Use next_offset to request the next page.",
                json!({
                    "archive": path, "timeout_seconds": timeout,
                    "offset": {"type": "integer", "minimum": 0, "default": 0},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_PAGE_SIZE, "default": PAGE_SIZE}
                }),
                json!(["archive"]),
                true,
            ),
            Self::Extract => (
                "Extract an archive into an explicit destination folder. Omit targets for all entries, or use exact names from ziplens_list. Selecting a directory does not automatically select descendants.",
                json!({
                    "archive": path, "destination": path,
                    "targets": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}},
                    "overwrite": overwrite, "timeout_seconds": timeout
                }),
                json!(["archive", "destination"]),
                false,
            ),
            Self::Compress => (
                "Create a ZIP, 7z, or TAR archive. The destination filename must match the selected format.",
                json!({
                    "sources": {"type": "array", "minItems": 1, "items": path},
                    "destination": path, "format": {"enum": ["zip", "7z", "tar", "tar.gz", "tar.zst"]},
                    "level": {"type": "integer", "minimum": 0, "maximum": 9, "default": 6},
                    "overwrite": overwrite, "timeout_seconds": timeout
                }),
                json!(["sources", "destination", "format"]),
                false,
            ),
        };
        json!({
            "name": self.name(),
            "description": description,
            "inputSchema": {
                "type": "object", "properties": properties, "required": required,
                "additionalProperties": false
            },
            "annotations": {"readOnlyHint": read_only, "destructiveHint": !read_only, "openWorldHint": false}
        })
    }

    pub(super) fn call(self, arguments: Value, ctx: &Context) -> Value {
        match self.command(arguments) {
            Ok((args, page)) => run_mcp_operation(&args, ctx, page),
            Err(message) => error("INVALID_ARGUMENTS", message),
        }
    }

    fn command(self, arguments: Value) -> Result<(Vec<String>, Option<ListPage>), String> {
        match self {
            Self::Capabilities => {
                if arguments.as_object().is_none_or(|args| !args.is_empty()) {
                    return Err("ziplens_capabilities takes no arguments.".into());
                }
                Ok((vec!["capabilities".into()], None))
            }
            Self::List => {
                let args: List = decode(arguments)?;
                if !(1..=MAX_PAGE_SIZE).contains(&args.limit) {
                    return Err(format!("limit must be between 1 and {MAX_PAGE_SIZE}."));
                }
                let page = ListPage {
                    offset: args.offset,
                    limit: args.limit,
                };
                Ok((
                    vec![
                        "list".into(),
                        format!("--timeout-seconds={}", args.timeout_seconds),
                        "--".into(),
                        absolute(args.archive)?,
                    ],
                    Some(page),
                ))
            }
            Self::Extract => {
                let args: Extract = decode(arguments)?;
                let mut command = write_options(
                    "extract",
                    args.destination,
                    args.timeout_seconds,
                    args.overwrite,
                )?;
                if let Some(targets) = args.targets {
                    if targets.is_empty()
                        || targets
                            .iter()
                            .any(|name| name.is_empty() || name.contains('\0'))
                    {
                        return Err(
                            "targets must contain at least one valid entry name, or be omitted."
                                .into(),
                        );
                    }
                    command.extend(targets.into_iter().map(|name| format!("--target={name}")));
                }
                command.extend(["--".into(), absolute(args.archive)?]);
                Ok((command, None))
            }
            Self::Compress => {
                let args: Compress = decode(arguments)?;
                let mut command = write_options(
                    "compress",
                    args.destination,
                    args.timeout_seconds,
                    args.overwrite,
                )?;
                command.extend([
                    format!("--format={}", args.format),
                    format!("--level={}", args.level),
                    "--".into(),
                ]);
                command.extend(
                    args.sources
                        .into_iter()
                        .map(absolute)
                        .collect::<Result<Vec<_>, _>>()?,
                );
                Ok((command, None))
            }
        }
    }
}

pub(super) fn error(code: &str, message: impl Into<String>) -> Value {
    json!({"schema_version": 1, "ok": false, "error": {"code": code, "message": message.into()}})
}

fn decode<T: serde::de::DeserializeOwned>(args: Value) -> Result<T, String> {
    // Do not echo input values in validation errors; clients may put secrets in them.
    serde_json::from_value(args).map_err(|_| "Arguments do not match the tool schema.".into())
}

fn absolute(path: String) -> Result<String, String> {
    if path.contains('\0') || !Path::new(&path).is_absolute() {
        return Err("Use absolute local filesystem paths.".into());
    }
    Ok(path)
}

fn write_options(
    command: &str,
    destination: String,
    timeout: u64,
    overwrite: bool,
) -> Result<Vec<String>, String> {
    let mut args = vec![
        command.into(),
        format!("--destination={}", absolute(destination)?),
        format!("--timeout-seconds={timeout}"),
    ];
    if overwrite {
        args.push("--overwrite".into());
    }
    Ok(args)
}

fn page_size() -> usize {
    PAGE_SIZE
}
fn timeout() -> u64 {
    DEFAULT_TIMEOUT
}
fn level() -> u32 {
    6
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct List {
    archive: String,
    #[serde(default)]
    offset: usize,
    #[serde(default = "page_size")]
    limit: usize,
    #[serde(default = "timeout")]
    timeout_seconds: u64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Extract {
    archive: String,
    destination: String,
    #[serde(default, deserialize_with = "explicit_targets")]
    targets: Option<Vec<String>>,
    #[serde(default)]
    overwrite: bool,
    #[serde(default = "timeout")]
    timeout_seconds: u64,
}

fn explicit_targets<'de, D: serde::Deserializer<'de>>(
    input: D,
) -> Result<Option<Vec<String>>, D::Error> {
    Vec::deserialize(input).map(Some)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Compress {
    sources: Vec<String>,
    destination: String,
    format: String,
    #[serde(default = "level")]
    level: u32,
    #[serde(default)]
    overwrite: bool,
    #[serde(default = "timeout")]
    timeout_seconds: u64,
}
