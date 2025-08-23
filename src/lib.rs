mod bindings;

use bindings::example::resouceex::example_resource;
use bindings::gas::logger::*;
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

    fn my_func()
    {
        let a = example_resource::ExampleList::new();
        a 
            .append("hello")
            .append("world");
        logger::log(&format!("hello world {}", a.to_string()));
    }
}

bindings::export!(Component with_types_in bindings);
