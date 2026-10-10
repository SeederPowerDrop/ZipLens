use serde::Serialize;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputPath {
    path: String,
    is_directory: bool,
}

/// Inspect the actual filesystem type before deciding whether an input is an archive.
/// Metadata follows symlinks so a directory shortcut is also treated as a directory.
#[tauri::command]
pub fn inspect_input_paths(paths: Vec<String>) -> Result<Vec<InputPath>, String> {
    paths
        .into_iter()
        .map(|path| {
            let metadata = std::fs::metadata(&path)
                .map_err(|error| format!("Cannot inspect input path \"{path}\": {error}"))?;
            Ok(InputPath {
                path,
                is_directory: metadata.is_dir(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_selection_order_and_distinguishes_archive_named_directories() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("photos.zip");
        let file = root.path().join("backup.zip");
        std::fs::create_dir(&directory).unwrap();
        std::fs::write(&file, b"test data").unwrap();
        let paths: Vec<String> = [&directory, &file, &directory]
            .into_iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect();

        let inspected = inspect_input_paths(paths.clone()).unwrap();
        assert_eq!(
            inspected,
            vec![
                InputPath {
                    path: paths[0].clone(),
                    is_directory: true
                },
                InputPath {
                    path: paths[1].clone(),
                    is_directory: false
                },
                InputPath {
                    path: paths[2].clone(),
                    is_directory: true
                },
            ]
        );
        assert_eq!(
            serde_json::to_value(&inspected[0]).unwrap()["isDirectory"],
            true
        );
        assert_eq!(std::fs::read(file).unwrap(), b"test data");
    }

    #[test]
    fn missing_input_reports_the_path_instead_of_returning_a_partial_selection() {
        let root = tempfile::tempdir().unwrap();
        let missing = root
            .path()
            .join("missing.zip")
            .to_string_lossy()
            .into_owned();
        let error = inspect_input_paths(vec![
            root.path().to_string_lossy().into_owned(),
            missing.clone(),
        ])
        .unwrap_err();
        assert!(error.contains(&missing));
        assert!(error.starts_with("Cannot inspect input path"));
    }

    #[test]
    fn empty_input_has_no_filesystem_work() {
        assert_eq!(inspect_input_paths(vec![]).unwrap(), vec![]);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_to_a_directory_is_a_directory_even_with_an_archive_extension() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("photos");
        let link = root.path().join("photos.zip");
        std::fs::create_dir(&directory).unwrap();
        std::os::unix::fs::symlink(&directory, &link).unwrap();
        let inspected = inspect_input_paths(vec![link.to_string_lossy().into_owned()]).unwrap();
        assert!(inspected[0].is_directory);
    }
}
