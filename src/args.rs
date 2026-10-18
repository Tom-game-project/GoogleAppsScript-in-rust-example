use serde::Deserialize;
use std::collections::BTreeMap;

/// GAS `doPost(e)` の `e.postData` ペイロード定義
#[derive(Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GasPostData {
    #[serde(default)]
    pub contents: String,
    #[serde(default)]
    pub length: i64,
    #[serde(default, rename = "type")]
    pub content_type: String,
    #[serde(default)]
    pub name: String,
}

/// GAS `doGet(e)` / `doPost(e)` のイベント構造体
#[derive(Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GasDoGetEvent {
    /// キーに対する単一の値 (e.parameter)
    #[serde(default)]
    pub parameter: BTreeMap<String, String>,

    /// コンテキストパス (e.contextPath)
    #[serde(default)]
    pub context_path: String,

    /// コンテンツ長 (e.contentLength)
    #[serde(default)]
    pub content_length: i64,

    /// パス情報 (e.pathInfo)
    #[serde(default)]
    pub path_info: Option<String>,

    /// キーに対する値の配列 (e.parameters)
    #[serde(default)]
    pub parameters: BTreeMap<String, Vec<String>>,

    /// クエリ文字列 (e.queryString)
    #[serde(default)]
    pub query_string: String,

    /// POST データ (doPost の場合のみ存在)
    #[serde(default)]
    pub post_data: Option<GasPostData>,

    /// デプロイ済み Web App のベース URL (`ScriptApp.getService().getUrl()`)
    #[serde(default)]
    pub web_app_url: Option<String>,
}

pub type GasDoPostEvent = GasDoGetEvent;

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

        match serde_json::from_str::<GasDoGetEvent>(json_input) {
            Ok(event) => {
                println!("パース成功: {:#?}", event);
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
