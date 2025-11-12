// url =
//     /exec?name=tom&age=100&msg=hello
//{
//   "parameter": {
//     "name": "tom",
//     "msg": "hello",
//     "age": "21"
//   },
//   "contextPath": "",
//   "contentLength": -1,
//   "parameters": {
//     "msg": [
//       "hello"
//     ],
//     "age": [
//       "21"
//     ],
//     "name": [
//       "tom"
//     ]
//   },
//   "queryString": "name=tom&age=21&msg=hello"
// }
use serde::Deserialize;

use std::collections::{BTreeMap, HashMap};

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")] // JSONのcamelCaseをRustのsnake_caseに自動マップ
pub struct GasDoGetEvent {
    /// キーに対する単一の値 (e.parameter)
    pub parameter: BTreeMap<String, String>, // HashMapではうまくいかない

    /// コンテキストパス (e.contextPath)
    pub context_path: String,

    /// コンテンツ長 (e.contentLength)
    pub content_length: i64, // -1 を受け取るため i64 (または i32)

    /// キーに対する値の配列 (e.parameters)
    pub parameters: BTreeMap<String, Vec<String>>,

    /// クエリ文字列 (e.queryString)
    pub query_string: String,
}

#[cfg(test)]
mod args_test {
    use crate::args::GasDoGetEvent;
    #[test]
    fn json_parse_test() {
        let json_input = r#"
            {
               "parameter": {
                 "name": "tom",
                 "msg": "hello",
                 "age": "21"
               },
               "contextPath": "",
               "contentLength": -1,
               "parameters": {
                 "msg": [
                   "hello"
                 ],
                 "age": [
                   "21"
                 ],
                 "name": [
                   "tom"
                 ]
               },
               "queryString": "name=tom&age=21&msg=hello"
             }
            "#;

            // JSON文字列をパースして構造体にマッピング
            match serde_json::from_str::<GasDoGetEvent>(json_input) {
                Ok(event) => {
                    println!("パース成功: {:#?}", event);
                    
                    // 値へのアクセス例
                    if let Some(name) = event.parameter.get("name") {
                        println!("\nこんにちは、{}さん！", name);
                    } else {
                        println!("名前が入力されていません")
                    }
                }
                Err(e) => {
                    println!("パース失敗: {}", e);
                }
            }
    }
}
