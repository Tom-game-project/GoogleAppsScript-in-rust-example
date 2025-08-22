mod bindings;

use bindings::Guest;

use bindings::wasi::logging::logging::log;

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
        log(
            bindings::wasi::logging::logging::Level::Info,
            &String::from("stdout"), 
            &format!("+++ {} +++", &s)
        );
    }
}

bindings::export!(Component with_types_in bindings);
