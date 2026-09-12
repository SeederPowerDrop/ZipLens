//! Finder file associations. Merely querying status never registers an app or changes defaults.
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, path::Path};

#[derive(Deserialize)]
struct Configuration {
    identifier: String,
    bundle: Bundle,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Bundle {
    file_associations: Vec<Association>,
}

#[derive(Deserialize)]
struct Association {
    ext: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct FileAssociationStatus {
    pub extension: String,
    pub is_default: bool,
    /// A failed change or status lookup for this extension; other changes can still succeed.
    pub error: Option<String>,
}

fn configuration() -> Result<Configuration, String> {
    serde_json::from_str(include_str!("../tauri.conf.json"))
        .map_err(|e| format!("Cannot read bundled file associations: {e}"))
}

/// Includes containers that can be opened explicitly, even when they should not become defaults.
pub fn supported_extensions() -> Result<Vec<String>, String> {
    let mut seen = BTreeSet::new();
    Ok(configuration()?
        .bundle
        .file_associations
        .into_iter()
        .flat_map(|association| association.ext)
        .map(|extension| extension.to_ascii_lowercase())
        .filter(|extension| seen.insert(extension.clone()))
        .collect())
}

pub fn is_archive_path(path: &Path) -> bool {
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };
    supported_extensions()
        .map(|extensions| {
            extensions
                .iter()
                .any(|value| value.eq_ignore_ascii_case(extension))
        })
        .unwrap_or(false)
}

fn default_candidates() -> Result<Vec<String>, String> {
    // These files have common system/installer/runtime uses, or an ambiguous numeric suffix.
    // They stay available in the archive picker without taking over their normal Finder action.
    const EXCLUDED: &[&str] = &[
        "iso", "dmg", "img", "jar", "war", "ear", "apk", "ipa", "deb", "rpm", "msi", "exe", "001",
    ];
    Ok(supported_extensions()?
        .into_iter()
        .filter(|extension| !EXCLUDED.contains(&extension.as_str()))
        .collect())
}

fn validate_selection(extensions: Vec<String>, allowed: &[String]) -> Result<Vec<String>, String> {
    if extensions.is_empty() {
        return Err("Select at least one archive extension.".into());
    }
    let mut result = Vec::new();
    for extension in extensions {
        let normalized = extension
            .trim()
            .trim_start_matches('.')
            .to_ascii_lowercase();
        if !allowed.contains(&normalized) {
            return Err(format!(
                "Unsupported default archive extension: {extension}"
            ));
        }
        if !result.contains(&normalized) {
            result.push(normalized);
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn get_file_associations() -> Result<Vec<FileAssociationStatus>, String> {
    #[cfg(target_os = "macos")]
    {
        native::statuses(&default_candidates()?, &configuration()?.identifier)
    }
    #[cfg(not(target_os = "macos"))]
    Err("Default archive applications can be managed here only on macOS.".into())
}

#[tauri::command]
pub fn set_default_file_associations(
    extensions: Vec<String>,
) -> Result<Vec<FileAssociationStatus>, String> {
    let candidates = default_candidates()?;
    // Validate the complete request before performing any mutation.
    let selected = validate_selection(extensions, &candidates)?;
    #[cfg(target_os = "macos")]
    {
        native::set_defaults(&candidates, &selected, &configuration()?.identifier)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = selected;
        Err("Default archive applications can be managed here only on macOS.".into())
    }
}

#[cfg(target_os = "macos")]
mod native {
    use super::FileAssociationStatus;
    use std::{
        collections::BTreeMap,
        ffi::{c_char, c_void, CStr, OsString},
        os::unix::ffi::OsStringExt,
        path::{Path, PathBuf},
        ptr,
    };

    type CFRef = *const c_void;
    const UTF8: u32 = 0x08000100;
    const ALL_ROLES: u32 = u32::MAX;
    const BUNDLE_REQUIRED: &str =
        "APP_BUNDLE_REQUIRED: Open the built ZipLens .app (preferably from Applications) to change Finder defaults.";

    // Signatures and ownership follow Apple's CoreFoundation and LaunchServices headers.
    // These C APIs also support older macOS releases supported by the application.
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(value: CFRef);
        fn CFStringCreateWithBytes(
            allocator: CFRef,
            bytes: *const u8,
            length: isize,
            encoding: u32,
            external: u8,
        ) -> CFRef;
        fn CFStringGetLength(value: CFRef) -> isize;
        fn CFStringGetMaximumSizeForEncoding(length: isize, encoding: u32) -> isize;
        fn CFStringGetCString(value: CFRef, buffer: *mut c_char, size: isize, encoding: u32) -> u8;
        fn CFBundleGetMainBundle() -> CFRef;
        fn CFBundleGetIdentifier(bundle: CFRef) -> CFRef;
        fn CFBundleCopyBundleURL(bundle: CFRef) -> CFRef;
        fn CFBundleCopyExecutableURL(bundle: CFRef) -> CFRef;
        fn CFURLGetFileSystemRepresentation(
            url: CFRef,
            resolve_against_base: u8,
            buffer: *mut u8,
            size: isize,
        ) -> u8;
    }

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        static kUTTagClassFilenameExtension: CFRef;
        fn UTTypeCreatePreferredIdentifierForTag(
            tag_class: CFRef,
            tag: CFRef,
            conforming_to: CFRef,
        ) -> CFRef;
        fn LSCopyDefaultRoleHandlerForContentType(content_type: CFRef, role: u32) -> CFRef;
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CFRef,
            role: u32,
            bundle_identifier: CFRef,
        ) -> i32;
        fn LSRegisterURL(url: CFRef, update: u8) -> i32;
    }

    /// Only values returned from CoreFoundation Create/Copy functions belong in this wrapper.
    struct Owned(CFRef);
    impl Owned {
        fn created(value: CFRef, error: &str) -> Result<Self, String> {
            if value.is_null() {
                Err(error.into())
            } else {
                Ok(Self(value))
            }
        }

        fn string(value: &str) -> Result<Self, String> {
            Self::created(
                unsafe {
                    CFStringCreateWithBytes(
                        ptr::null(),
                        value.as_ptr(),
                        value.len() as isize,
                        UTF8,
                        0,
                    )
                },
                "Cannot create a macOS string.",
            )
        }
    }

    impl Drop for Owned {
        fn drop(&mut self) {
            unsafe { CFRelease(self.0) };
        }
    }

    // Callers supply a live CFStringRef, either borrowed or held by Owned.
    fn string_value(value: CFRef) -> Result<String, String> {
        if value.is_null() {
            return Err("macOS returned an empty string.".into());
        }
        let capacity = unsafe { CFStringGetMaximumSizeForEncoding(CFStringGetLength(value), UTF8) }
            .checked_add(1)
            .filter(|capacity| *capacity > 0)
            .ok_or("Cannot decode a macOS string.")?;
        let mut buffer = vec![0u8; capacity as usize];
        if unsafe { CFStringGetCString(value, buffer.as_mut_ptr().cast(), capacity, UTF8) } == 0 {
            return Err("Cannot decode a macOS string.".into());
        }
        CStr::from_bytes_until_nul(&buffer)
            .map_err(|error| error.to_string())?
            .to_str()
            .map(String::from)
            .map_err(|error| error.to_string())
    }

    fn content_type(extension: &str) -> Result<Owned, String> {
        let tag = Owned::string(extension)?;
        let uti = Owned::created(
            unsafe {
                UTTypeCreatePreferredIdentifierForTag(
                    kUTTagClassFilenameExtension,
                    tag.0,
                    ptr::null(),
                )
            },
            "macOS could not resolve this archive file type.",
        )?;
        let identifier = string_value(uti.0)?;
        // Never apply a per-extension request to a generic parent type.
        if [
            "public.item",
            "public.data",
            "public.content",
            "public.composite-content",
            "public.archive",
            "public.disk-image",
            "public.executable",
        ]
        .contains(&identifier.as_str())
        {
            return Err(format!("macOS resolved .{extension} to the broad type {identifier}; its default was not changed."));
        }
        Ok(uti)
    }

    fn is_default(extension: &str, bundle_identifier: &str) -> Result<bool, String> {
        let uti = content_type(extension)?;
        let handler = unsafe { LSCopyDefaultRoleHandlerForContentType(uti.0, ALL_ROLES) };
        if handler.is_null() {
            return Ok(false);
        }
        let handler = Owned(handler);
        Ok(string_value(handler.0)?.eq_ignore_ascii_case(bundle_identifier))
    }

    pub(super) fn statuses(
        extensions: &[String],
        bundle_identifier: &str,
    ) -> Result<Vec<FileAssociationStatus>, String> {
        Ok(extensions
            .iter()
            .map(|extension| {
                let result = is_default(extension, bundle_identifier);
                FileAssociationStatus {
                    extension: extension.clone(),
                    is_default: matches!(&result, Ok(true)),
                    error: result.err(),
                }
            })
            .collect())
    }

    fn url_path(url: CFRef) -> Result<PathBuf, String> {
        let mut buffer = vec![0u8; 32_768];
        if unsafe {
            CFURLGetFileSystemRepresentation(url, 1, buffer.as_mut_ptr(), buffer.len() as isize)
        } == 0
        {
            return Err(BUNDLE_REQUIRED.into());
        }
        let path = CStr::from_bytes_until_nul(&buffer).map_err(|_| BUNDLE_REQUIRED)?;
        Ok(PathBuf::from(OsString::from_vec(path.to_bytes().to_vec())))
    }

    fn packaged_bundle(bundle_identifier: &str) -> Result<Owned, String> {
        let bundle = unsafe { CFBundleGetMainBundle() };
        if bundle.is_null()
            || string_value(unsafe { CFBundleGetIdentifier(bundle) })
                .ok()
                .as_deref()
                != Some(bundle_identifier)
        {
            return Err(BUNDLE_REQUIRED.into());
        }
        let bundle_url = Owned::created(unsafe { CFBundleCopyBundleURL(bundle) }, BUNDLE_REQUIRED)?;
        let executable_url = Owned::created(
            unsafe { CFBundleCopyExecutableURL(bundle) },
            BUNDLE_REQUIRED,
        )?;
        let bundle_path = url_path(bundle_url.0)?
            .canonicalize()
            .map_err(|_| BUNDLE_REQUIRED)?;
        let executable = url_path(executable_url.0)?
            .canonicalize()
            .map_err(|_| BUNDLE_REQUIRED)?;
        let current = std::env::current_exe()
            .and_then(|path| path.canonicalize())
            .map_err(|_| BUNDLE_REQUIRED)?;
        if bundle_path.extension() != Some(std::ffi::OsStr::new("app"))
            || executable != current
            || executable.parent() != Some(bundle_path.join(Path::new("Contents/MacOS")).as_path())
        {
            return Err(BUNDLE_REQUIRED.into());
        }
        Ok(bundle_url)
    }

    pub(super) fn set_defaults(
        candidates: &[String],
        selected: &[String],
        bundle_identifier: &str,
    ) -> Result<Vec<FileAssociationStatus>, String> {
        // Refuse development binaries before registering or changing any Launch Services state.
        let bundle_url = packaged_bundle(bundle_identifier)?;
        let identifier = Owned::string(bundle_identifier)?;
        let registration = unsafe { LSRegisterURL(bundle_url.0, 1) };
        if registration != 0 {
            return Err(format!(
                "macOS could not register this application (error {registration})."
            ));
        }
        let mut failures = BTreeMap::new();
        let mut changed_types: BTreeMap<String, Result<(), String>> = BTreeMap::new();
        for extension in selected {
            let result = (|| {
                let uti = content_type(extension)?;
                let key = string_value(uti.0)?;
                // Several extensions can be aliases of the same macOS content type.
                changed_types
                    .entry(key)
                    .or_insert_with(|| {
                        let status = unsafe {
                            LSSetDefaultRoleHandlerForContentType(uti.0, ALL_ROLES, identifier.0)
                        };
                        if status == 0 {
                            Ok(())
                        } else {
                            Err(format!(
                                "macOS could not change the default (error {status})."
                            ))
                        }
                    })
                    .clone()
            })();
            if let Err(error) = result {
                failures.insert(extension.as_str(), error);
            }
        }
        let mut result = statuses(candidates, bundle_identifier)?;
        for status in &mut result {
            if let Some(error) = failures.remove(status.extension.as_str()) {
                status.error = Some(error);
            } else if selected.contains(&status.extension)
                && !status.is_default
                && status.error.is_none()
            {
                status.error = Some("macOS has not confirmed the new default. Refresh the status or change this extension using Finder's Get Info > Open with > Change All.".into());
            }
        }
        Ok(result)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn core_foundation_strings_round_trip() {
            let value = Owned::string("ZipLens — 압축 파일").unwrap();
            assert_eq!(string_value(value.0).unwrap(), "ZipLens — 압축 파일");
        }

        #[test]
        fn development_executable_cannot_register_itself() {
            assert!(packaged_bundle("com.ziplens.astra").is_err());
        }

        #[test]
        fn zip_type_lookup_is_read_only_and_specific() {
            let uti = content_type("zip").unwrap();
            assert!(!string_value(uti.0).unwrap().is_empty());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_extensions_drive_archive_detection() {
        for extension in supported_extensions().unwrap() {
            assert!(is_archive_path(Path::new(&format!(
                "archive.{}",
                extension.to_uppercase()
            ))));
        }
        assert!(!is_archive_path(Path::new("notes.txt")));
        assert!(!is_archive_path(Path::new("archive")));
    }

    #[test]
    fn default_candidates_exclude_containers_and_numeric_parts() {
        let candidates = default_candidates().unwrap();
        assert!(candidates.contains(&"zip".to_string()));
        for excluded in ["iso", "dmg", "jar", "apk", "001"] {
            assert!(!candidates.contains(&excluded.to_string()));
        }
    }

    #[test]
    fn selection_is_normalized_and_deduplicated() {
        let allowed = vec!["zip".into(), "7z".into()];
        assert_eq!(
            validate_selection(vec![" .ZIP ".into(), "zip".into(), "7Z".into()], &allowed).unwrap(),
            allowed
        );
    }

    #[test]
    fn empty_or_partially_invalid_selection_fails_before_writes() {
        let allowed = vec!["zip".into()];
        assert!(validate_selection(vec![], &allowed).is_err());
        assert!(validate_selection(vec!["zip".into(), "dmg".into()], &allowed).is_err());
        assert!(validate_selection(vec!["../zip".into()], &allowed).is_err());
    }
}
