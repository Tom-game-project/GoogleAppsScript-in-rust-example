mod bindings;

use bindings::example::resouceex::example_resource;
use bindings::gas::drive_app::gas_drive_app::GasDriveApp;
use bindings::gas::logger::*;
use bindings::gas::property::*;
use bindings::gas::spreadsheet_app;
use bindings::gas::spreadsheet_app::gas_range;
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
        logger::log("hello world");
    }

    fn my_func02()
    {
        let key = "FILE_ID";
        // プロパティサービスの取得
        if let Some(value) =
            properties_service::get_script_properties()
                .get_property(key)
        {
            logger::log(&format!("key - {} : value - {}", key, value));

            let a = GasDriveApp::new();
            logger::log(&format!("storage used: {}", a.get_storage_used()));

            let file = &a.get_file_by_id(&value);

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
        else 
        {
            logger::log(&format!("no such key: {}", key));
        }
    }

    fn my_func03()
    {
        let key = "SPREADSHEET_ID";
        if let Some(value) = 
            properties_service::get_script_properties().get_property(key)
        {
            if let Some(spreadsheet) = spreadsheet_app::gas_spreadsheet_app::open_by_id(&value) {
                logger::log(&format!("sheet id {}", spreadsheet.get_id()));
                let sheet_name = "sheet1";
                if let Some (sheet) =spreadsheet.get_sheet_by_name(sheet_name)
                {
                    for i in sheet.get_data_range().get_values()
                    {
                        for j in i
                        {
                            match j {
                                gas_range::CellValue::Empty => {
                                    logger::log("Empty");
                                }
                                gas_range::CellValue::StringValue(s) => {
                                    logger::log(&format!("string {}", s));
                                }
                                gas_range::CellValue::NumberValue(n) => {
                                    logger::log(&format!("number {}", n));
                                }
                                gas_range::CellValue::BooleanValue(b) => {
                                    logger::log(&format!("boolean {:?}", b));
                                }
                                _ => {
                                    logger::log("otherwise");
                                }
                            }
                        }
                    }
                }
                else
                {
                    logger::log(&format!("no such sheet name {}", sheet_name));
                }
            }else 
            {
                logger::log("no such spreadsheet");
            }
        }
        else 
        {
            logger::log(&format!("no such key: {}", key));
        }
        
    }

    fn variant_func00() -> bindings::CellValue {
        bindings::CellValue::StringValue("hello world".to_string())
    }
}

bindings::export!(Component with_types_in bindings);
