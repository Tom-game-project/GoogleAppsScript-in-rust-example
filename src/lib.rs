mod args;

mod bindings {
    wit_bindgen::generate!({
        world: "my-world",
        path: "./wit",
        features: ["clocks-timezone"],
        generate_all
    });
}

use args::GasDoGetEvent;

use bindings::Guest;
use bindings::example::resouceex::example_resource;
use bindings::gas::content_service::{
    gas_content_service,
    gas_text_output::{GasTextOutput, MimeType},
};
use bindings::gas::drive_app;
use bindings::gas::html_service::{
    gas_html_output::{GasHtmlOutput, HtmlSource, SandboxMode},
    gas_html_service,
};
use bindings::gas::logger::logger;
use bindings::gas::property::properties_service;
use bindings::gas::spreadsheet_app;
use bindings::gas::spreadsheet_app::gas_range;
use bindings::gas::urlfetchapp::gas_url_fetch_app;
use bindings::gas::utilities::gas_utilities::{self, BinaryOrStringInput, DigestAlgorithm};

struct Component;

// Guestトレイトが、ホストに公開する関数
impl Guest for Component {
    // doGetはここから入る
    fn rs_do_get(data: String) -> GasTextOutput {
        match serde_json::from_str::<GasDoGetEvent>(&data) {
            Ok(event) => gas_content_service::create_text_output(&format!("{:?}", event))
                .set_mime_type(MimeType::Text),
            Err(e) => gas_content_service::create_text_output(&format!("failed to parse: {}", e))
                .set_mime_type(MimeType::Text),
        }
    }

    fn scream(input: String) -> String {
        let mut s = input.to_uppercase();
        s.push_str("!!1!");
        s
    }

    fn say_hello(s: String) {
        // ホスト側(jsの機能)をRustで使用する
        logger::log(&format!("+++ {} +++", &s));
        logger::log(&logger::get_log());
    }

    fn resource_example() {
        let a = example_resource::ExampleList::new();
        a.append("hello").append("world");
        logger::log(&format!("hello world {}", a.to_string()));
    }

    fn helloworld_example() {
        logger::log("hello world");
    }

    fn get_script_properties_example() {
        let key = "FILE_ID";

        // プロパティサービスの取得
        if let Some(value) = properties_service::get_script_properties().get_property(key) {
            logger::log(&format!("key - {} : value - {}", key, value));
            logger::log(&format!(
                "storage used: {}",
                drive_app::gas_drive_app::get_storage_used()
            ));

            let file = drive_app::gas_drive_app::get_file_by_id(&value)
                .expect(&format!("no such file {}", value));
            logger::log(&format!("file name: {}", &file.get_name()));

            let blob = file.get_blob();
            let mut buf = blob.get_bytes();

            logger::log(&format!("byte {:?}", buf));
            buf.push(10); // 改行を追加
            blob.set_bytes(&buf);
            file.set_content(&blob.get_data_as_string(None));
            logger::log("Success to set file");
        } else {
            logger::log(&format!("no such key: {}", key));
        }
    }

    fn spreadsheet_example() {
        let key = "SPREADSHEET_ID";
        if let Some(value) = properties_service::get_script_properties().get_property(key) {
            if let Some(spreadsheet) = spreadsheet_app::gas_spreadsheet_app::open_by_id(&value) {
                logger::log(&format!("spreadsheet opened! spreadsheet id:{}", value));
                let sheet_name = "sheet1";
                if let Some(sheet) = spreadsheet.get_sheet_by_name(sheet_name) {
                    logger::log("sheet opened!");
                    for i in sheet.get_data_range().get_values() {
                        for j in i {
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
                                gas_range::CellValue::DateValue(d) => {
                                    logger::log(&format!("date {:?}", d));
                                }
                                _ => {
                                    logger::log("otherwise");
                                }
                            }
                        }
                    }
                } else {
                    logger::log(&format!("no such sheet name {}", sheet_name));
                }
            } else {
                logger::log("no such spreadsheet");
            }
        } else {
            logger::log(&format!("no such key: {}", key));
        }
    }

    fn variant_func00() -> bindings::CellValue {
        // variant型をjsとやり取りする際の方法
        bindings::CellValue::StringValue("hello world".to_string())
    }

    fn http_request_test() {
        let res = gas_url_fetch_app::fetch("https://jsonplaceholder.typicode.com/posts/1", None);
        let res_text = res.get_content_text(None);
        logger::log(&res_text);
    }

    fn utilities_example() {
        let uuid = gas_utilities::get_uuid();
        let encoded = gas_utilities::base64_encode(&BinaryOrStringInput::Text(
            "Hello GAS from Rust!".to_string(),
        ));
        let decoded = gas_utilities::base64_decode(&encoded, None);
        let digest = gas_utilities::compute_digest(
            DigestAlgorithm::Sha256,
            &BinaryOrStringInput::Bytes(decoded),
        );
        logger::log(&format!(
            "uuid={}, base64={}, sha256_len={}",
            uuid,
            encoded,
            digest.len()
        ));
    }

    fn html_service_example() -> GasHtmlOutput {
        let html = HtmlSource::Html("<h1>Hello from Rust Wasm Component</h1>".to_string());
        gas_html_service::create_html_output(Some(html))
            .set_title("Rust GAS App")
            .set_sandbox_mode(SandboxMode::Iframe)
    }

    fn wasi_showcase_example() {
        // 1. Rust標準の println! / eprintln! (wasm32-wasip2 の wasi:cli/stdout, stderr 経由で Logger.log / console.error に出力)
        println!("[Rust WASI stdout] Hello from Rust println! in GAS");
        eprintln!("[Rust WASI stderr] Hello from Rust eprintln! in GAS");

        // 2. wasi:clocks/system-clock@0.3.2 & wasi:clocks/timezone@0.3.2 (Date.now() および Session.getScriptTimeZone() に連動)
        let sys_now = bindings::wasi::clocks::system_clock::now();
        let tz_id = bindings::wasi::clocks::timezone::iana_id();
        let tz_offset = bindings::wasi::clocks::timezone::utc_offset(sys_now);
        logger::log(&format!(
            "WASI system-clock: {}s {}ns, timezone={:?}, utc_offset_ns={:?}",
            sys_now.seconds, sys_now.nanoseconds, tz_id, tz_offset
        ));

        // 3. wasi:random/{random, insecure, insecure-seed}@0.3.2 (Utilities.getUuid + SHA-256 CSPRNG / Math.random)
        let rand_u64 = bindings::wasi::random::random::get_random_u64();
        let seed = bindings::wasi::random::insecure_seed::get_insecure_seed();
        logger::log(&format!("WASI random u64={}, seed={:?}", rand_u64, seed));

        // 4. wasi:cli/environment@0.3.2 (GAS Script Properties を環境変数として取得)
        let envs = bindings::wasi::cli::environment::get_environment();
        let cwd = bindings::wasi::cli::environment::get_initial_cwd();
        logger::log(&format!("WASI environment count: {}, cwd: {:?}", envs.len(), cwd));
        for (k, v) in envs.iter().take(5) {
            logger::log(&format!("  ENV: {} = {}", k, v));
        }
    }
}

bindings::export!(Component with_types_in bindings);
