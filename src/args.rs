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
use std::collections::HashMap;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")] // JSONのcamelCaseをRustのsnake_caseに自動マップ
struct GasDoGetEvent {
    /// キーに対する単一の値 (e.parameter)
    parameter: HashMap<String, String>,

    /// コンテキストパス (e.contextPath)
    context_path: String,

    /// コンテンツ長 (e.contentLength)
    content_length: i64, // -1 を受け取るため i64 (または i32)

    /// キーに対する値の配列 (e.parameters)
    parameters: HashMap<String, Vec<String>>,

    /// クエリ文字列 (e.queryString)
    query_string: String,
}

#[test]
mod args_test {
    #[cfg(test)]
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
                    }
                }
                Err(e) => {
                    println!("パース失敗: {}", e);
                }
            }
    }
}
