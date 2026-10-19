mod args;
pub mod git_server;

mod bindings {
    wit_bindgen::generate!({
        world: "my-world",
        path: "./wit",
        features: ["clocks-timezone"],
        generate_all
    });
}

use args::{GasDoGetEvent, GasDoPostEvent};

use bindings::{Guest, WebResponse};
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
    // doGetはここから入る (Git Smart HTTP v1 の /<project_name>.git/info/refs リクエストおよび Gleam + Lustre Web UI を処理)
    fn rs_do_get(data: String) -> WebResponse {
        let event = match serde_json::from_str::<GasDoGetEvent>(&data) {
            Ok(ev) => ev,
            Err(e) => {
                return WebResponse::Text(
                    gas_content_service::create_text_output(&format!("failed to parse: {}", e))
                        .set_mime_type(MimeType::Text),
                );
            }
        };
        drop(data);
        git_server::handle_do_get(&event)
    }

    // doPostはここから入る (Git Smart HTTP v1 の /<project_name>.git/git-upload-pack / git-receive-pack および Web UI API を処理)
    fn rs_do_post(data: String) -> GasTextOutput {
        let mut event = match serde_json::from_str::<GasDoPostEvent>(&data) {
            Ok(ev) => ev,
            Err(e) => {
                return gas_content_service::create_text_output(&format!(
                    "failed to parse post: {}",
                    e
                ))
                .set_mime_type(MimeType::Text);
            }
        };
        drop(data);
        git_server::handle_do_post(&mut event)
    }

    // GAS エディタから手動で空の Git リポジトリを Google Drive フォルダ内に作成するヘルパー関数（初期コミットは自動生成しない）
    fn git_init_repo(repo: Option<String>) -> String {
        let Some(repo_name) = repo.as_deref().filter(|s| !s.trim().is_empty()) else {
            let msg = "Repository name is required (e.g. git_init_repo('my-project'))".to_string();
            logger::log(&msg);
            return msg;
        };
        match git_server::GasGitStore::create_repository(repo_name, None) {
            Ok(summary) => {
                let msg = format!(
                    "Created empty GAS Git repository '{}' in Google Drive (folder_id={})",
                    summary.folder_name, summary.folder_id
                );
                logger::log(&msg);
                msg
            }
            Err(err) => {
                let msg = format!(
                    "Failed to create GAS Git repository '{}': {}",
                    repo_name, err
                );
                logger::log(&msg);
                msg
            }
        }
    }

    // Web UI (google.script.run) から Google Drive 内の全 Git プロジェクト一覧を JSON として取得
    fn git_list_repos() -> String {
        git_server::list_repos_json(None)
    }

    // Web UI (google.script.run) から Google Drive 内に新規の空 Git リポジトリを作成し最新状態を JSON で返却
    fn git_create_repo(repo: String, description: Option<String>) -> String {
        git_server::create_repo_json(&repo, description.as_deref())
    }

    // Web UI (google.script.run) から指定プロジェクトのコミットログ・参照デコレーションを JSON として取得
    fn git_get_commits(repo: String) -> String {
        git_server::get_commits_json(&repo)
    }

    // Web UI (google.script.run) から指定コミットの変更差分(Diff)およびディレクトリ・ファイルツリー状態を JSON として取得
    fn git_get_commit_detail(repo: String, commit_oid: String) -> String {
        git_server::get_commit_detail_json(&repo, &commit_oid)
    }

    fn scream(input: String) -> String {
        let mut s = input.to_uppercase();
        s.push_str("!!1!");
        s
    }

    fn say_hello(s: String) {
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

        if let Some(value) = properties_service::get_script_properties().get_property(key) {
            logger::log(&format!("key - {} : value - {}", key, value));
            logger::log(&format!(
                "storage used: {}",
                drive_app::gas_drive_app::get_storage_used()
            ));

            if let Some(file) = drive_app::gas_drive_app::get_file_by_id(&value) {
                logger::log(&format!("file name: {}", &file.get_name()));

                let blob = file.get_blob();
                let mut buf = blob.get_bytes();

                logger::log(&format!("byte {:?}", buf));
                buf.push(10);
                blob.set_bytes(&buf);
                file.set_content(&blob.get_data_as_string(None));
                logger::log("Success to set file");
            } else {
                logger::log(&format!("no such file {}", value));
            }
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
        println!("[Rust WASI stdout] Hello from Rust println! in GAS");
        eprintln!("[Rust WASI stderr] Hello from Rust eprintln! in GAS");

        let sys_now = bindings::wasi::clocks::system_clock::now();
        let tz_id = bindings::wasi::clocks::timezone::iana_id();
        let tz_offset = bindings::wasi::clocks::timezone::utc_offset(sys_now);
        logger::log(&format!(
            "WASI system-clock: {}s {}ns, timezone={:?}, utc_offset_ns={:?}",
            sys_now.seconds, sys_now.nanoseconds, tz_id, tz_offset
        ));

        let rand_u64 = bindings::wasi::random::random::get_random_u64();
        let seed = bindings::wasi::random::insecure_seed::get_insecure_seed();
        logger::log(&format!("WASI random u64={}, seed={:?}", rand_u64, seed));

        let envs = bindings::wasi::cli::environment::get_environment();
        let cwd = bindings::wasi::cli::environment::get_initial_cwd();
        logger::log(&format!("WASI environment count: {}, cwd: {:?}", envs.len(), cwd));
        for (k, v) in envs.iter().take(5) {
            logger::log(&format!("  ENV: {} = {}", k, v));
        }
    }
}

bindings::export!(Component with_types_in bindings);
