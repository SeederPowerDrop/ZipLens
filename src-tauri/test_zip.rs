use std::fs;
use zip::ZipArchive;

fn main() {
    let path = "/Users/hyunjinkim/Library/CloudStorage/GoogleDrive-mmx123@gmail.com/내 드라이브/ebooks/[소설5000편].zip";
    let file = fs::File::open(path).unwrap();
    let mut archive = ZipArchive::new(file).unwrap();
    for i in 0..1 {
        let entry = archive.by_index_raw(i).unwrap();
        let raw = entry.name_raw();
        println!("name_raw: {:02X?}", raw);
        println!("name: {}", entry.name());
    }
}
