mod bindings;

use bindings::example::resouceex::example_resource;
use bindings::gas::drive_app::gas_drive_app::GasDriveApp;
use bindings::gas::logger::*;
use bindings::gas::property::*;
use bindings::Guest;

struct Component;

// Guestトレイトが、ホストに公開する関数
impl Guest for Component {
    fn scream(input: String) -> String {
        let mut s = input.to_uppercase();
        s.push_str("!!1!");
        s.into()
    }

    fn say_hello(s: String) 
    {
        // ホスト側(jsの機能)をRustで使用する
        logger::log(&format!("+++ {} +++", &s));
        logger::log(&logger::get_log());
    }

    fn my_func00()
    {
        let a = example_resource::ExampleList::new();
        a 
            .append("hello")
            .append("world");
        logger::log(&format!("hello world {}", a.to_string()));
    }

    fn my_func01()
    {
        let a = GasDriveApp::new();
        logger::log(&format!("storage {}", a.get_storage_used()));

        let file = &a.get_file_by_id("1SBGJr6jusew1MKhir_sQNC1XLYXMgNA6");

        logger::log(
            &format!("file name: {}", &file.get_name())
        );

        let blob = file.get_blob();
        let mut buf = blob.get_bytes();

        logger::log(&format!("byte {:?}", buf));
        buf.push(10); // 改行を追加
        blob.set_bytes(&buf);
        file.set_content(&blob.get_data_as_string());
    }

    fn my_func02()
    {
        let key = "hello";
        // プロパティサービスの取得
        if let Some(value) =
            properties_service::get_script_properties()
                .get_property(key)
        {
            logger::log(&format!("key - {} : value - {}", key, value));
        }
        else 
        {
            logger::log(&format!("no such key: {}", key));
        }
    }
}

bindings::export!(Component with_types_in bindings);
