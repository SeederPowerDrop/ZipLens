use encoding_rs::EUC_KR;

fn main() {
    let s = "소설(ㄱ)/가까워지는 것에 대한 두려움 [볼프강 슈미트바우어]/가까워지는 것에 대한 두려움 [볼프강 슈미트바우어].txt";
    let (encoded, _, _) = EUC_KR.encode(s);
    std::fs::write("/tmp/test_list_cp949.txt", encoded).unwrap();
}
