//! Headless interface for automation. Dispatch happens before Tauri is initialized.
use serde_json::{json, Value};
use std::{
    ffi::OsString,
    fs,
    io::{self, IsTerminal, Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    thread,
    time::Duration,
};
use ziplens_astra_core::{paths, CompressionRequest, Context, Engine, ExtractRequest};

const SCHEMA_VERSION: u32 = 1;
const FORMATS: &[&str] = &["zip", "7z", "tar", "tar.gz", "tar.zst"];
const HELP: &str = "ZipLens headless CLI\n\
Usage:\n\
  ziplens cli capabilities\n\
  ziplens cli list ARCHIVE [--password-stdin] [--timeout-seconds N]\n\
  ziplens cli extract ARCHIVE --destination DIR [--target ENTRY ...] [--overwrite]\n\
                      [--password-stdin] [--timeout-seconds N]\n\
  ziplens cli compress SOURCE... --destination FILE --format FORMAT [--level 0..9]\n\
                       [--overwrite] [--password-stdin] [--timeout-seconds N]\n\
  ziplens cli --help | --version\n\n\
Operations return one JSON object on stdout (schema_version: 1). No GUI or prompts.\n\
Extraction and compression keep existing files by choosing numbered names by default.\n\
--overwrite replaces conflicting regular files; extraction preserves unrelated files.\n\
--target matches exact entry names from list, including a directory's trailing slash.\n\
Selecting a directory alone does not select its descendants; repeat --target for them.\n\
Use -- to end options, or --target=NAME / --destination=PATH for values starting with -.\n\
Formats: zip, 7z, tar, tar.gz, tar.zst. Compression level defaults to 6.\n\
The destination suffix must match its format; capabilities lists accepted suffixes.\n\
Passwords: pipe one UTF-8 line to --password-stdin. Never pass passwords as arguments.\n\
Encrypted 7-Zip operations still pass the password to the bundled helper's process arguments.\n\
--timeout-seconds N cooperatively cancels an operation after N seconds (positive integer).\n\
The operation timeout starts after stdin closes; password input must be closed by the caller.\n\
Exit codes: 0 success, 1 operation error, 2 usage, 3 password, 4 partial extraction,\n\
            124 timeout, 130 cancellation. Abrupt process termination may leave staging files.\n";

#[derive(Debug, PartialEq)]
enum Command {
    Help,
    Version,
    Capabilities,
    List,
    Extract,
    Compress,
}

#[derive(Debug)]
struct Options {
    command: Command,
    inputs: Vec<PathBuf>,
    destination: Option<PathBuf>,
    targets: Vec<String>,
    overwrite: bool,
    password_stdin: bool,
    format: Option<String>,
    level: u32,
    timeout: Option<u64>,
}

#[derive(Debug)]
struct CliError {
    code: &'static str,
    message: String,
    exit: i32,
    result: Option<Value>,
}

impl CliError {
    fn new(code: &'static str, message: impl Into<String>, exit: i32) -> Self {
        Self {
            code,
            message: message.into(),
            exit,
            result: None,
        }
    }

    fn usage(message: impl Into<String>) -> Self {
        Self::new("INVALID_ARGUMENTS", message, 2)
    }

    fn io(error: impl std::fmt::Display) -> Self {
        Self::new("IO_ERROR", error.to_string(), 1)
    }

    fn engine(message: String) -> Self {
        if message == "PASSWORD_REQUIRED" {
            Self::new(
                "PASSWORD_REQUIRED",
                "The archive needs a password, or the supplied password is incorrect.",
                3,
            )
        } else if message == "CANCELLED" {
            Self::new("CANCELLED", "Operation cancelled.", 130)
        } else {
            Self::new("ARCHIVE_ERROR", message, 1)
        }
    }

    fn response(&self) -> Value {
        let mut response = json!({
            "schema_version": SCHEMA_VERSION,
            "ok": false,
            "error": {"code": self.code, "message": self.message},
        });
        if let Some(result) = &self.result {
            response["result"] = result.clone();
        }
        response
    }
}

fn parse(args: &[String]) -> Result<Options, CliError> {
    let command = match args.first().map(String::as_str) {
        Some("--help" | "-h") => Command::Help,
        Some("--version" | "-V") => Command::Version,
        Some("capabilities") => Command::Capabilities,
        Some("list") => Command::List,
        Some("extract") => Command::Extract,
        Some("compress") => Command::Compress,
        _ => {
            return Err(CliError::usage(
                "Unknown CLI command. Run 'ziplens cli --help'.",
            ))
        }
    };
    let mut options = Options {
        command,
        inputs: vec![],
        destination: None,
        targets: vec![],
        overwrite: false,
        password_stdin: false,
        format: None,
        level: 6,
        timeout: None,
    };
    if args.len() == 2 && matches!(args[1].as_str(), "--help" | "-h") {
        options.command = Command::Help;
        return Ok(options);
    }
    if matches!(
        options.command,
        Command::Help | Command::Version | Command::Capabilities
    ) {
        if args.len() > 1 {
            return Err(CliError::usage("This command does not accept arguments."));
        }
        return Ok(options);
    }
    let mut positional_only = false;
    let mut level_seen = false;
    let mut index = 1;
    while index < args.len() {
        let arg = &args[index];
        if !positional_only && arg == "--" {
            positional_only = true;
            index += 1;
            continue;
        }
        if positional_only || !arg.starts_with('-') {
            if arg.is_empty() {
                return Err(CliError::usage("Input paths cannot be empty."));
            }
            options.inputs.push(arg.into());
            index += 1;
            continue;
        }
        let (flag, inline) = arg
            .split_once('=')
            .map_or((arg.as_str(), None), |(k, v)| (k, Some(v)));
        match flag {
            "--overwrite" | "--password-stdin" => {
                if inline.is_some() {
                    return Err(CliError::usage("Boolean options do not accept values."));
                }
                let value = if flag == "--overwrite" {
                    &mut options.overwrite
                } else {
                    &mut options.password_stdin
                };
                if *value {
                    return Err(CliError::usage("An option was specified more than once."));
                }
                *value = true;
            }
            "--destination" | "--target" | "--format" | "--level" | "--timeout-seconds" => {
                let value = if let Some(value) = inline {
                    value
                } else {
                    index += 1;
                    args.get(index).filter(|s| !s.starts_with('-')).map(String::as_str)
                        .ok_or_else(|| CliError::usage(format!("{flag} requires a value (use {flag}=VALUE for a value starting with -).")))?
                };
                if value.is_empty() {
                    return Err(CliError::usage(format!("{flag} cannot be empty.")));
                }
                match flag {
                    "--destination" => {
                        if options.destination.replace(value.into()).is_some() {
                            return Err(CliError::usage(
                                "--destination may be specified only once.",
                            ));
                        }
                    }
                    "--target" => options.targets.push(value.into()),
                    "--format" => {
                        if options.format.replace(value.into()).is_some() {
                            return Err(CliError::usage("--format may be specified only once."));
                        }
                    }
                    "--level" => {
                        if level_seen {
                            return Err(CliError::usage("--level may be specified only once."));
                        }
                        options.level =
                            value.parse().ok().filter(|n| *n <= 9).ok_or_else(|| {
                                CliError::usage("--level must be an integer from 0 to 9.")
                            })?;
                        level_seen = true;
                    }
                    _ => {
                        let seconds = value
                            .parse::<u64>()
                            .ok()
                            .filter(|n| *n > 0 && *n <= 604_800)
                            .ok_or_else(|| {
                                CliError::usage(
                                    "--timeout-seconds must be an integer from 1 to 604800.",
                                )
                            })?;
                        if options.timeout.replace(seconds).is_some() {
                            return Err(CliError::usage(
                                "--timeout-seconds may be specified only once.",
                            ));
                        }
                    }
                }
            }
            // Do not echo unknown tokens: callers sometimes accidentally put secrets in argv.
            _ => return Err(CliError::usage("Unknown option. Run 'ziplens cli --help'.")),
        }
        index += 1;
    }
    match options.command {
        Command::List | Command::Extract if options.inputs.len() != 1 => {
            return Err(CliError::usage(
                "list and extract require exactly one archive path.",
            ));
        }
        Command::Compress if options.inputs.is_empty() => {
            return Err(CliError::usage(
                "compress requires at least one source path.",
            ));
        }
        _ => (),
    }
    if matches!(options.command, Command::Extract | Command::Compress)
        && options.destination.is_none()
    {
        return Err(CliError::usage("An explicit --destination is required."));
    }
    if options.command == Command::List && (options.destination.is_some() || options.overwrite) {
        return Err(CliError::usage(
            "list does not accept --destination or --overwrite.",
        ));
    }
    if options.command != Command::Extract && !options.targets.is_empty() {
        return Err(CliError::usage("--target is supported only by extract."));
    }
    if options.command != Command::Compress && (options.format.is_some() || level_seen) {
        return Err(CliError::usage(
            "--format and --level are supported only by compress.",
        ));
    }
    if options.command == Command::Compress {
        let format = options
            .format
            .as_deref()
            .ok_or_else(|| CliError::usage("compress requires --format."))?;
        if !FORMATS.contains(&format) {
            return Err(CliError::usage(
                "Unsupported --format. Use zip, 7z, tar, tar.gz, or tar.zst.",
            ));
        }
        if format.starts_with("tar") && options.password_stdin {
            return Err(CliError::usage(
                "TAR formats do not support password encryption.",
            ));
        }
    }
    Ok(options)
}

fn read_password(mut input: impl Read) -> Result<String, CliError> {
    let mut bytes = vec![];
    input
        .by_ref()
        .take(16_385)
        .read_to_end(&mut bytes)
        .map_err(CliError::io)?;
    if bytes.len() > 16_384 {
        return Err(CliError::usage("Password input exceeds the 16 KiB limit."));
    }
    let mut password =
        String::from_utf8(bytes).map_err(|_| CliError::usage("Password input must be UTF-8."))?;
    if password.ends_with('\n') {
        password.pop();
        if password.ends_with('\r') {
            password.pop();
        }
    }
    if password.is_empty() || password.contains(['\n', '\r', '\0']) {
        return Err(CliError::usage(
            "Supply one nonempty password line on stdin.",
        ));
    }
    Ok(password)
}

fn absolute(path: &Path) -> Result<PathBuf, CliError> {
    if path.is_absolute() {
        Ok(path.into())
    } else {
        Ok(std::env::current_dir().map_err(CliError::io)?.join(path))
    }
}

fn existing_input(path: &Path, archive: bool) -> Result<PathBuf, CliError> {
    let path = fs::canonicalize(path).map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            CliError::new(
                "MISSING_INPUT",
                format!("Input does not exist: {}", path.display()),
                1,
            )
        } else {
            CliError::io(error)
        }
    })?;
    if archive && !path.is_file() {
        return Err(CliError::new(
            "MISSING_INPUT",
            "Archive input must be a regular file.",
            1,
        ));
    }
    Ok(path)
}

/// Resolve existing ancestors before any mkdir, preserving symlink/.. semantics.
fn prospective_directory(path: &Path) -> Result<PathBuf, CliError> {
    let mut resolved = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                resolved.pop();
            }
            Component::CurDir => (),
            Component::RootDir | Component::Prefix(_) => resolved.push(component.as_os_str()),
            Component::Normal(name) => {
                resolved.push(name);
                match fs::symlink_metadata(&resolved) {
                    Ok(_) => resolved = fs::canonicalize(&resolved).map_err(CliError::io)?,
                    Err(error) if error.kind() == io::ErrorKind::NotFound => (),
                    Err(error) => return Err(CliError::io(error)),
                }
            }
        }
    }
    Ok(resolved)
}

fn protect_compression_sources(sources: &[PathBuf], destination: &Path) -> Result<(), CliError> {
    for source in sources {
        if source == destination
            || paths::same_file(source, destination).map_err(CliError::io)?
            || (source.is_dir() && destination.starts_with(source))
        {
            return Err(CliError::new("ARCHIVE_ERROR", "Save the archive outside the selected source folder (and never over a source file).", 1));
        }
    }
    Ok(())
}

fn compression_suffixes(format: &str) -> &'static [&'static str] {
    match format {
        "zip" => &[".zip", ".zipx", ".cbz"],
        "7z" => &[".7z", ".cb7"],
        "tar" => &[".tar", ".cbt"],
        "tar.gz" => &[".tar.gz", ".tar.gzip", ".tgz"],
        "tar.zst" => &[".tar.zst", ".tar.zstd", ".tzst"],
        _ => &[],
    }
}

fn validate_compression_suffix(destination: &Path, format: &str) -> Result<(), CliError> {
    let filename = destination
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase();
    if compression_suffixes(format)
        .iter()
        .any(|suffix| filename.ends_with(suffix))
    {
        Ok(())
    } else {
        Err(CliError::usage(format!(
            "Destination suffix does not match --format {format}; use {}.",
            compression_suffixes(format).join(", ")
        )))
    }
}

fn numbered_compression_path(path: &Path, n: usize) -> PathBuf {
    if n == 0 {
        return path.into();
    }
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    let lower = name.to_ascii_lowercase();
    for suffix in [".tar.gz", ".tar.gzip", ".tar.zst", ".tar.zstd"] {
        if lower.ends_with(suffix) {
            let split = name.len() - suffix.len();
            return path.with_file_name(format!("{} ({n}){}", &name[..split], &name[split..]));
        }
    }
    paths::numbered(path, n)
}

fn capabilities(engine: &Engine) -> Result<Value, CliError> {
    Ok(json!({
        "name": "ZipLens", "version": env!("CARGO_PKG_VERSION"),
        "commands": ["capabilities", "list", "extract", "compress"],
        "headless": true, "interactive_prompts": false,
        "compression_formats": FORMATS,
        "compression_destination_suffixes": {
            "zip": compression_suffixes("zip"), "7z": compression_suffixes("7z"),
            "tar": compression_suffixes("tar"), "tar.gz": compression_suffixes("tar.gz"),
            "tar.zst": compression_suffixes("tar.zst")
        },
        "recognized_archive_extensions": crate::file_associations::supported_extensions().map_err(CliError::engine)?,
        "backends": {
            "native": ["zip", "zipx", "cbz", "tar", "cbt", "tar.gz", "tgz", "tar.zst", "tzst"],
            "seven_zip_available": engine.sidecar.is_file(),
            "legacy_alz_egg_available": engine.sidecar.with_file_name(if cfg!(windows) { "ziplens-legacy.exe" } else { "ziplens-legacy" }).is_file(),
            "note": "Other recognized formats and some ZIP compression methods require the bundled 7-Zip helper. ALZ/EGG require the legacy helper. Support depends on archive features."
        },
        "defaults": {"conflict_policy": "keep_both", "compression_level": 6, "timeout_seconds": null},
        "selection": {"option": "--target", "repeatable": true, "matching": "exact_entry_name", "directory_descendants_automatic": false},
        "password": {"input": "stdin", "option": "--password-stdin", "max_bytes": 16384,
            "helper_process_arguments_may_contain_password": true},
        "compression": {"password_formats": ["zip", "7z"], "zip_encryption": "AES256", "split_volumes": false},
        "limits": {"max_entries": ziplens_astra_core::context::MAX_ENTRIES,
            "max_extracted_bytes": ziplens_astra_core::context::MAX_EXTRACTED_BYTES,
            "timeout_seconds_range": [1, 604800], "timeout_includes_password_input": false},
        "exit_codes": {"success": 0, "operation_error": 1, "invalid_arguments": 2,
            "password_required_or_incorrect": 3, "partial_failure": 4, "timeout": 124, "cancelled": 130},
        "archive_entry_text_is_untrusted": true
    }))
}

/// The core compression API overwrites a regular output. Stage its output privately, then
/// publish with the same atomic keep-both policy used by extraction on macOS.
fn compress(
    engine: &Engine,
    options: &Options,
    password: Option<String>,
    ctx: &Context,
) -> Result<Value, CliError> {
    let requested = absolute(options.destination.as_ref().unwrap())?;
    let filename = requested
        .file_name()
        .ok_or_else(|| CliError::usage("Destination must include an archive filename."))?;
    let sources = options
        .inputs
        .iter()
        .map(|p| existing_input(p, false))
        .collect::<Result<Vec<_>, _>>()?;
    let parent = requested
        .parent()
        .ok_or_else(|| CliError::usage("Destination has no parent directory."))?;
    let parent = prospective_directory(parent)?;
    protect_compression_sources(&sources, &parent.join(filename))?;
    let format = options.format.as_ref().unwrap();
    validate_compression_suffix(&requested, format)?;
    paths::ensure_directory(&parent).map_err(CliError::engine)?;
    let parent = fs::canonicalize(&parent).map_err(CliError::io)?;
    let destination = parent.join(filename);
    protect_compression_sources(&sources, &destination)?;
    if options.overwrite {
        check_regular_output(&destination)?;
    }
    let stage = tempfile::Builder::new()
        .prefix(".ziplens-cli-compress-")
        .tempdir_in(&parent)
        .map_err(CliError::io)?;
    let staged = stage.path().join(filename);
    engine
        .compress(
            &CompressionRequest {
                sources: sources.clone(),
                destination: staged.clone(),
                format: format.clone(),
                split_size: None,
                password,
                encryption: None,
                level: options.level,
            },
            ctx,
        )
        .map_err(CliError::engine)?;
    ctx.check().map_err(CliError::engine)?;
    let output = if options.overwrite {
        check_regular_output(&destination)?;
        // Re-check identities just before publication in case inputs/outputs changed meanwhile.
        if sources
            .iter()
            .map(|source| paths::same_file(source, &destination))
            .collect::<Result<Vec<_>, _>>()
            .map_err(CliError::io)?
            .into_iter()
            .any(|same| same)
        {
            return Err(CliError::new(
                "ARCHIVE_ERROR",
                "Cannot replace a source file with the archive.",
                1,
            ));
        }
        fs::rename(&staged, &destination).map_err(CliError::io)?;
        destination.clone()
    } else {
        let mut published = None;
        for n in 0..10_000 {
            ctx.check().map_err(CliError::engine)?;
            let target = numbered_compression_path(&destination, n);
            match paths::rename_no_replace(&staged, &target) {
                Ok(()) => {
                    published = Some(target);
                    break;
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => (),
                Err(error) => return Err(CliError::io(error)),
            }
        }
        published
            .ok_or_else(|| CliError::new("IO_ERROR", "Too many conflicting output names.", 1))?
    };
    Ok(json!({"destination": destination, "format": format, "output_paths": [output]}))
}

fn check_regular_output(path: &Path) -> Result<(), CliError> {
    match fs::symlink_metadata(path) {
        Ok(meta) if !meta.is_file() || meta.is_symlink() => Err(CliError::new(
            "IO_ERROR",
            "Overwrite output must be a regular file, never a directory or symbolic link.",
            1,
        )),
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(CliError::io(error)),
        _ => Ok(()),
    }
}

fn execute(
    engine: &Engine,
    options: &Options,
    password: Option<String>,
    ctx: &Context,
) -> Result<Value, CliError> {
    match options.command {
        Command::Capabilities => capabilities(engine),
        Command::List => {
            let archive = existing_input(&options.inputs[0], true)?;
            let entries = engine
                .preview(&archive, password.as_deref(), ctx)
                .map_err(CliError::engine)?;
            Ok(json!({"archive": archive, "entries": entries}))
        }
        Command::Extract => {
            let archive = existing_input(&options.inputs[0], true)?;
            let destination = absolute(options.destination.as_ref().unwrap())?;
            let report = engine
                .extract(
                    &ExtractRequest {
                        archive: archive.clone(),
                        destination: destination.clone(),
                        targets: if options.targets.is_empty() {
                            None
                        } else {
                            Some(options.targets.clone())
                        },
                        password,
                        keep_both: !options.overwrite,
                    },
                    ctx,
                )
                .map_err(CliError::engine)?;
            let mut result = serde_json::to_value(&report).map_err(CliError::io)?;
            result["archive"] = json!(archive);
            result["destination"] = json!(fs::canonicalize(&destination).unwrap_or(destination));
            if report.cancelled || !report.failed_files.is_empty() {
                let mut error = if report.cancelled {
                    CliError::new(
                        "CANCELLED",
                        "Operation cancelled; consult result for any files already published.",
                        130,
                    )
                } else {
                    CliError::new("PARTIAL_FAILURE", "Some files could not be published; consult result for successes and failures.", 4)
                };
                error.result = Some(result);
                Err(error)
            } else {
                Ok(result)
            }
        }
        Command::Compress => compress(engine, options, password, ctx),
        _ => unreachable!("Help and version are handled before execution"),
    }
}

struct Deadline {
    stop: mpsc::Sender<()>,
    worker: Option<thread::JoinHandle<()>>,
}

impl Deadline {
    fn start(seconds: u64, ctx: &Context, expired: Arc<AtomicBool>) -> Self {
        let (stop, receiver) = mpsc::channel();
        let cancelled = ctx.cancelled.clone();
        let worker = thread::spawn(move || {
            if matches!(
                receiver.recv_timeout(Duration::from_secs(seconds)),
                Err(mpsc::RecvTimeoutError::Timeout)
            ) {
                expired.store(true, Ordering::Release);
                cancelled.store(true, Ordering::Release);
            }
        });
        Self {
            stop,
            worker: Some(worker),
        }
    }
}

impl Drop for Deadline {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn dispatch(options: &Options) -> Result<Value, CliError> {
    let password = if options.password_stdin {
        if io::stdin().is_terminal() {
            return Err(CliError::usage(
                "--password-stdin requires piped input; interactive prompting is disabled.",
            ));
        }
        Some(read_password(io::stdin().lock())?)
    } else {
        None
    };
    let engine = crate::archive::engine().map_err(CliError::engine)?;
    let ctx = Context::default();
    let expired = Arc::new(AtomicBool::new(false));
    let deadline = options
        .timeout
        .map(|seconds| Deadline::start(seconds, &ctx, expired.clone()));
    let mut result = execute(&engine, options, password.clone(), &ctx);
    drop(deadline);
    if expired.load(Ordering::Acquire) {
        let mut error = CliError::new(
            "TIMEOUT",
            "Operation exceeded its timeout; consult result for any files already published.",
            124,
        );
        error.result = match result {
            Ok(value) => Some(value),
            Err(error) => error.result,
        };
        result = Err(error);
    }
    if let (Err(error), Some(password)) = (&mut result, password.as_deref()) {
        error.message = error.message.replace(password, "[redacted]");
    }
    result
}

/// Return None only for existing GUI/Finder invocations. Invalid CLI flags never open a window.
pub fn run_if_requested() -> Option<i32> {
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    let first = args.first()?.to_str()?;
    let cli_args = if first == "cli" {
        &args[1..]
    } else if matches!(first, "--help" | "-h" | "--version" | "-V") {
        &args[..]
    } else if first.starts_with('-')
        && !matches!(first, "--extract" | "--compress")
        && !first.starts_with("-psn_")
    {
        let error = CliError::usage(
            "Unknown startup option. Use 'ziplens cli --help' for headless commands.",
        );
        return Some(write_response(&error.response(), error.exit));
    } else {
        return None;
    };
    let result = cli_args
        .iter()
        .map(|arg| {
            arg.to_str()
                .map(str::to_owned)
                .ok_or_else(|| CliError::usage("CLI arguments must be valid UTF-8."))
        })
        .collect::<Result<Vec<_>, _>>()
        .and_then(|args| parse(&args));
    let options = match result {
        Ok(options) => options,
        Err(error) => return Some(write_response(&error.response(), error.exit)),
    };
    match options.command {
        Command::Help => return Some(write_text(HELP)),
        Command::Version => {
            return Some(write_text(concat!(
                "ZipLens ",
                env!("CARGO_PKG_VERSION"),
                "\n"
            )))
        }
        _ => (),
    }
    Some(match dispatch(&options) {
        Ok(result) => write_response(
            &json!({"schema_version": SCHEMA_VERSION, "ok": true, "result": result}),
            0,
        ),
        Err(error) => write_response(&error.response(), error.exit),
    })
}

fn write_response(response: &Value, exit: i32) -> i32 {
    let mut output = io::stdout().lock();
    if serde_json::to_writer(&mut output, response).is_err() || writeln!(output).is_err() {
        return 1;
    }
    exit
}

fn write_text(text: &str) -> i32 {
    if io::stdout().lock().write_all(text.as_bytes()).is_ok() {
        0
    } else {
        1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|s| (*s).into()).collect()
    }

    #[test]
    fn extraction_requires_destination_and_defaults_to_keep_both() {
        assert_eq!(parse(&args(&["extract", "input.zip"])).unwrap_err().exit, 2);
        let options = parse(&args(&["extract", "input.zip", "--destination", "output"])).unwrap();
        assert!(!options.overwrite);
        assert!(options.targets.is_empty());
    }

    #[test]
    fn parser_preserves_exact_targets_and_option_like_paths() {
        let options = parse(&args(&[
            "extract",
            "--destination=./-out",
            "--target=-n.txt",
            "--target",
            "nested/",
            "--",
            "-input.zip",
        ]))
        .unwrap();
        assert_eq!(options.targets, ["-n.txt", "nested/"]);
        assert_eq!(options.inputs, [PathBuf::from("-input.zip")]);
    }

    #[test]
    fn parser_rejects_unknown_inapplicable_and_repeated_options() {
        for values in [
            vec!["list", "a.zip", "--password=secret"],
            vec!["list", "a.zip", "--overwrite"],
            vec![
                "extract",
                "a.zip",
                "--destination",
                "out",
                "--format",
                "zip",
            ],
            vec![
                "extract",
                "a.zip",
                "--destination",
                "out",
                "--destination",
                "other",
            ],
            vec![
                "compress",
                "input",
                "--destination",
                "out",
                "--format",
                "zip",
                "--level",
                "10",
            ],
            vec![
                "compress",
                "input",
                "--destination",
                "out",
                "--format",
                "tar",
                "--password-stdin",
            ],
            vec!["list", "a.zip", "--timeout-seconds", "0"],
        ] {
            let error = parse(&args(&values)).unwrap_err();
            assert_eq!(error.code, "INVALID_ARGUMENTS");
            assert!(!error.message.contains("secret"));
        }
    }

    #[test]
    fn password_reader_strips_one_line_ending_without_trimming_spaces() {
        assert_eq!(read_password(" space \r\n".as_bytes()).unwrap(), " space ");
        for input in [b"\n".as_slice(), b"a\nb\n", b"a\0b", &[255]] {
            assert_eq!(read_password(input).unwrap_err().exit, 2);
        }
        assert!(read_password(&vec![b'a'; 16385][..]).is_err());
    }

    #[test]
    fn missing_input_is_structured_without_needing_a_helper() {
        let temp = tempfile::tempdir().unwrap();
        let engine = Engine {
            sidecar: temp.path().join("no-helper"),
        };
        let mut options = parse(&args(&["list", "missing.zip"])).unwrap();
        options.inputs = vec![temp.path().join("missing.zip")];
        let error = execute(&engine, &options, None, &Context::default()).unwrap_err();
        assert_eq!(error.code, "MISSING_INPUT");
        assert_eq!(error.response()["schema_version"], 1);
        assert_eq!(error.response()["ok"], false);
    }

    #[test]
    fn compression_preserves_collisions_and_protects_sources() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source.txt");
        let destination = temp.path().join("result.zip");
        fs::write(&source, "source contents").unwrap();
        fs::write(&destination, "existing contents").unwrap();
        let engine = Engine {
            sidecar: temp.path().join("no-helper"),
        };
        let mut options = parse(&args(&[
            "compress",
            "source",
            "--destination",
            "result.zip",
            "--format",
            "zip",
        ]))
        .unwrap();
        options.inputs = vec![source.clone()];
        options.destination = Some(destination.clone());
        let result = execute(&engine, &options, None, &Context::default()).unwrap();
        assert_eq!(
            fs::read_to_string(&destination).unwrap(),
            "existing contents"
        );
        assert_eq!(
            result["output_paths"][0],
            json!(fs::canonicalize(temp.path())
                .unwrap()
                .join("result (1).zip"))
        );
        options.destination = Some(source.clone());
        options.overwrite = true;
        assert_eq!(
            execute(&engine, &options, None, &Context::default())
                .unwrap_err()
                .code,
            "ARCHIVE_ERROR"
        );
        assert_eq!(fs::read_to_string(&source).unwrap(), "source contents");
    }

    #[test]
    fn compression_rejects_destination_inside_source_before_creating_parents() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        fs::create_dir(&source).unwrap();
        let engine = Engine {
            sidecar: temp.path().join("no-helper"),
        };
        let mut options = parse(&args(&[
            "compress",
            "source",
            "--destination",
            "output.zip",
            "--format",
            "zip",
        ]))
        .unwrap();
        options.inputs = vec![source.clone()];
        options.destination = Some(source.join("new-parent/output.zip"));
        assert_eq!(
            execute(&engine, &options, None, &Context::default())
                .unwrap_err()
                .code,
            "ARCHIVE_ERROR"
        );
        assert!(!source.join("new-parent").exists());
    }

    #[test]
    fn deadline_marks_context_cancelled_without_leaving_a_worker() {
        let ctx = Context::default();
        let expired = Arc::new(AtomicBool::new(false));
        let mut deadline = Deadline::start(0, &ctx, expired.clone());
        deadline.worker.take().unwrap().join().unwrap();
        assert!(expired.load(Ordering::Acquire));
        assert_eq!(ctx.check().unwrap_err(), "CANCELLED");
        drop(deadline);

        let ctx = Context::default();
        let expired = Arc::new(AtomicBool::new(false));
        drop(Deadline::start(60, &ctx, expired.clone()));
        assert!(!expired.load(Ordering::Acquire));
        assert!(ctx.check().is_ok());
    }

    #[test]
    fn compressed_tar_collision_preserves_format_and_roundtrips_without_helpers() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source.txt");
        fs::write(&source, "contents").unwrap();
        let engine = Engine {
            sidecar: temp.path().join("no-helper"),
        };
        for format in ["tar.gz", "tar.zst"] {
            let destination = temp.path().join(format!("archive.{format}"));
            fs::write(&destination, "existing contents").unwrap();
            let mut options = parse(&args(&[
                "compress",
                "source",
                "--destination",
                "ignored",
                "--format",
                format,
            ]))
            .unwrap();
            options.inputs = vec![source.clone()];
            options.destination = Some(destination.clone());
            let result = execute(&engine, &options, None, &Context::default()).unwrap();
            let archive = PathBuf::from(result["output_paths"][0].as_str().unwrap());
            assert_eq!(
                archive.file_name().unwrap(),
                format!("archive (1).{format}").as_str()
            );
            assert_eq!(
                fs::read_to_string(&destination).unwrap(),
                "existing contents"
            );
            let entries = engine.preview(&archive, None, &Context::default()).unwrap();
            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0].path, "source.txt");
            let output = temp.path().join(format!("out-{format}"));
            let report = engine
                .extract(
                    &ExtractRequest {
                        archive,
                        destination: output.clone(),
                        targets: None,
                        password: None,
                        keep_both: true,
                    },
                    &Context::default(),
                )
                .unwrap();
            assert!(report.failed_files.is_empty());
            assert_eq!(
                fs::read_to_string(output.join("source.txt")).unwrap(),
                "contents"
            );
        }
    }

    #[test]
    fn compression_normalizes_parent_before_mkdir_and_rejects_mismatched_suffix() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("file.txt"), "contents").unwrap();
        let engine = Engine {
            sidecar: temp.path().join("no-helper"),
        };
        let mut options = parse(&args(&[
            "compress",
            "source",
            "--destination",
            "ignored.zip",
            "--format",
            "zip",
        ]))
        .unwrap();
        options.inputs = vec![source.clone()];
        options.destination = Some(source.join("new/../../outside.zip"));
        execute(&engine, &options, None, &Context::default()).unwrap();
        assert!(!source.join("new").exists());
        let entries = engine
            .preview(&temp.path().join("outside.zip"), None, &Context::default())
            .unwrap();
        assert!(entries.iter().all(|entry| !entry.path.contains("new")));

        options.destination = Some(temp.path().join("missing-parent/mismatched.tar"));
        assert_eq!(
            execute(&engine, &options, None, &Context::default())
                .unwrap_err()
                .code,
            "INVALID_ARGUMENTS"
        );
        assert!(!temp.path().join("missing-parent").exists());
        for format in FORMATS {
            for suffix in compression_suffixes(format) {
                assert!(validate_compression_suffix(
                    &PathBuf::from(format!("OUT{}", suffix.to_ascii_uppercase())),
                    format
                )
                .is_ok());
            }
        }
    }
}
