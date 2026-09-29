//! Pinned upstream parsers/codecs, guarded before allocation and isolated from the GUI.
use crate::{
    context::MAX_EXTRACTED_BYTES,
    legacy::{Request, Response, MESSAGE_LIMIT},
    paths, Entry,
};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{self, Read, Seek, SeekFrom, Write},
    path::PathBuf,
};

const MAX_ITEMS: usize = 100_000;
const MAX_METADATA: u64 = 16 * 1024 * 1024;
const MAX_BUFFERED_INPUT: u64 = 64 * 1024 * 1024;
const MAX_BUFFERED_OUTPUT: u64 = 256 * 1024 * 1024;
const MAX_SOLID_INPUT: u64 = 128 * 1024 * 1024;
const MAX_VOLUMES: usize = 128;
const EGG_END: u32 = 0x08E28222;

trait ReadSeek: Read + Seek {}
impl<T: Read + Seek> ReadSeek for T {}

struct DecodedArchive {
    entries: Vec<Entry>,
    source_paths: Vec<PathBuf>,
}

pub(crate) fn main() -> i32 {
    // Bound descriptors even while upstream EGG volume discovery is running.
    #[cfg(unix)]
    unsafe {
        let limit = libc::rlimit {
            rlim_cur: 256,
            rlim_max: 256,
        };
        if libc::setrlimit(libc::RLIMIT_NOFILE, &limit) != 0 {
            return 2;
        }
    }
    let result = (|| {
        let mut data = Vec::new();
        io::stdin()
            .take(MESSAGE_LIMIT + 1)
            .read_to_end(&mut data)
            .map_err(|e| e.to_string())?;
        if data.len() as u64 > MESSAGE_LIMIT {
            return Err("ALZ/EGG request exceeds metadata limit".into());
        }
        let request: Request =
            serde_json::from_slice(&data).map_err(|_| "Invalid ALZ/EGG request".to_string())?;
        dispatch(&request)
    })();
    let code = if result.is_ok() { 0 } else { 1 };
    let response = match result {
        Ok(archive) => Response {
            entries: archive.entries,
            source_paths: archive.source_paths,
            error: None,
        },
        Err(error) => Response {
            entries: Vec::new(),
            source_paths: Vec::new(),
            error: Some(error.chars().take(2000).collect()),
        },
    };
    // Prevent a large listing from building an unbounded JSON buffer.
    let mut output = LimitedOutput(Vec::new());
    if serde_json::to_writer(&mut output, &response).is_err() {
        return 2;
    }
    if io::stdout().write_all(&output.0).is_err() {
        return 2;
    }
    code
}

struct LimitedOutput(Vec<u8>);
impl Write for LimitedOutput {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        if self.0.len() as u64 + data.len() as u64 > MESSAGE_LIMIT {
            return Err(io::Error::other("metadata limit"));
        }
        self.0.extend_from_slice(data);
        Ok(data.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn dispatch(request: &Request) -> Result<DecodedArchive, String> {
    if !request.archive.is_absolute()
        || !fs::metadata(&request.archive)
            .map_err(|e| e.to_string())?
            .is_file()
    {
        return Err("Archive must be an existing regular file".into());
    }
    if let Some(dest) = &request.destination {
        let meta = fs::symlink_metadata(dest).map_err(|e| e.to_string())?;
        if !dest.is_absolute()
            || !meta.is_dir()
            || meta.is_symlink()
            || fs::read_dir(dest)
                .map_err(|e| e.to_string())?
                .next()
                .is_some()
        {
            return Err("ALZ/EGG destination must be an empty private staging directory".into());
        }
        if request.targets.as_ref().is_none_or(|t| t.is_empty()) {
            return Err("No files selected".into());
        }
    }
    match request
        .archive
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("alz") => alz(request),
        Some("egg") => egg(request),
        _ => Err("Unsupported ALZ/EGG format".into()),
    }
}

fn normalize_name(name: &str, directory: bool) -> Result<String, String> {
    let relative = paths::relative(name)?;
    let mut normalized = relative
        .to_str()
        .ok_or("Invalid archive filename")?
        .to_owned();
    if directory {
        normalized.push('/');
    }
    Ok(normalized)
}

fn selection(request: &Request, entries: &[Entry]) -> Result<HashSet<String>, String> {
    paths::validate_entries(entries)?;
    if entries.len() > MAX_ITEMS {
        return Err("ALZ/EGG archive exceeds 100,000 entries".into());
    }
    if entries.iter().any(|e| e.is_link) {
        return Err("Links in ALZ/EGG archives are not supported".into());
    }
    let known: HashSet<_> = entries.iter().map(|e| e.path.clone()).collect();
    let selected = request
        .targets
        .as_ref()
        .map_or_else(|| known.clone(), |t| t.iter().cloned().collect());
    if selected.iter().any(|name| !known.contains(name)) {
        return Err("Selected file is not in the archive".into());
    }
    Ok(selected)
}

fn alz(request: &Request) -> Result<DecodedArchive, String> {
    // Enumerate the conventional ALZ volume names before upstream opens them.
    let name = request.archive.to_str().ok_or("Invalid archive filename")?;
    let prefix = &name[..name.len() - 3];
    let mut size = 0u64;
    let mut source_paths = Vec::new();
    for i in 0..=MAX_VOLUMES {
        let candidate = if i == 0 {
            request.archive.clone()
        } else {
            format!(
                "{prefix}{}{:02}",
                (b'a' + ((i - 1) / 100) as u8) as char,
                (i - 1) % 100
            )
            .into()
        };
        match fs::symlink_metadata(&candidate) {
            Ok(meta) => {
                if i == MAX_VOLUMES {
                    return Err("ALZ archive exceeds 128 volumes".into());
                }
                if !meta.is_file() || meta.is_symlink() {
                    return Err("Invalid ALZ volume".into());
                }
                source_paths.push(candidate.clone());
                size = size
                    .checked_add(meta.len())
                    .ok_or("Archive size overflow")?;
                if size > MAX_EXTRACTED_BYTES {
                    return Err("Archive exceeds 1 TiB input limit".into());
                }
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => break,
            Err(e) => return Err(e.to_string()),
        }
    }
    let mut probe =
        unalz::multivolume::MultiVolumeReader::open(&request.archive).map_err(alz_error)?;
    preflight_alz(&mut probe)?;
    drop(probe);
    let mut archive = unalz::archive::AlzArchive::open(name).map_err(alz_error)?;
    if archive.truncated {
        return Err("Incomplete ALZ archive; a split volume may be missing".into());
    }
    let mut entries = Vec::new();
    for e in &mut archive.entries {
        e.file_name = normalize_name(&e.file_name, e.is_directory())?;
        if e.is_directory() && (e.uncompressed_size != 0 || e.compressed_size != 0) {
            return Err("ALZ directory contains file data".into());
        }
        if matches!(
            e.compression_method,
            unalz::archive::CompressionMethod::Unknown(_)
        ) {
            return Err("Unsupported ALZ compression method".into());
        }
        if matches!(
            e.compression_method,
            unalz::archive::CompressionMethod::Bzip2
        ) && e.compressed_size > MAX_BUFFERED_INPUT
        {
            return Err("ALZ Bzip2 entry exceeds 64 MiB compressed-buffer limit".into());
        }
        entries.push(Entry {
            path: e.file_name.clone(),
            size: e.uncompressed_size,
            compressed_size: Some(e.compressed_size),
            is_encrypted: e.is_encrypted(),
            is_dir: e.is_directory(),
            is_link: false,
            error: None,
        });
    }
    let selected = selection(request, &entries)?;
    if let Some(dest) = &request.destination {
        // Never call extract_all/extract_files: upstream deliberately permits partial recovery.
        for e in archive
            .entries
            .clone()
            .iter()
            .filter(|e| selected.contains(&e.file_name))
        {
            unalz::extract::extract_entry(
                &mut archive,
                e,
                dest,
                request.password.as_deref(),
                false,
            )
            .map_err(alz_error)?;
        }
    }
    Ok(DecodedArchive {
        entries,
        source_paths,
    })
}

fn egg(request: &Request) -> Result<DecodedArchive, String> {
    let source_paths = validate_egg_volumes(&request.archive)?;
    let mut input: Box<dyn ReadSeek> =
        match unegg::volume::MultiVolumeReader::try_open(&request.archive).map_err(egg_error)? {
            Some(reader) => {
                if reader.volume_count() > MAX_VOLUMES {
                    return Err("EGG archive exceeds 128 volumes".into());
                }
                Box::new(reader)
            }
            None => Box::new(File::open(&request.archive).map_err(|e| e.to_string())?),
        };
    preflight_egg(&mut input)?;
    let mut archive = unegg::archive::EggArchive::open(input).map_err(egg_error)?;
    if archive.split_info.as_ref().is_some_and(|s| s.prev_id != 0) {
        return Err("Open the first EGG split volume".into());
    }
    let mut entries = Vec::new();
    let mut packed_total = 0u64;
    let mut block_total = 0usize;
    for e in &mut archive.entries {
        e.file_name = normalize_name(&e.file_name, e.is_directory())?;
        if e.is_directory() && (e.uncompressed_size != 0 || !e.blocks.is_empty()) {
            return Err("EGG directory contains file data".into());
        }
        let mut packed = 0u64;
        let mut decoded = 0u64;
        for b in &e.blocks {
            block_total += 1;
            if block_total > MAX_ITEMS {
                return Err("EGG archive exceeds 100,000 data blocks".into());
            }
            if matches!(
                b.compression_method,
                unegg::archive::CompressionMethod::Unknown(_)
            ) {
                return Err("Unsupported EGG compression method".into());
            }
            if matches!(
                b.compression_method,
                unegg::archive::CompressionMethod::Lzma | unegg::archive::CompressionMethod::Azo
            ) && (u64::from(b.compressed_size) > MAX_BUFFERED_INPUT
                || u64::from(b.uncompressed_size) > MAX_BUFFERED_OUTPUT)
            {
                return Err(
                    "EGG LZMA/AZO block exceeds 64 MiB input / 256 MiB output memory limit".into(),
                );
            }
            packed = packed
                .checked_add(b.compressed_size.into())
                .ok_or("Archive size overflow")?;
            decoded = decoded
                .checked_add(b.uncompressed_size.into())
                .ok_or("Archive size overflow")?;
        }
        if !archive.is_solid && decoded != e.uncompressed_size {
            return Err("EGG file and block sizes disagree".into());
        }
        packed_total = packed_total
            .checked_add(packed)
            .ok_or("Archive size overflow")?;
        entries.push(Entry {
            path: e.file_name.clone(),
            size: e.uncompressed_size,
            compressed_size: Some(packed),
            is_encrypted: e.encrypt_info.is_some(),
            is_dir: e.is_directory(),
            is_link: e.file_attr & 0x08 != 0,
            error: None,
        });
    }
    let selected = selection(request, &entries)?;
    if archive.is_solid {
        if packed_total > MAX_SOLID_INPUT {
            return Err("Solid EGG archive exceeds 128 MiB compressed-buffer limit".into());
        }
        let first = archive
            .entries
            .iter()
            .flat_map(|e| &e.blocks)
            .next()
            .map(|b| b.compression_method);
        if archive
            .entries
            .iter()
            .flat_map(|e| &e.blocks)
            .any(|b| Some(b.compression_method) != first)
        {
            return Err("Mixed compression methods in solid EGG are unsupported".into());
        }
        let total: u64 = entries.iter().map(|e| e.size).sum(); // already checked by validate_entries
        let block_size: u64 = archive
            .entries
            .iter()
            .flat_map(|e| &e.blocks)
            .map(|b| u64::from(b.uncompressed_size))
            .sum();
        if total != block_size {
            return Err("Solid EGG file and block sizes disagree".into());
        }
        if matches!(
            first,
            Some(unegg::archive::CompressionMethod::Lzma | unegg::archive::CompressionMethod::Azo)
        ) && total > MAX_BUFFERED_OUTPUT
        {
            return Err("Solid EGG LZMA/AZO output exceeds 256 MiB memory limit".into());
        }
    }
    if let Some(dest) = &request.destination {
        if archive.is_solid {
            // Upstream directory filters include descendants. Pass only selected regular files;
            // create selected directories separately so selection remains exact.
            let files: Vec<_> = entries
                .iter()
                .filter(|e| !e.is_dir && selected.contains(&e.path))
                .map(|e| e.path.clone())
                .collect();
            for e in entries
                .iter()
                .filter(|e| e.is_dir && selected.contains(&e.path))
            {
                fs::create_dir_all(dest.join(paths::relative(&e.path)?))
                    .map_err(|e| e.to_string())?;
            }
            if !files.is_empty() {
                unegg::extract::extract_files(
                    &mut archive,
                    dest,
                    request.password.as_deref(),
                    false,
                    &files,
                )
                .map_err(egg_error)?;
            }
        } else {
            for e in archive
                .entries
                .clone()
                .iter()
                .filter(|e| selected.contains(&e.file_name))
            {
                unegg::extract::extract_entry(
                    &mut archive,
                    e,
                    dest,
                    request.password.as_deref(),
                    false,
                )
                .map_err(egg_error)?;
            }
        }
    }
    Ok(DecodedArchive {
        entries,
        source_paths,
    })
}

fn validate_egg_volumes(first: &std::path::Path) -> Result<Vec<PathBuf>, String> {
    let mut current = first.to_owned();
    let mut previous = 0;
    let mut seen = HashSet::new();
    let mut total = 0u64;
    let mut source_paths = Vec::new();
    for _ in 0..MAX_VOLUMES {
        let meta = fs::symlink_metadata(&current).map_err(|e| e.to_string())?;
        if !meta.is_file() || meta.is_symlink() {
            return Err("Invalid EGG split volume".into());
        }
        source_paths.push(current.clone());
        total = total
            .checked_add(meta.len())
            .ok_or("EGG volume size overflow")?;
        if total > MAX_EXTRACTED_BYTES {
            return Err("Archive exceeds 1 TiB input limit".into());
        }
        let mut file = File::open(&current).map_err(|e| e.to_string())?;
        let mut s = Scan::new(&mut file)?;
        if s.u32()? != 0x41474745 {
            return Err("Not an EGG archive".into());
        }
        s.data::<2>()?;
        let id = s.u32()?;
        s.data::<4>()?;
        if !seen.insert(id) {
            return Err("Cyclic EGG split volumes".into());
        }
        let mut next = 0;
        let mut has_split = false;
        loop {
            let sig = s.u32()?;
            if sig == EGG_END {
                break;
            }
            let (_, size) = s.extra()?;
            if sig == 0x24F5A262 {
                if size != 8 || has_split {
                    return Err("Invalid EGG split metadata".into());
                }
                if s.u32()? != previous {
                    return Err(
                        "Open the first EGG split volume, with all matching volumes present".into(),
                    );
                }
                next = s.u32()?;
                has_split = true;
            } else {
                s.skip(size, true)?;
            }
        }
        if previous != 0 && !has_split {
            return Err("Missing EGG split metadata".into());
        }
        if next == 0 {
            return Ok(source_paths);
        }
        previous = id;
        let mut matching = None;
        for item in fs::read_dir(first.parent().ok_or("Missing EGG volume directory")?)
            .map_err(|e| e.to_string())?
        {
            let path = item.map_err(|e| e.to_string())?.path();
            if !path.is_file() {
                continue;
            }
            let mut header = [0; 10];
            if File::open(&path)
                .and_then(|mut f| f.read_exact(&mut header))
                .is_err()
            {
                continue;
            }
            if &header[..4] != b"EGGA"
                || u32::from_le_bytes(header[6..10].try_into().unwrap()) != next
            {
                continue;
            }
            if fs::symlink_metadata(&path)
                .map_err(|e| e.to_string())?
                .is_symlink()
            {
                return Err("Symlinked EGG split volumes are unsupported".into());
            }
            if matching.replace(path).is_some() {
                return Err("Ambiguous EGG split volume identifiers".into());
            }
        }
        current = matching.ok_or("Missing EGG split volume")?;
    }
    Err("EGG archive exceeds 128 volumes".into())
}

fn alz_error(e: unalz::error::AlzError) -> String {
    if matches!(
        e,
        unalz::error::AlzError::PasswordNotSet | unalz::error::AlzError::InvalidPassword
    ) {
        "PASSWORD_REQUIRED".into()
    } else {
        format!("ALZ: {e}")
    }
}
fn egg_error(e: unegg::error::EggError) -> String {
    if matches!(
        e,
        unegg::error::EggError::PasswordNotSet | unegg::error::EggError::InvalidPassword
    ) {
        "PASSWORD_REQUIRED".into()
    } else {
        format!("EGG: {e}")
    }
}

/// Header scan before upstream allocates entry lists or length-prefixed fields.
struct Scan<'a, R: Read + Seek + ?Sized> {
    reader: &'a mut R,
    end: u64,
    metadata: u64,
    items: usize,
    blocks: usize,
}
impl<'a, R: Read + Seek + ?Sized> Scan<'a, R> {
    fn new(reader: &'a mut R) -> Result<Self, String> {
        let end = reader.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
        if end > MAX_EXTRACTED_BYTES {
            return Err("Archive exceeds 1 TiB input limit".into());
        }
        reader.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        Ok(Self {
            reader,
            end,
            metadata: 0,
            items: 0,
            blocks: 0,
        })
    }
    fn data<const N: usize>(&mut self) -> Result<[u8; N], String> {
        self.metadata = self
            .metadata
            .checked_add(N as u64)
            .ok_or("Metadata size overflow")?;
        if self.metadata > MAX_METADATA {
            return Err("ALZ/EGG metadata exceeds 16 MiB limit".into());
        }
        let mut out = [0; N];
        self.reader
            .read_exact(&mut out)
            .map_err(|_| "Incomplete archive or missing split volume".to_string())?;
        Ok(out)
    }
    fn u32(&mut self) -> Result<u32, String> {
        Ok(u32::from_le_bytes(self.data()?))
    }
    fn bytes(&mut self, size: u64) -> Result<Vec<u8>, String> {
        self.metadata = self
            .metadata
            .checked_add(size)
            .ok_or("Metadata size overflow")?;
        if self.metadata > MAX_METADATA {
            return Err("ALZ/EGG metadata exceeds 16 MiB limit".into());
        }
        let mut bytes = vec![0; size as usize];
        self.reader
            .read_exact(&mut bytes)
            .map_err(|_| "Incomplete archive or missing split volume".to_string())?;
        Ok(bytes)
    }
    fn skip(&mut self, size: u64, metadata: bool) -> Result<(), String> {
        if metadata {
            self.metadata = self
                .metadata
                .checked_add(size)
                .ok_or("Metadata size overflow")?;
        }
        if self.metadata > MAX_METADATA {
            return Err("ALZ/EGG metadata exceeds 16 MiB limit".into());
        }
        let pos = self.reader.stream_position().map_err(|e| e.to_string())?;
        let target = pos.checked_add(size).ok_or("Archive size overflow")?;
        if target > self.end {
            return Err("Incomplete archive or missing split volume".into());
        }
        self.reader
            .seek(SeekFrom::Start(target))
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    fn extra(&mut self) -> Result<(u8, u64), String> {
        let flags = self.data::<1>()?[0];
        let size = if flags & 1 == 0 {
            u16::from_le_bytes(self.data()?) as u64
        } else {
            self.u32()? as u64
        };
        Ok((flags, size))
    }
    fn item(&mut self) -> Result<(), String> {
        self.items += 1;
        if self.items > MAX_ITEMS {
            return Err("ALZ/EGG archive exceeds 100,000 entries".into());
        }
        Ok(())
    }
    fn done(&mut self) -> Result<bool, String> {
        Ok(self.reader.stream_position().map_err(|e| e.to_string())? == self.end)
    }
}

fn preflight_alz(reader: &mut unalz::multivolume::MultiVolumeReader) -> Result<(), String> {
    let tail = *reader.tail();
    let mut s = Scan::new(reader)?;
    if s.u32()? != 0x015a4c41 {
        return Err("Not an ALZ archive".into());
    }
    s.data::<4>()?;
    let mut finished = false;
    let mut decoded_names = 0u64;
    while !s.done()? {
        match s.u32()? {
            0x015a4c42 => {
                s.item()?;
                let head = s.data::<9>()?;
                let len = u16::from_le_bytes([head[0], head[1]]) as u64;
                if len == 0 || len > 4096 {
                    return Err("Invalid ALZ filename length".into());
                }
                let width = match head[7] & 0xf0 {
                    0 => 0,
                    0x10 => 1,
                    0x20 => 2,
                    0x40 => 4,
                    0x80 => 8,
                    _ => return Err("Invalid ALZ size field".into()),
                };
                let mut packed = 0u64;
                if width > 0 {
                    s.data::<6>()?;
                    let mut a = [0; 8];
                    let mut b = [0; 8];
                    for byte in a.iter_mut().take(width) {
                        *byte = s.data::<1>()?[0];
                    }
                    for byte in b.iter_mut().take(width) {
                        *byte = s.data::<1>()?[0];
                    }
                    packed = u64::from_le_bytes(a);
                    if u64::from_le_bytes(b) > MAX_EXTRACTED_BYTES {
                        return Err("ALZ entry exceeds 1 TiB decoded limit".into());
                    }
                }
                let name = unalz::encoding::cp949_to_utf8(&s.bytes(len)?);
                decoded_names += name.len() as u64;
                if decoded_names > MAX_METADATA {
                    return Err("Decoded ALZ filenames exceed 16 MiB metadata limit".into());
                }
                if name.chars().any(char::is_control) {
                    return Err("Unsafe ALZ filename".into());
                }
                paths::relative(&name)?;
                if head[7] & 1 != 0 {
                    s.data::<12>()?;
                }
                s.skip(packed, false)?;
            }
            0x015a4c43 => {
                s.data::<12>()?;
            }
            0x025a4c43 => {
                finished = true;
                break;
            }
            0x015a4c45 => {
                s.skip(
                    (u32::from_le_bytes(tail[4..8].try_into().unwrap()) as u64).saturating_sub(4),
                    true,
                )?;
            }
            0x035a4c43 => {}
            _ => return Err("Invalid ALZ archive structure".into()),
        }
    }
    if !finished {
        return Err("Incomplete ALZ archive; a split volume may be missing".into());
    }
    Ok(())
}

fn preflight_egg(reader: &mut dyn ReadSeek) -> Result<(), String> {
    let mut s = Scan::new(reader)?;
    if s.u32()? != 0x41474745 {
        return Err("Not an EGG archive".into());
    }
    s.data::<10>()?;
    let mut last_end = false;
    // Account for the names upstream constructs when resolving relative parent IDs.
    // A small repeated parent header must not expand into hundreds of MiB of names.
    let mut names: HashMap<u32, (Option<u32>, usize)> = HashMap::new();
    let mut file_id = None;
    while !s.done()? {
        let sig = s.u32()?;
        last_end = sig == EGG_END;
        match sig {
            0x0A8590E3 => {
                s.item()?;
                let id = s.u32()?;
                if names.insert(id, (None, 0)).is_some() {
                    return Err("Duplicate EGG file identifier".into());
                }
                file_id = Some(id);
                let size = u64::from_le_bytes(s.data()?);
                if size > MAX_EXTRACTED_BYTES {
                    return Err("EGG entry exceeds 1 TiB decoded limit".into());
                }
            }
            0x02B50C13 => {
                s.blocks += 1;
                if s.blocks > MAX_ITEMS {
                    return Err("EGG archive exceeds 100,000 blocks".into());
                }
                let h = s.data::<14>()?;
                let packed = u32::from_le_bytes(h[6..10].try_into().unwrap());
                if s.u32()? != EGG_END {
                    return Err("Invalid EGG data block".into());
                }
                s.skip(packed.into(), false)?;
            }
            EGG_END => {}
            0x0A8591AC => {
                let (flags, size) = s.extra()?;
                if flags & 0x04 != 0 {
                    return Err("Encrypted EGG filenames are not supported".into());
                }
                if size == 0 || size > 4102 {
                    return Err("Invalid EGG filename length".into());
                }
                let mut remaining = size;
                let locale = if flags & 0x08 != 0 {
                    remaining = remaining.checked_sub(2).ok_or("Invalid EGG filename")?;
                    Some(u16::from_le_bytes(s.data()?))
                } else {
                    None
                };
                let parent = if flags & 0x10 != 0 {
                    remaining = remaining.checked_sub(4).ok_or("Invalid EGG filename")?;
                    Some(s.u32()?)
                } else {
                    None
                };
                let data = s.bytes(remaining)?;
                let name = unegg::encoding::decode_filename(flags & 0x08 != 0, locale, &data);
                // Upstream normalizes absolute paths and controls; reject them before that repair.
                if name.chars().any(char::is_control) {
                    return Err("Unsafe EGG filename".into());
                }
                paths::relative(&name)?;
                let id = file_id.ok_or("EGG filename has no file header")?;
                let entry = names.get_mut(&id).unwrap();
                if entry.1 != 0 {
                    return Err("Duplicate EGG filename field".into());
                }
                *entry = (parent, name.len());
            }
            0x1EE922E5 => {
                let (_, size) = s.extra()?;
                if size < 20 {
                    return Err("Invalid EGG POSIX metadata".into());
                }
                let mode = s.u32()? & 0xf000;
                if !matches!(mode, 0 | 0x8000 | 0x4000) {
                    return Err("Special files and links in EGG are unsupported".into());
                }
                s.skip(size - 4, true)?;
            }
            0x08D144A8 => return Err("Encrypted EGG archive headers are not supported".into()),
            0x08D1470F => {
                let (_, size) = s.extra()?;
                if size == 0 || size > 256 {
                    return Err("Invalid EGG encryption metadata".into());
                }
                let method = s.data::<1>()?[0];
                let candidates: &[u64] = match method {
                    0 => &[16],
                    1 | 5 => &[20, 10],
                    2 | 6 => &[28, 18],
                    _ => return Err("Unsupported EGG encryption method".into()),
                };
                let start = s.reader.stream_position().map_err(|e| e.to_string())?;
                let declared = size - 1;
                let mut lengths = Vec::new();
                if candidates.contains(&declared) {
                    lengths.push(declared);
                }
                lengths.extend(candidates.iter().copied());
                let mut chosen = None;
                for len in lengths {
                    if start + len + 4 <= s.end {
                        s.reader
                            .seek(SeekFrom::Start(start + len))
                            .map_err(|e| e.to_string())?;
                        let mut bytes = [0; 4];
                        s.reader.read_exact(&mut bytes).map_err(|e| e.to_string())?;
                        if u32::from_le_bytes(bytes) == EGG_END {
                            chosen = Some(len);
                            break;
                        }
                    }
                }
                s.reader
                    .seek(SeekFrom::Start(start))
                    .map_err(|e| e.to_string())?;
                s.skip(chosen.ok_or("Invalid EGG encryption metadata")?, true)?;
            }
            0x24F5A262 | 0x24E5A060 | 0x04C63672 | 0x2C86950B | 0x07463307 | 0xFFFF0000 => {
                let (_, size) = s.extra()?;
                s.skip(size, true)?;
            }
            _ => return Err("Invalid EGG archive structure".into()),
        }
    }
    if !last_end {
        return Err("Incomplete EGG archive or missing split volume".into());
    }
    let mut expanded_names = 0u64;
    for (&id, &(parent, len)) in &names {
        if len == 0 {
            return Err("EGG file has no filename".into());
        }
        expanded_names += len as u64;
        if let Some(parent) = parent {
            let &(grandparent, parent_len) =
                names.get(&parent).ok_or("Missing EGG parent directory")?;
            if parent == id || grandparent.is_some() {
                return Err("Nested relative EGG parent identifiers are not supported".into());
            }
            expanded_names += parent_len as u64 + 1;
        }
        if expanded_names > MAX_METADATA {
            return Err("Resolved EGG filenames exceed 16 MiB metadata limit".into());
        }
    }
    s.reader
        .seek(SeekFrom::Start(0))
        .map_err(|e| e.to_string())?;
    Ok(())
}
